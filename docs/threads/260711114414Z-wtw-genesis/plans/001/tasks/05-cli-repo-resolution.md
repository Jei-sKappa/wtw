### Task 5: CLI — repository resolution and support boundary

**Objective:** Resolve the primary worktree and common Git directory from any
supported invocation location (primary, linked, nested), enforce the support
predicate with an unsupported-shape error and no writes, and prove it with FR-03
E2E cases.

**Input / context:** Depends on Task 4's pure parsers/predicate and Task 3's
harness. Behavior fixed by the spec's "`wtw init`" resolution paragraph and
"Compatibility and safety constraints" (review findings
`specs/001/discussions/260711143813Z-review-findings-decision-log.md` P4, P8;
genesis log P19, P24, P25). All Git invocation is structured-argument `execa`
(no shell). Git is resolved through `PATH`.

**Steps:**
1. Create `packages/cli/src/git/git.ts` wrapping structured `execa` calls to
   `git`: run from a given cwd, capture stdout, surface non-zero exits as
   `WtwError`. Provide `worktreeListPorcelain(cwd)`, `revParse(cwd, ...args)` for
   `--is-bare-repository`, `--git-common-dir`, `--show-toplevel`, and a
   worktree-root resolution at a given path.
2. Create `packages/cli/src/repo/resolve.ts` exporting
   `resolveRepositoryContext(cwd): Promise<RepositoryContext>`: invoke Git to
   discover the common dir and worktree list, stat the primary path (the fs check
   the core predicate needs), pass the gathered facts into the pure
   `isSupportedPrimary`, and either return the resolved primary/common context +
   worktree records or throw an unsupported-shape `WtwError` naming the failed
   conjunct. Must resolve the same primary/common context whether invoked from
   the primary root, a nested primary directory, a linked root, or a nested
   linked directory.
3. Add platform resolution in `packages/cli/src/platform.ts` exporting
   `resolvePlatformSupport(): PlatformSupport`: detect macOS (verified), Linux
   (allowed, unverified/best-effort), and Windows/other (unsupported), returning
   the status as a value the resolver and `check` consume; an unsupported platform
   is a deterministic error/finding without writes.
4. Distinguish error classes: an unsupported repository shape or platform is a
   predictable, non-mutating error; a read/write permission failure after
   successful discovery is an ordinary command failure. Encode both as `WtwError`
   with distinct codes.
5. Add unit tests at `packages/cli/test/repo/resolve.test.ts` driving the
   resolver with the fake `git` shim to cover each resolution location and each
   predicate failure without touching a real repository.
6. Cover FR-03 behavior as resolver unit tests in
   `packages/cli/test/repo/resolve.test.ts` (step 5): same-context resolution from
   primary root, nested primary, linked root, and nested linked; a repo path
   containing spaces resolving without splitting; a simulated Linux platform
   reporting unverified status; bare, missing-primary, Windows, and
   non-repository directories producing deterministic unsupported/error results
   without writes; each primary predicate failing independently; and a
   post-discovery permission failure as an ordinary command failure. The
   observable FR-03 requirement manifest and E2E cases are authored in Task 13,
   where `wtw check` first surfaces resolution/support-boundary findings
   observably. They are deliberately not authored here: an active FR-03 criterion
   with no E2E case would fail the harness traceability gate this task must keep
   green.

**Files modified:** `packages/cli/src/git/git.ts` (NEW),
`packages/cli/src/repo/resolve.ts` (NEW),
`packages/cli/src/platform.ts` (NEW),
`packages/cli/test/repo/resolve.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/cli/test/repo/resolve.test.ts` exits 0.
- `bun run test:e2e` still exits 0: this task registers no new requirement
  manifest or E2E case, so the harness traceability check is unaffected.
- No resolver unit test that exercises an unsupported-shape or platform error
  path performs a filesystem write (resolution is read-only); the observable
  no-write assertions on unsupported paths live with the FR-03 E2E cases in Task
  13.

**Acceptance criteria:**
- Every product command resolves the same primary/common Git context from the
  primary root, a nested primary directory, a linked root, and a nested linked
  directory. (AC-03.1)
- Repository/worktree paths containing spaces resolve without argument splitting
  or path corruption. (AC-03.2)
- A simulated Linux platform reports unverified/best-effort status without
  claiming suite evidence; bare repositories, missing-primary contexts, Windows,
  and non-repository directories produce deterministic unsupported/error
  findings without writes. (AC-03.3)
- Each primary predicate fails independently without writes; a post-discovery
  permission failure is an ordinary command failure. (AC-03.4)

**Consumes:** `parseWorktreePorcelain`, `isSupportedPrimary`, and worktree types
from Task 4; the fake `git` shim from Task 3.

**Produces:** `resolveRepositoryContext(cwd): Promise<RepositoryContext>` in
`packages/cli/src/repo/resolve.ts`; the Git wrapper `packages/cli/src/git/git.ts`
(`worktreeListPorcelain`, `revParse`, worktree-root resolution); the platform
resolver `resolvePlatformSupport(): PlatformSupport` in
`packages/cli/src/platform.ts`. (The FR-03 requirement manifest and E2E cases are
authored in Task 13.)
