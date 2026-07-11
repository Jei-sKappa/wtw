// `wtw init` — initialize local automation for a supported repository.
//
// The command runs a COMPLETE predictable-conflict preflight FIRST, accumulating
// every predictable conflict and writing NOTHING until it fully passes (spec's
// "`wtw init`" section; decision logs P16/P18/P24/P25). Only after a clean
// preflight does it create missing scaffolds, reconcile the managed
// `info/exclude` block, and run the same internal blocking synchronization as
// `wtw sync` with Cursor closed. A healthy rerun is a no-op apart from
// reconciliation. An unexpected filesystem failure mid-write reports every
// completed write and exits 1 without attempting a broad destructive rollback.
//
// `init` neither launches Cursor nor invokes Worktrunk (hence never grants or
// mutates approval): the dependency preflight RESOLVES executables on `PATH`
// without spawning them, and the synchronization runs with `open: false`.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "@commander-js/extra-typings";
import {
  applyFoldersEdit,
  checkIncludeEntries,
  checkReservedHooks,
  findManagedBlock,
  REQUIRED_INCLUDE_ENTRIES,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
  REQUIRED_INCLUDE_WT_TOML,
  type RepositoryContext,
  WORKTREEINCLUDE_SCAFFOLD,
  WT_TOML_SCAFFOLD,
  WtwError,
} from "@wtw/core";
import {
  reconcileManagedExclude,
  type ScaffoldAction,
  scaffoldIfAbsent,
} from "../artifacts/scaffold-writer";
import { checkRequiredExecutables } from "../deps";
import { lsFilesTracked } from "../git/git";
import { resolveRepositoryContext } from "../repo/resolve";
import { workspaceFileName, workspacePathFor } from "../workspace/write";
import { formatSyncResult, runSync } from "./sync";

/** Test-only write-fault injection: throw immediately after the named step's
 * write completes, proving completed writes are reported and left in place
 * (never rolled back). Production runs never set it. */
const FAIL_AFTER_ENV = "WTW_TEST_FAIL_AFTER";

/** One predictable preflight conflict: a one-line summary plus optional detail. */
interface Conflict {
  /** Concise one-line description of the conflict. */
  readonly summary: string;
  /** Multi-line detail (e.g. the exact TOML additions to make), if any. */
  readonly detail?: string;
}

/** Read a file's UTF-8 bytes, or `null` when it does not exist. */
async function readMaybe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The canonical private paths (relative to the primary) `wtw` manages. */
function canonicalPrivatePaths(primaryPath: string): string[] {
  return [
    REQUIRED_INCLUDE_WT_TOML,
    REQUIRED_INCLUDE_WORKTREEINCLUDE,
    workspaceFileName(primaryPath),
  ];
}

/** The dependency-presence conflicts, one per unresolved required executable. */
async function dependencyConflicts(): Promise<Conflict[]> {
  const statuses = await checkRequiredExecutables();
  return statuses
    .filter((status) => !status.found)
    .map((status) => ({
      summary: `Required executable not found on PATH: ${status.label} (\`${status.binary}\`).`,
    }));
}

/** Privacy conflicts: any required private path already tracked by Git. */
async function privacyConflicts(
  context: RepositoryContext,
): Promise<Conflict[]> {
  const privatePaths = canonicalPrivatePaths(context.primaryPath);
  const tracked = await lsFilesTracked(context.primaryPath, privatePaths);
  if (tracked.size === 0) {
    return [];
  }
  const trackedList = privatePaths.filter((p) => tracked.has(p)).join(", ");
  return [
    {
      summary: `Required private path(s) tracked by Git: ${trackedList}. Local excludes cannot hide tracked files; untrack them (e.g. \`git rm --cached <path>\`) before running init.`,
    },
  ];
}

