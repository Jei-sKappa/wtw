// Canonical `.worktreeinclude` copy-policy scaffold.
//
// This module is part of `@wtw/core` and must stay effect-free: it exposes the
// scaffold text as pure data. It never reads the filesystem, spawns commands,
// or formats terminal output — the CLI owns writing `.worktreeinclude`.
//
// The scaffold is fixed by the spec's "`.worktreeinclude`" section and decision
// log P5/P16: it lists ONLY the two required control entries plus an editing
// guidance comment. `wtw` never guesses or interactively collects private
// paths, so no user data entries appear here. `entries.ts` checks an existing
// `.worktreeinclude` against these same required control paths, so the two
// required entries below are the single source of truth.

/** The `.config/wt.toml` control entry every `.worktreeinclude` must carry. */
export const REQUIRED_INCLUDE_WT_TOML = ".config/wt.toml";

/** The `.worktreeinclude` control entry every `.worktreeinclude` must carry. */
export const REQUIRED_INCLUDE_WORKTREEINCLUDE = ".worktreeinclude";

/**
 * The two required control entries, in scaffold order. Both are required so
 * native Worktrunk configuration stays discoverable from newly created linked
 * worktrees (spec's "`.worktreeinclude`" section; decision log P5 and P16).
 */
export const REQUIRED_INCLUDE_ENTRIES: readonly string[] = [
  REQUIRED_INCLUDE_WT_TOML,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
];

/** The user-editing guidance comment the scaffold documents. */
export const INCLUDE_GUIDANCE_COMMENT =
  "# Add other ignored files and directories below.";

/**
 * The documented `.worktreeinclude` scaffold `wtw init` writes when the file is
 * absent: the two required control entries, a blank separator, and the editing
 * guidance comment, terminated by a trailing newline. It contains no guessed
 * private-data entries — the user owns and edits the copy policy.
 */
export const WORKTREEINCLUDE_SCAFFOLD = `${REQUIRED_INCLUDE_WT_TOML}\n${REQUIRED_INCLUDE_WORKTREEINCLUDE}\n\n${INCLUDE_GUIDANCE_COMMENT}\n`;
