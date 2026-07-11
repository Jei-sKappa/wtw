// Repository-context resolution for `@wtw/cli`. This is the effectful bridge
// that turns a working directory into the pure `RepositoryContext` the rest of
// the product consumes: it discovers the shared Git common directory and the
// worktree list via structured Git calls, stats the primary path, resolves
// repository-root discovery at the primary, then hands every gathered fact to
// the pure `isSupportedPrimary` predicate in `@wtw/core`. All subprocess and
// filesystem effects stay here; `@wtw/core` stays pure.
//
// Resolution is location-independent: `git worktree list --porcelain` always
// reports the main worktree first regardless of the invocation directory, and
// `--git-common-dir` names the same shared directory from a primary root, a
// nested primary directory, a linked root, or a nested linked directory — so
// all four locations resolve the identical primary/common context (AC-03.1).
//
// Two failure classes are kept distinct (spec "Compatibility and safety
// constraints"): an unsupported platform or an unsupported repository shape is
// a predictable, non-mutating error raised before any write; a Git subprocess
// failure or a post-discovery permission failure is an ordinary
// `git_command_failed`. Resolution itself never writes.

import { stat } from "node:fs/promises";
import path from "node:path";
import {
  isSupportedPrimary,
  normalizeWorktreePath,
  parseWorktreePorcelain,
  type RepositoryContext,
  type WorktreeRecord,
  WtwError,
} from "@wtw/core";
import { revParse, worktreeListPorcelain, worktreeRoot } from "../git/git";
import { type PlatformSupport, resolvePlatformSupport } from "../platform";

/** Options for {@link resolveRepositoryContext}; the platform seam aids testing. */
export interface ResolveOptions {
  /** Platform override; defaults to the current host via `resolvePlatformSupport`. */
  readonly platform?: NodeJS.Platform;
}

/**
 * Whether `absolutePath` exists as a directory. Missing paths (`ENOENT`) or a
 * non-directory (`ENOTDIR`) resolve to `false` — a fact the pure predicate
 * consumes. Any other stat error (e.g. `EACCES` permission denial after
 * discovery) is an ordinary command failure, surfaced as `git_command_failed`.
 */
async function directoryExists(absolutePath: string): Promise<boolean> {
  try {
    const stats = await stat(absolutePath);
    return stats.isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    throw new WtwError(
      "git_command_failed",
      `Failed to stat primary worktree path ${absolutePath}: ${(error as Error).message}`,
      { path: absolutePath },
    );
  }
}

/**
 * Resolve the primary worktree and shared Git common directory from any
 * supported invocation location, enforce the support predicate, and return the
 * resolved context plus worktree records — or throw a predictable, non-mutating
 * error when the platform or repository shape is unsupported.
 */
export async function resolveRepositoryContext(
  cwd: string,
  options: ResolveOptions = {},
): Promise<RepositoryContext> {
  // 1. Platform gate — a deterministic, non-mutating error before any effect.
  const platform: PlatformSupport = resolvePlatformSupport(options.platform);
  if (platform.status === "unsupported") {
    throw new WtwError("unsupported_platform", platform.reason, {
      platform: platform.platform,
    });
  }

  // 2. Read-only discovery via structured Git calls. A non-repository directory
  //    (or any other non-zero Git exit) surfaces here as `git_command_failed`.
  const commonDirRaw = await revParse(cwd, "--git-common-dir");
  const gitCommonDir = normalizeWorktreePath(path.resolve(cwd, commonDirRaw));

  const porcelain = await worktreeListPorcelain(cwd);
  const worktrees: WorktreeRecord[] = parseWorktreePorcelain(porcelain);

  const isBareRepository =
    (await revParse(cwd, "--is-bare-repository")) === "true";

  // 3. Facts the pure predicate needs about the primary record. The primary is
  //    the first non-bare record; when it is absent the predicate fails at the
  //    `primary_record_present` conjunct, so the fs/root facts stay neutral and
  //    no Git call runs against a nonexistent directory.
  const primary = worktrees.find((record) => record.primary);
  const primaryPathExists =
    primary !== undefined ? await directoryExists(primary.path) : false;
  const resolvedRootPath =
    primary !== undefined && primaryPathExists
      ? await worktreeRoot(primary.path)
      : "";

  // 4. Pure support decision over the gathered facts.
  const predicate = isSupportedPrimary({
    context: { primaryPath: primary?.path ?? "", gitCommonDir, worktrees },
    isBareRepository,
    primaryPathExists,
    resolvedRootPath,
  });
  if (!predicate.supported) {
    throw new WtwError(
      "unsupported_repository",
      predicate.reason ?? "Repository shape is unsupported.",
      { conjunct: predicate.failedConjunct },
    );
  }

  // `primary` is defined here: `primary_record_present` passed above.
  return {
    primaryPath: (primary as WorktreeRecord).path,
    gitCommonDir,
    worktrees,
  };
}
