// Pure repository/worktree domain model for wtw.
//
// This module is part of `@wtw/core` and must stay effect-free: it derives the
// worktree model, the primary-support predicate, and Cursor workspace ordering
// purely from text and injected facts supplied by `@wtw/cli`. It never spawns
// Git, touches the filesystem, reads the cwd, or formats terminal output.
//
// The porcelain parser consumes `git worktree list --porcelain` text; the
// support predicate encodes the five conjuncts fixed by the spec's
// "Compatibility and safety constraints" section; and the display-name helper
// plus comparator encode the "Cursor workspace" ordering (primary first, then
// display name, then normalized absolute path).

/**
 * One record parsed from `git worktree list --porcelain`.
 *
 * `path` is a normalized absolute filesystem path. `branch`, when present, is
 * the full ref reported by Git (e.g. `refs/heads/feature/x`); for a detached
 * worktree it is `undefined` and `head` carries the checked-out commit.
 */
export interface WorktreeRecord {
  /** Normalized absolute filesystem path of the worktree. */
  readonly path: string;
  /** Full branch ref (e.g. `refs/heads/main`), or `undefined` when detached/bare. */
  readonly branch?: string;
  /** Full commit SHA reported on the `HEAD` line, when present. */
  readonly head?: string;
  /** Whether Git reported this record as the bare repository entry. */
  readonly bare: boolean;
  /** Whether the worktree is in detached-HEAD state. */
  readonly detached: boolean;
  /** Whether Git reported the worktree as prunable (its directory is gone). */
  readonly prunable: boolean;
  /** Whether the worktree is locked. */
  readonly locked: boolean;
  /** Whether this is the primary/main worktree record (first, non-bare). */
  readonly primary: boolean;
}

/**
 * Repository context resolved by the CLI and consumed by pure decisions: the
 * primary worktree path, the shared Git common directory, and the full
 * worktree list parsed from porcelain.
 */
export interface RepositoryContext {
  /** Normalized absolute path of the primary worktree. */
  readonly primaryPath: string;
  /** Normalized absolute path of the shared Git common directory. */
  readonly gitCommonDir: string;
  /** All worktree records reported by `git worktree list --porcelain`. */
  readonly worktrees: readonly WorktreeRecord[];
}

/** The full ref prefix stripped to derive a display branch name. */
const BRANCH_REF_PREFIX = "refs/heads/";

/** Prefix used to label a detached worktree in the Cursor workspace. */
export const DETACHED_LABEL_PREFIX = "detached@";

/** Number of leading SHA characters used in a `detached@<short-sha>` label. */
export const SHORT_SHA_LENGTH = 7;

/**
 * Normalize an absolute POSIX-style path deterministically: collapse repeated
 * separators and strip any trailing separator (except the filesystem root).
 * This is a pure string transform — it never resolves against the cwd or the
 * filesystem. Windows is out of scope for the MVP.
 */
export function normalizeWorktreePath(rawPath: string): string {
  const collapsed = rawPath.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.replace(/\/+$/, "");
  }
  return collapsed;
}

interface MutableWorktree {
  path?: string;
  branch?: string;
  head?: string;
  bare: boolean;
  detached: boolean;
  prunable: boolean;
  locked: boolean;
}

function emptyMutable(): MutableWorktree {
  return {
    bare: false,
    detached: false,
    prunable: false,
    locked: false,
  };
}

function finalize(record: MutableWorktree, isFirst: boolean): WorktreeRecord {
  return {
    path: normalizeWorktreePath(record.path ?? ""),
    branch: record.branch,
    head: record.head,
    bare: record.bare,
    detached: record.detached,
    prunable: record.prunable,
    locked: record.locked,
    // Git lists the main worktree first; a bare first entry means there is no
    // primary worktree, so the primary flag stays false in that case.
    primary: isFirst && !record.bare,
  };
}

/**
 * Parse `git worktree list --porcelain` block-format text into worktree
 * records. Records are separated by blank lines; each attribute is a line whose
 * key precedes the first space. Paths and lock/prune reasons keep every
 * character verbatim — this parser never shell-splits.
 */
export function parseWorktreePorcelain(text: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  let current: MutableWorktree | null = null;

  const flush = (): void => {
    if (current !== null && current.path !== undefined) {
      records.push(finalize(current, records.length === 0));
    }
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      flush();
      continue;
    }

    const spaceIndex = line.indexOf(" ");
    const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
    const value = spaceIndex === -1 ? undefined : line.slice(spaceIndex + 1);

    switch (key) {
      case "worktree":
        // A new `worktree` line begins a record; flush any in-flight one first.
        flush();
        current = emptyMutable();
        current.path = value ?? "";
        break;
      case "HEAD":
        if (current !== null && value !== undefined) {
          current.head = value;
        }
        break;
      case "branch":
        if (current !== null && value !== undefined) {
          current.branch = value;
        }
        break;
      case "bare":
        if (current !== null) {
          current.bare = true;
        }
        break;
      case "detached":
        if (current !== null) {
          current.detached = true;
        }
        break;
      case "prunable":
        if (current !== null) {
          current.prunable = true;
        }
        break;
      case "locked":
        if (current !== null) {
          current.locked = true;
        }
        break;
      default:
        // Unknown attribute lines are ignored so forward-compatible Git output
        // does not break parsing.
        break;
    }
  }

  flush();
  return records;
}

