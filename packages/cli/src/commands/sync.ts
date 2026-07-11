import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "@commander-js/extra-typings";
import {
  computeManagedFolders,
  type FolderEntry,
  type ManagedWorktreeInput,
  parseWorktreePorcelain,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
  REQUIRED_INCLUDE_WT_TOML,
  type RepositoryContext,
  type WorktreeRecord,
  WtwError,
} from "@wtw/core";
import { launchCursor } from "../cursor/launch";
import { atomicWriteFile } from "../fs/atomic-write";
import { worktreeListPorcelain } from "../git/git";
import { withRepositoryLock } from "../lock";
import { resolveRepositoryContext } from "../repo/resolve";
import { reconcileWorkspace, type WorkspaceAction } from "../workspace/write";

/** The two authoritative control files propagated from the primary worktree. */
const CONTROL_FILES: readonly string[] = [
  REQUIRED_INCLUDE_WT_TOML,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
];

/**
 * Test-only barrier: when set to a filename (resolved against the primary
 * worktree), `runSync` pauses inside the held lock until that file appears. It
 * exists solely to make the FR-08 concurrency E2E case deterministically force
 * two syncs to contend for the one lock; production runs never set it.
 */
const HOLD_UNTIL_ENV = "WTW_TEST_HOLD_UNTIL";
/** Test-only fault injection: throw after the lock is acquired (proves release). */
const FAIL_AFTER_LOCK_ENV = "WTW_TEST_FAIL_AFTER_LOCK";
/** Upper bound on the test barrier wait, so a broken case never hangs forever. */
const HOLD_CAP_MS = 15000;

/** Options controlling a single synchronization run. */
export interface SyncOptions {
  /**
   * Whether `--open` was passed. When `true`, Cursor is launched with the
   * absolute primary workspace path exactly once, strictly after every
   * synchronization write has succeeded (FR-10). When `false`, no launch ever
   * happens.
   */
  readonly open: boolean;
}

/** The outcome of one synchronization run, for deterministic reporting. */
export interface SyncResult {
  /** Absolute primary worktree path. */
  readonly primaryPath: string;
  /** Absolute path of the reconciled workspace file. */
  readonly workspacePath: string;
  /** Whether the workspace file was created, updated, or already correct. */
  readonly workspaceAction: WorkspaceAction;
  /** The reconciled managed folder list. */
  readonly folders: FolderEntry[];
  /** Absolute paths of linked worktrees whose control files were rewritten. */
  readonly linkedUpdated: string[];
  /** Total count of existing linked worktrees considered. */
  readonly linkedTotal: number;
  /** Echo of the `--open` flag; when set, Cursor was launched after the writes. */
  readonly open: boolean;
}

/** Whether `absolutePath` currently exists as a directory. */
async function directoryExists(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}

/** Read a file's bytes as UTF-8, or `null` when it does not exist. */
async function readMaybe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Block inside the held lock until the test barrier file appears (capped). */
async function honorTestBarrier(primaryPath: string): Promise<void> {
  const holdName = process.env[HOLD_UNTIL_ENV];
  if (holdName === undefined || holdName.trim() === "") return;
  const holdPath = path.resolve(primaryPath, holdName);
  const deadline = Date.now() + HOLD_CAP_MS;
  while (Date.now() < deadline) {
    try {
      await access(holdPath);
      return;
    } catch {
      await sleep(25);
    }
  }
}

/**
 * Copy the authoritative primary control files to `linkedPath`, overwriting any
 * divergent linked copy atomically. Returns `true` when at least one file was
 * (re)written. A control file absent from the primary is simply not propagated.
 */
async function propagateControlFiles(
  primaryPath: string,
  linkedPath: string,
): Promise<boolean> {
  let changed = false;
  for (const rel of CONTROL_FILES) {
    const primaryBytes = await readMaybe(path.join(primaryPath, rel));
    if (primaryBytes === null) continue;
    const destPath = path.join(linkedPath, rel);
    const linkedBytes = await readMaybe(destPath);
    if (linkedBytes === primaryBytes) continue;
    await mkdir(path.dirname(destPath), { recursive: true });
    await atomicWriteFile(destPath, primaryBytes);
    changed = true;
  }
  return changed;
}

