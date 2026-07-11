// @wtw/core is the pure domain package: it derives models and decisions from
// supplied inputs and must never read process arguments, inspect the working
// directory, spawn commands, touch the filesystem, format terminal output, or
// set exit codes. All effects and interfaces live in @wtw/cli.
//
// Placeholder export; real domain surface is introduced by later tasks.
export const WTW_CORE_PACKAGE = "@wtw/core";

export type { WtwErrorCode, WtwErrorDetails } from "./errors";
export { WtwError } from "./errors";

export type { ManagedBlockScan } from "./exclude/managed-block";
export {
  findManagedBlock,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  reconcileExcludeBlock,
} from "./exclude/managed-block";

export type {
  PredicateResult,
  PrimarySupportConjunct,
  PrimarySupportInput,
  RepositoryContext,
  WorktreeRecord,
} from "./repo/worktree";
export {
  compareWorktreesForWorkspace,
  DETACHED_LABEL_PREFIX,
  isSupportedPrimary,
  normalizeWorktreePath,
  parseWorktreePorcelain,
  SHORT_SHA_LENGTH,
  worktreeDisplayName,
} from "./repo/worktree";