/** Worktrunk-TOML conflicts: unparseable, or missing/conflicting reserved hooks. */
async function worktrunkConflicts(primaryPath: string): Promise<Conflict[]> {
  const tomlPath = path.join(primaryPath, REQUIRED_INCLUDE_WT_TOML);
  const text = await readMaybe(tomlPath);
  if (text === null) {
    return [];
  }
  const result = checkReservedHooks(text);
  if (result.compatible) {
    return [];
  }
  if (result.parseError) {
    return [
      {
        summary: `Existing ${REQUIRED_INCLUDE_WT_TOML} is not valid TOML; fix or remove it before running init.`,
      },
    ];
  }
  return [
    {
      summary: `Existing ${REQUIRED_INCLUDE_WT_TOML} is missing required wtw hooks or uses conflicting commands; add exactly the block(s) below, then rerun init.`,
      detail: result.manualAdditions.replace(/\n+$/, ""),
    },
  ];
}

/** Copy-policy conflicts: an existing `.worktreeinclude` missing a control entry. */
async function copyPolicyConflicts(primaryPath: string): Promise<Conflict[]> {
  const includePath = path.join(primaryPath, REQUIRED_INCLUDE_WORKTREEINCLUDE);
  const text = await readMaybe(includePath);
  if (text === null) {
    return [];
  }
  // Only required-entry FAILs block init; unmatched user entries are WARNs the
  // `check` command surfaces, so an empty ignored-candidate set is sufficient.
  const findings = checkIncludeEntries(text, REQUIRED_INCLUDE_ENTRIES, []);
  const missing = findings.findings
    .filter((finding) => finding.severity === "fail")
    .map((finding) => finding.entry);
  if (missing.length === 0) {
    return [];
  }
  return [
    {
      summary: `Existing ${REQUIRED_INCLUDE_WORKTREEINCLUDE} is missing required control entr${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}.`,
    },
  ];
}

/** Workspace conflicts: an existing workspace file that is not valid JSONC. */
async function workspaceConflicts(primaryPath: string): Promise<Conflict[]> {
  const workspacePath = workspacePathFor(primaryPath);
  const text = await readMaybe(workspacePath);
  if (text === null) {
    return [];
  }
  const edit = applyFoldersEdit(text, []);
  if (edit.ok) {
    return [];
  }
  const name = workspaceFileName(primaryPath);
  const summary =
    edit.reason === "non_object_root"
      ? `The Cursor workspace ${name} must have a top-level JSON object; fix it before running init.`
      : `The Cursor workspace ${name} is not valid JSONC; fix it before running init.`;
  return [{ summary }];
}

/** Managed-exclude conflicts: a malformed (unpaired) managed block. */
async function excludeConflicts(excludePath: string): Promise<Conflict[]> {
  const text = await readMaybe(excludePath);
  if (text === null) {
    return [];
  }
  const scan = findManagedBlock(text);
  if (!scan.malformed) {
    return [];
  }
  return [
    {
      summary: `The managed block in ${path.basename(excludePath)} is malformed (an unpaired marker); repair or remove it before running init.`,
    },
  ];
}

/**
 * Run the COMPLETE preflight, accumulating every predictable conflict in a
 * stable order. Returns all conflicts found; the caller writes nothing when the
 * list is non-empty. Every probe here is read-only.
 */
async function collectConflicts(
  context: RepositoryContext,
): Promise<Conflict[]> {
  const excludePath = path.join(context.gitCommonDir, "info", "exclude");
  const groups = await Promise.all([
    dependencyConflicts(),
    privacyConflicts(context),
    worktrunkConflicts(context.primaryPath),
    copyPolicyConflicts(context.primaryPath),
    workspaceConflicts(context.primaryPath),
    excludeConflicts(excludePath),
  ]);
  return groups.flat();
}

/** Render accumulated conflicts into the single non-mutating preflight message. */
function renderConflicts(conflicts: readonly Conflict[]): string {
  const lines = [
    "init cannot proceed; resolve the following, then rerun (wtw made no changes):",
    ...conflicts.map((conflict) => `  - ${conflict.summary}`),
  ];
  const details = conflicts
    .map((conflict) => conflict.detail)
    .filter((detail): detail is string => detail !== undefined);
  if (details.length > 0) {
    lines.push("", ...details);
  }
  return lines.join("\n");
}

