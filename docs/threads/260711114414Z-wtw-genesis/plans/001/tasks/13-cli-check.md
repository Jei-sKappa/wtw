### Task 13: CLI — `wtw check`

**Objective:** Implement `wtw check`: a read-only aggregate diagnostic that
acquires no lock, opens no Cursor, emits findings under the stable categories in
order with `PASS`/`WARN`/`FAIL` severities and deterministic counts, exits 0 with
only warnings and 1 on any failure, and marks dependent checks skipped instead of
cascading false failures.

**Input / context:** Depends on all prior core findings (Tasks 4, 6, 7, 8, 9),
CLI resolution (Task 5), and `runSync` comparison logic (Task 10); observes but
never mutates state produced by `init`/`sync`. Behavior fixed by the spec's "`wtw check`" section and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P24 (plus
P19, P20 for the compatibility finding). JSON output is excluded. A check
observes one read snapshot and may report transient drift during concurrent sync.

**Steps:**
1. Add `packages/cli/src/commands/check.ts` producing findings under exactly
   these categories, in this order:
   ```text
   Repository
   Dependencies
   Privacy
   Worktrunk
   Copy policy
   Synchronization
   Cursor workspace
   ```
2. For each category, gather findings read-only, reusing the pure evaluators:
   repository shape/predicate + platform (Tasks 4/5); required-executable
   availability (Dependencies); tracked-required-path privacy conflict and the
   managed-exclude block state via `findManagedBlock` (Task 6); Worktrunk
   version via `evaluateWorktrunkVersion` and reserved-hook state via
   `checkReservedHooks` (Task 7); required/optional include entries via
   `checkIncludeEntries` (Task 8); linked-control divergence and workspace-folder
   drift by comparing current state to what `runSync` would produce, and raw-Git
   registration drift (Synchronization); workspace JSONC validity, folder drift,
   and stale/missing registration warnings with native-cleanup guidance (Cursor
   workspace, Task 9).
3. Encode failures and warnings per the spec's enumerations. Exit 0 when no FAIL
   exists (including warnings-only); exit 1 when any FAIL exists. End with
   deterministic severity counts. When a prerequisite is unavailable, mark
   dependent checks skipped rather than emitting cascading false failures.
   Perform no writes, acquire no lock, and never call `launchCursor`.
4. Wire the `check` command action (from the Task 2 stub).
5. Author FR-11 requirement file
   `packages/cli/requirements/functional/11-diagnostics.yml` (AC-11.1..11.4) and
   FR-12 file `packages/cli/requirements/functional/12-compatibility.yml`
   (AC-12.1; AC-12.2 is the real-binary criterion owned by Task 15). Add E2E
   cases: a healthy fixture prints every category in order, only PASS findings,
   deterministic counts, no writes/Cursor call, exit 0; a warning-only fixture
   exits 0; each defined failure fixture exits 1; counts match emitted findings; a
   fixture with an unavailable prerequisite marks dependent checks skipped without
   cascaded failures; a before/after filesystem snapshot proves `check` changes
   nothing; version fixtures `0.62.0`/`0.62.x` pass, below `0.62.0` fails,
   `0.63.0`+ warns, unparseable fails. Also author the FR-03 requirement file
   `packages/cli/requirements/functional/03-repository.yml` (AC-03.1..03.4) and
   its E2E cases here, now that every product command exists: each of `init`,
   `sync`, and `check` invoked successfully from the primary root, a nested
   primary directory, a linked root, and a nested linked directory, all resolving
   the same primary/common context (AC-03.1); a repository path containing spaces
   resolving without splitting (AC-03.2); a simulated Linux platform reporting
   unverified status while bare, missing-primary, Windows, and non-repository
   directories produce deterministic unsupported/error findings without writes
   (AC-03.3); and each primary predicate failing independently without writes plus
   a post-discovery permission failure as an ordinary command failure (AC-03.4).
   Also add the `check`-side drift-report half of AC-08.5 and the
   missing-workspace report of AC-09.6.

**Files modified:** `packages/cli/src/commands/check.ts`,
`packages/cli/src/diagnostics/categories.ts` (NEW, finding aggregation),
`packages/cli/requirements/functional/03-repository.yml` (NEW),
`packages/cli/requirements/functional/11-diagnostics.yml` (NEW),
`packages/cli/requirements/functional/12-compatibility.yml` (NEW),
`packages/cli/test/e2e/cases/*/case.yml` (NEW, FR-03 + FR-11 + FR-12 + check-side FR-08/09 cases)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test:e2e` exits 0 for all FR-11 and FR-12 (AC-12.1) cases and the
  FR-03 resolution/support-boundary cases authored here.
- A before/after snapshot case asserts zero filesystem/state change by `check`.
- A healthy-fixture case asserts the exact category order and deterministic
  counts.

**Acceptance criteria:**
- A healthy fixture prints every stable category in order, only PASS findings,
  deterministic counts, no writes/Cursor call, exit 0. (AC-11.1)
- A warning-only fixture exits 0; each failure fixture exits 1; both print counts
  matching emitted findings. (AC-11.2)
- An unavailable prerequisite marks dependent checks skipped without misleading
  cascaded failures. (AC-11.3)
- A before/after snapshot proves `check` never changes repository, Worktrunk,
  approval, lock, or Cursor state. (AC-11.4)
- `0.62.x` passes, below `0.62.0` and unparseable fail, `0.63.0`+ warns.
  (AC-12.1)
- The FR-03 support-boundary findings (AC-03.1..03.4) are covered by the E2E
  cases authored here, and the `check` side of raw-Git drift (AC-08.5) and
  missing-workspace reporting (AC-09.6) is observed. (FR-03)

**Consumes:** `isSupportedPrimary` and worktree helpers (Task 4);
`resolveRepositoryContext`/platform (Task 5); `findManagedBlock` (Task 6);
`evaluateWorktrunkVersion` + `checkReservedHooks` (Task 7); `checkIncludeEntries`
(Task 8); `computeManagedFolders` + workspace JSONC validation (Task 9); `runSync`
comparison logic (Task 10); the E2E harness, case conventions, and fake
`wt`/`cursor`/`git` shims (Task 3).

**Produces:** the implemented `wtw check` command and its diagnostics aggregator;
the FR-03, FR-11, and FR-12 requirement manifests and their E2E coverage.
