### Task 4: Core — repository and worktree model + Git porcelain parsing

**Objective:** Provide the pure domain layer — repository and worktree data
types, a parser for `git worktree list --porcelain` (and related porcelain
text), and the primary-worktree support predicate — so the CLI resolution layer
can decide support and enumerate worktrees without embedding logic.

**Input / context:** Depends on Task 1's `@wtw/core`. Everything here is pure and
must obey the core purity constraint (no subprocess, no fs, no cwd). Support
predicate fixed verbatim by the spec's "Compatibility and safety constraints"
bullet and review-findings decision log
`specs/001/discussions/260711143813Z-review-findings-decision-log.md` P4. Detached
worktree labels and sort order come from the spec's "Cursor workspace" section
(genesis log P22, review findings P2) — this task supplies the parsed worktree
records those rules will later consume.

**Steps:**
1. Add `packages/core/src/repo/worktree.ts` defining the worktree record type: at
   least normalized absolute path, branch name (or detached HEAD short SHA),
   `bare`/`detached`/`prunable` flags, and whether it is the primary/main record.
   Define a repository-context type carrying the primary worktree path, the Git
   common directory path, and the worktree list.
2. Add `parseWorktreePorcelain(text: string): WorktreeRecord[]` that parses the
   `git worktree list --porcelain` block format (records separated by blank
   lines; `worktree`, `HEAD`, `branch`, `bare`, `detached`, `prunable`/`locked`
   lines). Preserve unusual characters in paths; do not shell-split.
3. Add `isSupportedPrimary(context): PredicateResult` implementing the five
   conjuncts verbatim: repository is non-bare; a main/primary worktree record
   exists; that record is not prunable; its absolute path exists as a directory
   (accept an injected "path exists" boolean/flag from the caller — do not stat
   here, since fs is a CLI concern); and Git repository-root discovery at the
   primary resolves to the same primary path (accept the resolved path as input).
   Return a structured result naming which conjunct failed, for the
   unsupported-shape error and `check` finding.
4. Add a helper to compute a worktree's display name — the full branch name, or
   `detached@<short-sha>` for a detached worktree — and a comparator that sorts by
   display name then normalized absolute path, with the primary forced first.
   (This is consumed later by the workspace calculation in Task 9; define it here
   as pure worktree logic.)
5. Re-export the new types and functions from `packages/core/src/index.ts`.
6. Add focused unit tests at `packages/core/test/repo/worktree.test.ts`: parse a
   multi-record porcelain sample including a detached and a prunable worktree and
   a path containing spaces; each predicate conjunct failing independently
   (bare, absent main, prunable main, missing path, mismatched root); and the
   display-name/label + sort behavior.

**Files modified:** `packages/core/src/repo/worktree.ts` (NEW),
`packages/core/src/index.ts`,
`packages/core/test/repo/worktree.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/core/test/repo` exits 0.
- The dependency-boundary test still passes (no effectful imports introduced).

**Acceptance criteria:**
- `parseWorktreePorcelain` returns correct records for multi-worktree porcelain
  text including detached, prunable, and space-containing-path entries.
- `isSupportedPrimary` independently reports each of the five predicate failures
  (bare, absent main record, prunable main record, missing path, mismatched
  root). (supports AC-03.4)
- Display-name labels use the full branch name or `detached@<short-sha>`, and the
  comparator orders by display name then normalized absolute path with the
  primary first. (supports AC-09.4)

**Consumes:** `@wtw/core` from Task 1.

**Produces:** `parseWorktreePorcelain(text: string): WorktreeRecord[]`,
`isSupportedPrimary(context): PredicateResult`, the worktree display-name and
comparator helpers, and the repository/worktree types, all exported from
`@wtw/core`.