/** Throw the write-fault only when the injected step name matches (test only). */
function faultCheck(step: string): void {
  if (process.env[FAIL_AFTER_ENV] === step) {
    throw new WtwError(
      "init_failed",
      "Simulated filesystem failure during initialization (test only); completed writes were left in place without rollback.",
    );
  }
}

/** The outcome of a successful initialization, for deterministic reporting. */
interface InitReport {
  readonly created: string[];
  readonly preserved: string[];
  readonly excludeReconciled: boolean;
  readonly syncSummary: string;
}

/** Deterministic success report; prints no generic next-step advice. */
function formatInitReport(report: InitReport): string {
  const lines = ["Initialized wtw local automation for this repository."];
  if (report.created.length > 0) {
    lines.push(`Created: ${report.created.join(", ")}`);
  }
  if (report.preserved.length > 0) {
    lines.push(`Preserved: ${report.preserved.join(", ")}`);
  }
  lines.push(
    report.excludeReconciled
      ? "Reconciled the managed info/exclude block."
      : "Managed info/exclude block already up to date.",
  );
  lines.push(report.syncSummary);
  return lines.join("\n");
}

/**
 * Execute `wtw init` end to end: resolve the context, run the complete
 * non-mutating preflight, then (only on a clean preflight) create missing
 * scaffolds, reconcile the managed exclude block, and run the internal blocking
 * synchronization with Cursor closed.
 */
export async function runInit(): Promise<string> {
  // Resolve the supported context first: an unsupported platform or repository
  // shape is itself a predictable, non-mutating error raised before any write.
  const context = await resolveRepositoryContext(process.cwd());

  // Complete preflight — accumulate EVERY predictable conflict, write nothing.
  const conflicts = await collectConflicts(context);
  if (conflicts.length > 0) {
    throw new WtwError("init_preflight_failed", renderConflicts(conflicts));
  }

  // Preflight passed. Create missing scaffolds only, then reconcile and sync.
  // Any failure in this phase reports the writes completed so far and rethrows
  // without a broad destructive rollback.
  const tomlPath = path.join(context.primaryPath, REQUIRED_INCLUDE_WT_TOML);
  const includePath = path.join(
    context.primaryPath,
    REQUIRED_INCLUDE_WORKTREEINCLUDE,
  );
  const excludePath = path.join(context.gitCommonDir, "info", "exclude");

  const created: string[] = [];
  const preserved: string[] = [];
  const note = (action: ScaffoldAction, name: string): void => {
    (action === "created" ? created : preserved).push(name);
  };

  try {
    note(
      await scaffoldIfAbsent(tomlPath, WT_TOML_SCAFFOLD),
      REQUIRED_INCLUDE_WT_TOML,
    );
    faultCheck("wt.toml");

    note(
      await scaffoldIfAbsent(includePath, WORKTREEINCLUDE_SCAFFOLD),
      REQUIRED_INCLUDE_WORKTREEINCLUDE,
    );
    faultCheck("worktreeinclude");

    const excludeAction = await reconcileManagedExclude(
      excludePath,
      canonicalPrivatePaths(context.primaryPath),
    );
    faultCheck("exclude");

    // The SAME internal blocking synchronization as `wtw sync`, Cursor closed:
    // it propagates control files to every linked worktree, creates/adopts the
    // primary workspace, and reconciles its managed `folders`.
    const syncResult = await runSync(context, { open: false });

    return formatInitReport({
      created,
      preserved,
      excludeReconciled: excludeAction === "reconciled",
      syncSummary: formatSyncResult(syncResult),
    });
  } catch (error) {
    if (created.length > 0) {
      process.stdout.write(
        `${[
          "Initialization did not complete. These writes were left in place (no rollback attempted):",
          ...created.map((name) => `  - ${name}`),
        ].join("\n")}\n`,
      );
    }
    throw error;
  }
}

/**
 * `wtw init` — complete predictable-conflict preflight, scaffold creation,
 * managed-exclude reconciliation, and one internal blocking synchronization with
 * Cursor closed.
 */
export function makeInitCommand() {
  return new Command("init")
    .description("Initialize wtw local automation for this repository")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async () => {
      const report = await runInit();
      process.stdout.write(`${report}\n`);
    });
}