/**
 * The Cursor workspace display name for a worktree: the full branch name (with
 * the `refs/heads/` prefix stripped) or `detached@<short-sha>` for a detached
 * worktree.
 */
export function worktreeDisplayName(record: WorktreeRecord): string {
  if (record.detached || record.branch === undefined) {
    const shortSha = (record.head ?? "").slice(0, SHORT_SHA_LENGTH);
    return `${DETACHED_LABEL_PREFIX}${shortSha}`;
  }
  if (record.branch.startsWith(BRANCH_REF_PREFIX)) {
    return record.branch.slice(BRANCH_REF_PREFIX.length);
  }
  return record.branch;
}

/** Deterministic, locale-independent lexicographic string comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Comparator for the managed Cursor workspace `folders` order: the primary is
 * forced first, then entries sort by display name and then normalized absolute
 * path.
 */
export function compareWorktreesForWorkspace(
  a: WorktreeRecord,
  b: WorktreeRecord,
): number {
  if (a.primary !== b.primary) {
    return a.primary ? -1 : 1;
  }
  const byName = compareStrings(worktreeDisplayName(a), worktreeDisplayName(b));
  if (byName !== 0) {
    return byName;
  }
  return compareStrings(a.path, b.path);
}

/** Which of the five primary-support conjuncts failed. */
export type PrimarySupportConjunct =
  | "non_bare"
  | "primary_record_present"
  | "primary_not_prunable"
  | "primary_path_exists"
  | "root_resolves_to_primary";

/**
 * Inputs to the primary-support predicate. `context` holds the parsed model;
 * the remaining fields are facts the CLI resolves through effects (Git bare
 * status, a directory-existence stat, and Git repository-root discovery at the
 * primary path) and injects here so the predicate itself stays pure.
 */
export interface PrimarySupportInput {
  readonly context: RepositoryContext;
  /** Whether Git reports the repository as bare (`--is-bare-repository`). */
  readonly isBareRepository: boolean;
  /** Whether the primary worktree path exists as a directory (CLI stat). */
  readonly primaryPathExists: boolean;
  /** Absolute path Git repository-root discovery resolved at the primary. */
  readonly resolvedRootPath: string;
}

/** Structured outcome of the primary-support predicate. */
export interface PredicateResult {
  /** Whether every conjunct holds. */
  readonly supported: boolean;
  /** The first conjunct that failed, when unsupported. */
  readonly failedConjunct?: PrimarySupportConjunct;
  /** Human-readable reason for the failure, when unsupported. */
  readonly reason?: string;
}

function unsupported(
  failedConjunct: PrimarySupportConjunct,
  reason: string,
): PredicateResult {
  return { supported: false, failedConjunct, reason };
}

/**
 * Evaluate the five spec-fixed conjuncts, verbatim and in order, that a
 * repository's primary worktree must satisfy to be supported:
 *
 * 1. the repository is non-bare;
 * 2. a main/primary worktree record exists;
 * 3. that record is not prunable;
 * 4. its absolute path exists as a directory; and
 * 5. Git repository-root discovery at the primary resolves to the same path.
 *
 * Returns the first failing conjunct (with a message) so the CLI can raise the
 * unsupported-shape error or emit the `check` finding.
 */
export function isSupportedPrimary(
  input: PrimarySupportInput,
): PredicateResult {
  const { context, isBareRepository, primaryPathExists, resolvedRootPath } =
    input;

  if (isBareRepository) {
    return unsupported(
      "non_bare",
      "Repository is bare; wtw supports only non-bare repositories.",
    );
  }

  const primary = context.worktrees.find((record) => record.primary);
  if (primary === undefined) {
    return unsupported(
      "primary_record_present",
      "`git worktree list --porcelain` reported no main/primary worktree record.",
    );
  }

  if (primary.prunable) {
    return unsupported(
      "primary_not_prunable",
      `The primary worktree record is prunable: ${primary.path}`,
    );
  }

  if (!primaryPathExists) {
    return unsupported(
      "primary_path_exists",
      `The primary worktree path does not exist as a directory: ${primary.path}`,
    );
  }

  if (normalizeWorktreePath(resolvedRootPath) !== primary.path) {
    return unsupported(
      "root_resolves_to_primary",
      `Git repository-root discovery resolved to ${normalizeWorktreePath(resolvedRootPath)}, not the primary path ${primary.path}.`,
    );
  }

  return { supported: true };
}