/**
 * The internal blocking synchronization operation, reused later by `init`.
 *
 * Under one repository-wide lock it (a) makes every existing linked worktree's
 * control files byte-identical to the primary's, (b) re-enumerates the current
 * Git worktrees and computes the managed folder list, and (c) atomically
 * reconciles the primary workspace `folders`. It copies no other
 * `.worktreeinclude`-selected path. On a lock timeout it writes nothing; any
 * error still releases the lock.
 */
export async function runSync(
  context: RepositoryContext,
  options: SyncOptions,
): Promise<SyncResult> {
  const result = await withRepositoryLock(context.gitCommonDir, async () => {
    await honorTestBarrier(context.primaryPath);

    if (process.env[FAIL_AFTER_LOCK_ENV]) {
      throw new WtwError(
        "sync_failed",
        "Injected synchronization failure after acquiring the lock (test only).",
      );
    }

    // Re-enumerate the live Git worktrees while holding the lock so the folder
    // list derives from the final state, never a pre-lock snapshot (AC-08.3).
    const porcelain = await worktreeListPorcelain(context.primaryPath);
    const worktrees = parseWorktreePorcelain(porcelain);

    // (a) Propagate control files to every existing linked worktree.
    const linkedUpdated: string[] = [];
    let linkedTotal = 0;
    for (const record of worktrees) {
      if (record.primary || record.bare || record.prunable) continue;
      if (!(await directoryExists(record.path))) continue;
      linkedTotal += 1;
      if (await propagateControlFiles(context.primaryPath, record.path)) {
        linkedUpdated.push(record.path);
      }
    }

    // (b) Compute managed folders from the re-enumerated worktrees plus their
    // existence facts.
    const managedInputs: ManagedWorktreeInput[] = await Promise.all(
      worktrees.map(async (record: WorktreeRecord) => ({
        record,
        exists: await directoryExists(record.path),
      })),
    );
    const folders = computeManagedFolders(managedInputs);

    // (c) Atomically reconcile the primary workspace `folders`.
    const workspace = await reconcileWorkspace(context.primaryPath, folders);

    return {
      primaryPath: context.primaryPath,
      workspacePath: workspace.workspacePath,
      workspaceAction: workspace.action,
      folders,
      linkedUpdated,
      linkedTotal,
      open: options.open,
    };
  });

  // Launch is gated STRICTLY after every synchronization write has succeeded and
  // the repository lock has been released. Only `sync --open` launches Cursor,
  // exactly once, with the absolute primary workspace path. A launch failure
  // leaves the synchronized files in place (no rollback) and propagates so the
  // command exits 1 (FR-10). `init`, `check`, and plain `sync` never launch.
  if (options.open) {
    await launchCursor(result.workspacePath);
  }

  return result;
}

/** Deterministic, human-readable success report for `wtw sync`. */
export function formatSyncResult(result: SyncResult): string {
  const workspaceName = path.basename(result.workspacePath);
  const lines = [
    `Synchronized control files across ${result.linkedTotal} linked worktree(s) (${result.linkedUpdated.length} updated).`,
    `Workspace ${workspaceName} ${result.workspaceAction} with ${result.folders.length} folder(s).`,
  ];
  return lines.join("\n");
}

/**
 * `wtw sync [--open]` — resolve the repository context and run the internal
 * blocking synchronization. With `--open`, Cursor is launched with the absolute
 * primary workspace path exactly once, strictly after every write succeeds; a
 * launch failure preserves the synchronized files and exits 1 (FR-10).
 */
export function makeSyncCommand() {
  return new Command("sync")
    .description("Synchronize control files and the workspace across worktrees")
    .option("--open", "Open the synchronized workspace in Cursor")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (options) => {
      const context = await resolveRepositoryContext(process.cwd());
      const result = await runSync(context, { open: options.open ?? false });
      process.stdout.write(`${formatSyncResult(result)}\n`);
    });
}
