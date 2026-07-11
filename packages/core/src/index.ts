// @wtw/core is the pure domain package: it derives models and decisions from
// supplied inputs and must never read process arguments, inspect the working
// directory, spawn commands, touch the filesystem, format terminal output, or
// set exit codes. All effects and interfaces live in @wtw/cli.
//
// Placeholder export; real domain surface is introduced by later tasks.
export const WTW_CORE_PACKAGE = "@wtw/core";

export type {
  IncludeFinding,
  IncludeFindingKind,
  IncludeFindings,
  IncludeSeverity,
} from "./copy-policy/entries";
export {
  checkIncludeEntries,
  parseIncludeEntries,
} from "./copy-policy/entries";
export {
  INCLUDE_GUIDANCE_COMMENT,
  REQUIRED_INCLUDE_ENTRIES,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
  REQUIRED_INCLUDE_WT_TOML,
  WORKTREEINCLUDE_SCAFFOLD,
} from "./copy-policy/scaffold";
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
export type {
  EditFailure,
  EditFailureReason,
  EditResult,
  EditSuccess,
  FolderEntry,
  ManagedWorktreeInput,
} from "./workspace/folders";
export {
  applyFoldersEdit,
  computeManagedFolders,
  minimalWorkspaceScaffold,
} from "./workspace/folders";
export type {
  HookCompatResult,
  HookConflict,
  HookConflictKind,
} from "./worktrunk/hooks";
export { checkReservedHooks } from "./worktrunk/hooks";
export type { ReservedHook } from "./worktrunk/scaffold";
export {
  RESERVED_HOOKS,
  renderReservedHooks,
  WT_TOML_SCAFFOLD,
} from "./worktrunk/scaffold";

export type { VersionFinding, VersionSeverity } from "./worktrunk/version";
export { evaluateWorktrunkVersion } from "./worktrunk/version";
