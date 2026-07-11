### Task 9: Core — workspace folder calculation and JSONC folders edit

**Objective:** Provide the pure Cursor-workspace logic: compute the managed
`folders` list from worktree records, and edit only the top-level `folders`
property of supplied JSONC while preserving comments, formatting, property order,
and all unrelated properties.

**Input / context:** Depends on Task 1's `@wtw/core` and Task 4's worktree
records, display-name labels, and comparator. Pure over supplied JSONC text (no
fs). Behavior fixed by the spec's "Cursor workspace", "`wtw sync`", and
review-findings decision log
`specs/001/discussions/260711143813Z-review-findings-decision-log.md` P1, P2, P3;
genesis log P17, P22. The JSONC editor library is a Degree of freedom; new-file
formatting is a Degree of freedom provided it is deterministic and idempotent.

**Steps:**
1. Add `packages/core/src/workspace/folders.ts` exporting
   `computeManagedFolders(worktrees): FolderEntry[]`: include every registered
   worktree whose directory currently exists (the caller supplies existence
   flags), primary first, remaining entries labeled by display name
   (branch or `detached@<short-sha>` — reuse Task 4 helpers) and sorted by display
   name then normalized absolute path. Exclude prunable/missing registrations from
   the list (they are diagnosed elsewhere, never pruned here).
2. Add `applyFoldersEdit(jsoncText: string, folders: FolderEntry[]): EditResult`:
   parse the JSONC; require a top-level object; replace only the `folders`
   property (create it if absent) via a JSONC-aware edit that preserves comments,
   formatting, property order, and all unrelated properties byte-for-byte outside
   the edit span; return a structured error (not a throw that loses context) for
   invalid JSONC or a non-object top level so callers can fail without writing.
3. Add `minimalWorkspaceScaffold(folders): string` producing the minimal valid
   workspace document with the current managed folders, for the missing-file
   recreate path.
4. Re-export from `packages/core/src/index.ts`.
5. Add focused unit tests at `packages/core/test/workspace/`: folder-list
   ordering (primary first, then display-name/path sort, detached labels);
   exclusion of prunable/missing registrations; `applyFoldersEdit` preserving a
   comment and an unrelated property while changing only `folders`; invalid JSONC
   and non-object top level returning the structured error without producing
   output; idempotence (editing already-correct JSONC is byte-stable).

**Files modified:** `packages/core/src/workspace/folders.ts` (NEW),
`packages/core/src/index.ts`,
`packages/core/test/workspace/folders.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/core/test/workspace` exits 0, including the
  preservation and idempotence assertions.
- The dependency-boundary test still passes.

**Acceptance criteria:**
- `computeManagedFolders` returns the primary first and every existing linked
  worktree sorted by display name then normalized absolute path, with
  deterministic branch and detached labels, excluding prunable/missing
  registrations. (supports AC-09.4, AC-09.5)
- `applyFoldersEdit` modifies only top-level `folders` and preserves comments,
  formatting, property order, and unrelated properties byte-for-byte outside the
  edit span; invalid JSONC or a non-object top level yields a structured error
  and no output. (supports AC-09.2, AC-09.3)
- `minimalWorkspaceScaffold` produces a deterministic minimal workspace with the
  current folders. (supports AC-09.6)

**Consumes:** the `WorktreeRecord` types, the worktree display-name helper, and
the comparator from Task 4.

**Produces:** `computeManagedFolders(worktrees): FolderEntry[]`,
`applyFoldersEdit(jsoncText: string, folders: FolderEntry[]): EditResult`,
`minimalWorkspaceScaffold(folders): string`, all from `@wtw/core`.
