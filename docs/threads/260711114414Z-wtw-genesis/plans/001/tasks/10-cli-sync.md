### Task 10: CLI — `wtw sync`

**Objective:** Implement `wtw sync` (without `--open`): acquire one
repository-wide cross-process lock, atomically propagate the primary control
files to every linked worktree, and atomically reconcile the workspace `folders`
property, proving FR-08 and the sync side of FR-09 with E2E cases.

**Input / context:** Depends on Task 5 (repository resolution), Task 9 (workspace
calculation + JSONC edit), Task 7's version finding not required here, and Task
3's harness. Behavior fixed by the spec's "`wtw sync`" section and decision logs
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P16, P21,
P23 and `specs/001/discussions/260711143813Z-review-findings-decision-log.md` P1,
P3. Lock path/wait/retry/stale threshold, the cross-process locking library, and
the atomic-write utility are Degrees of freedom subject to FR-08. Structured
subprocess args only.

**Steps:**
1. Add `packages/cli/src/fs/atomic-write.ts`: write to a temp file in the target
   directory then rename over the destination, preventing partial canonical,
   linked-control, or workspace files.
2. Add `packages/cli/src/lock.ts`: acquire one repository-wide cross-process lock
   under the Git common directory using the chosen library. Wait a documented
   short timeout; on timeout, write nothing and exit 1. Use the library's
   stale-lock policy with a documented threshold. Always release the lock on both
   success and error paths (try/finally).
3. Add `packages/cli/src/commands/sync.ts` implementing the internal
   synchronization operation `runSync(context, { open }): Promise<SyncResult>`,
   invoked by both `sync` and (later) `init`. While holding the lock:
   (a) atomically copy the primary `.config/wt.toml` and `.worktreeinclude` bytes
   to every linked worktree, overwriting divergent linked control copies (primary
   is authoritative); (b) re-enumerate valid worktrees and compute managed folders
   via Task 9; (c) read the primary workspace file — if absent, recreate the
   minimal scaffold with current folders; if valid JSONC with a top-level object,
   apply the `folders` edit preserving everything else; if invalid JSONC or a
   non-object top level, fail without overwriting; (d) never copy any other
   `.worktreeinclude`-selected path.
4. Wire the `sync` command action (from the Task 2 stub) to resolve context and
   call `runSync(context, { open: options.open })`. In this task, treat `--open`
   as a no-op placeholder that still performs all writes (Task 11 adds the launch
   and its ordering); plain `sync` performs writes and never invokes Cursor.
5. Emit deterministic human-readable success output (wording is a Degree of
   freedom).
6. Add unit tests for the lock (timeout → no writes + exit-style error; release
   on error) and atomic-write (no partial file on simulated mid-write failure)
   under `packages/cli/test/`.
7. Author FR-08 requirement file
   `packages/cli/requirements/functional/08-sync.yml` (AC-08.1..08.5) and the
   single authoritative FR-09 requirement file
   `packages/cli/requirements/functional/09-cursor-workspace.yml` (its sync-side
   criteria; Task 12 adds init-side FR-09 cases against this same file). Add E2E
   cases: control files made byte-identical to
   primary, overwriting divergent linked copies; no other include-selected path
   created/modified; two overlapping sync processes serialize through the lock
   and the final folders derive from the final Git state (no stale snapshot
   written last); lock timeout exits 1 with no writes; injected error releases the
   lock; a recognized stale lock is recoverable; a raw-Git linked worktree gains
   canonical control files and a workspace entry after explicit sync; sync
   modifies only `folders` and preserves surrounding JSONC; invalid JSONC exits 1
   without changing the workspace; a missing workspace is recreated with the
   minimal scaffold and current folders.

**Files modified:** `packages/cli/src/fs/atomic-write.ts` (NEW),
`packages/cli/src/lock.ts` (NEW),
`packages/cli/src/commands/sync.ts`,
`packages/cli/src/workspace/write.ts` (NEW, workspace read/write wiring),
`packages/cli/test/lock.test.ts` (NEW),
`packages/cli/test/fs/atomic-write.test.ts` (NEW),
`packages/cli/requirements/functional/08-sync.yml` (NEW),
`packages/cli/requirements/functional/09-cursor-workspace.yml` (NEW),
`packages/cli/test/e2e/cases/*/case.yml` (NEW, FR-08 + FR-09 sync cases)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/cli/test/lock.test.ts packages/cli/test/fs` exits 0.
- `bun run test:e2e` exits 0 for all FR-08 and sync-side FR-09 cases.
- A concurrency case (two overlapping syncs) is deterministic and the last
  written `folders` matches the final Git state.
- A lock-timeout case asserts no fixture file changed.

**Acceptance criteria:**
- `sync` atomically makes every linked `.config/wt.toml` and `.worktreeinclude`
  byte-identical to the primary, overwriting divergent linked control copies.
  (AC-08.1)
- `sync` creates/modifies no other user-selected `.worktreeinclude` path.
  (AC-08.2)
- Two overlapping syncs serialize through one common-directory lock and finish
  with folders from the final Git state, with no stale snapshot written last.
  (AC-08.3)
- Lock timeout exits 1 without writes; injected errors release the lock; a
  library-recognized stale lock is recoverable per the documented policy.
  (AC-08.4)
- A raw-Git linked worktree is reported as drift, then gains canonical control
  files and a workspace entry after explicit sync. (AC-08.5, with the drift
  report proven by `check` in Task 13)
- Sync modifies only top-level `folders`, preserves surrounding JSONC, fails
  without writing on invalid JSONC, and recreates a missing workspace with the
  minimal scaffold and current folders. (AC-09.2, AC-09.3, AC-09.6 sync parts)

**Consumes:** `resolveRepositoryContext` and the Git wrapper `git.ts` from Task 5;
`computeManagedFolders`, `applyFoldersEdit`, `minimalWorkspaceScaffold` from Task
9; the harness and fake shims from Task 3.

**Produces:** `runSync(context, { open }): Promise<SyncResult>` in
`packages/cli/src/commands/sync.ts` (the internal blocking synchronization
operation reused by `init`); the atomic-write utility
`packages/cli/src/fs/atomic-write.ts`; the repository-wide lock
`packages/cli/src/lock.ts`; the FR-08 and FR-09 requirement manifests.
