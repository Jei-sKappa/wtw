// Pure Cursor-workspace logic for wtw.
//
// This module is part of `@wtw/core` and must stay effect-free: it computes the
// managed `folders` list from worktree records plus caller-supplied existence
// flags, and performs a JSONC-aware edit of only the top-level `folders`
// property over supplied text. It never reads the filesystem, spawns Git,
// resolves the cwd, or writes anything — the CLI owns reading and writing the
// `<primary>.code-workspace` file.
//
// The folder ordering reuses Task 4's `worktreeDisplayName` label helper and
// `compareWorktreesForWorkspace` comparator verbatim, so the "Cursor workspace"
// ordering (primary first, then display name, then normalized absolute path)
// has a single source of truth. The JSONC edit is delegated to `jsonc-parser`,
// whose `modify` + `applyEdits` performs a surgical, formatting-preserving
// replacement of a single property span.

import {
  applyEdits,
  type FormattingOptions,
  modify,
  type ParseError,
  parse as parseJsonc,
  printParseErrorCode,
  // Import the ESM entry explicitly. `jsonc-parser`'s package `main` is a UMD
  // bundle whose submodules load through lazy `require("./impl/...")` calls that
  // a Node-target bundle cannot resolve at runtime; the ESM entry uses static
  // `import` statements that bundle cleanly into the self-contained CLI.
} from "jsonc-parser/lib/esm/main.js";
import {
  compareWorktreesForWorkspace,
  type WorktreeRecord,
  worktreeDisplayName,
} from "../repo/worktree";

/**
 * One entry in a Cursor workspace `folders` array. `path` is the normalized
 * absolute worktree path. `name` is the display label the workspace shows; the
 * primary entry carries no label (Cursor shows its directory name), while every
 * linked entry is labeled with its branch or `detached@<short-sha>` name.
 */
export interface FolderEntry {
  /** Display label for the folder, omitted for the primary worktree. */
  readonly name?: string;
  /** Normalized absolute filesystem path of the worktree. */
  readonly path: string;
}

/**
 * A worktree record paired with the caller-resolved fact of whether its
 * directory currently exists on disk. Existence is an effect the CLI resolves
 * (a stat) and injects here so this module stays pure.
 */
export interface ManagedWorktreeInput {
  /** The parsed worktree record. */
  readonly record: WorktreeRecord;
  /** Whether the worktree's directory currently exists (CLI stat). */
  readonly exists: boolean;
}

/** Successful JSONC edit: the reconciled workspace document text. */
export interface EditSuccess {
  readonly ok: true;
  /** The full workspace document text after the `folders` edit. */
  readonly text: string;
}

/** Why a JSONC edit could not be produced (so the caller writes nothing). */
export type EditFailureReason = "invalid_jsonc" | "non_object_root";

/** Failed JSONC edit: a structured reason with a human-readable message. */
export interface EditFailure {
  readonly ok: false;
  /** Machine-readable failure classification. */
  readonly reason: EditFailureReason;
  /** Human-readable explanation for diagnostics. */
  readonly message: string;
}

/** Outcome of {@link applyFoldersEdit}: either the new text or a structured error. */
export type EditResult = EditSuccess | EditFailure;

/**
 * Deterministic formatting for the inserted/replaced `folders` value. Using an
 * explicit two-space, LF configuration keeps the edit reproducible so repeated
 * application over already-correct text is byte-stable.
 */
const FORMATTING_OPTIONS: FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: "\n",
};

/**
 * Compute the managed Cursor workspace `folders` list from registered worktrees
 * paired with their existence flags.
 *
 * Only worktrees whose directory currently exists are included; prunable or
 * missing registrations (and the bare repository entry, which has no working
 * directory) are excluded here — they are diagnosed as warnings elsewhere and
 * never pruned by wtw. The primary worktree is first; every remaining entry is
 * labeled with its display name (branch or `detached@<short-sha>`) and sorted by
 * display name and then normalized absolute path, all via the Task 4 helpers.
 */
export function computeManagedFolders(
  worktrees: readonly ManagedWorktreeInput[],
): FolderEntry[] {
  const included = worktrees
    .filter(
      (entry) => entry.exists && !entry.record.prunable && !entry.record.bare,
    )
    .map((entry) => entry.record);

  const sorted = [...included].sort(compareWorktreesForWorkspace);

  return sorted.map((record) =>
    record.primary
      ? { path: record.path }
      : { name: worktreeDisplayName(record), path: record.path },
  );
}

/** Render the parse errors into a single deterministic diagnostic message. */
function describeParseErrors(errors: readonly ParseError[]): string {
  const parts = errors.map(
    (error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`,
  );
  return `Invalid JSONC: ${parts.join("; ")}`;
}

/** Whether a parsed JSON value is a plain (non-null, non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replace only the top-level `folders` property of the supplied workspace JSONC
 * text with `folders`, creating the property when absent.
 *
 * The edit is JSONC-aware: comments, formatting, property order, and every
 * unrelated property are preserved byte-for-byte outside the single edited span.
 * Invalid JSONC, or a top level that is not a plain object, yields a structured
 * {@link EditFailure} instead of a throw so the caller can fail without writing.
 * Editing already-correct text is byte-stable, so the operation is idempotent.
 */
export function applyFoldersEdit(
  jsoncText: string,
  folders: FolderEntry[],
): EditResult {
  const errors: ParseError[] = [];
  const root = parseJsonc(jsoncText, errors, { allowTrailingComma: true });

  if (errors.length > 0) {
    return {
      ok: false,
      reason: "invalid_jsonc",
      message: describeParseErrors(errors),
    };
  }

  if (!isPlainObject(root)) {
    return {
      ok: false,
      reason: "non_object_root",
      message:
        "Workspace document must have a top-level JSON object; found a non-object root.",
    };
  }

  const edits = modify(jsoncText, ["folders"], folders, {
    formattingOptions: FORMATTING_OPTIONS,
  });
  return { ok: true, text: applyEdits(jsoncText, edits) };
}

/**
 * Produce the minimal valid workspace document carrying `folders`, for the
 * missing-file recreate path. It is generated through the same JSONC edit
 * machinery as {@link applyFoldersEdit}, so re-running `applyFoldersEdit` over
 * the scaffold with the same folders is a byte-stable no-op.
 */
export function minimalWorkspaceScaffold(folders: FolderEntry[]): string {
  const result = applyFoldersEdit("{}\n", folders);
  // "{}\n" is always a valid plain-object top level, so this branch always holds.
  return result.ok ? result.text : "{}\n";
}
