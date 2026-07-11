### Task 12: CLI — `wtw init`

**Objective:** Implement `wtw init`: a complete predictable-conflict preflight
with no writes on any conflict, followed by scaffold creation, managed-exclude
reconciliation, and one internal blocking synchronization (no Cursor open), that
is idempotent on a healthy rerun and reports completed writes on unexpected
failure.

**Input / context:** Depends on Tasks 5 (resolution), 6 (exclude block), 7
(Worktrunk scaffold + hook compat), 8 (copy-policy scaffold), 9 (workspace), and
10 (`runSync`). Behavior fixed by the spec's "`wtw init`", "Canonical local
artifacts", and privacy sections and decision logs
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P16, P18,
P21, P24, P25 and `specs/001/discussions/260711143813Z-review-findings-decision-log.md`
P1. `init` neither grants nor bypasses Worktrunk approval. Predictable failures
are non-mutating.

**Steps:**
1. Add `packages/cli/src/commands/init.ts`. First run the complete preflight,
   accumulating every predictable conflict and writing nothing until it fully
   passes: allowed OS and non-bare repository shape (Task 5); the primary
   predicate (Task 4/5); presence of Git, Worktrunk, Cursor, Node/runtime, and
   the `wtw` executable used by hooks (resolved through `PATH`); every required
   private path untracked by Git (a tracked required path is a privacy conflict —
   abort); valid-or-absent standard artifacts; exact required hooks in an existing
   `.config/wt.toml` via `checkReservedHooks` (Task 7); and validity of existing
   `.worktreeinclude`, workspace JSONC, and managed exclude content.
2. On any predictable conflict, exit 1 with no writes and a concise report;
   include the exact manual TOML additions when the conflict is a
   missing/conflicting reserved hook.
3. After a passing preflight: create missing scaffolds only — `.config/wt.toml`
   (Task 7 scaffold) if absent, `.worktreeinclude` (Task 8 scaffold) if absent,
   the `<repo>.code-workspace` (Task 9 minimal scaffold) if absent — preserving
   any existing compatible file byte-for-byte; reconcile the managed
   `info/exclude` block (Task 6) over the canonical private paths; then run the
   same internal blocking synchronization as `sync` via `runSync(context, { open: false })`.
4. Report created, preserved, synchronized, and unchanged artifacts concisely;
   trigger no approval; print no generic next-step advice. A healthy rerun exits
   0 and is a no-op apart from reconciliation.
5. On unexpected filesystem failure mid-write, report every completed write, exit
   1, and do not attempt broad destructive rollback.
6. Author FR-04 requirement file
   `packages/cli/requirements/functional/04-init.yml` (AC-04.1..04.4) and the
   single authoritative FR-05/FR-06/FR-07 requirement files (`05-privacy.yml`,
   `06-worktrunk-config.yml`, `07-copy-policy.yml`), then add the init-side
   FR-05/FR-06/FR-07 cases plus init-side FR-09 cases against Task 10's
   `09-cursor-workspace.yml`. E2E cases: each
   enumerated predictable conflict exits 1 leaving the fixture byte-for-byte
   unchanged; on an empty supported repo, `init` creates exactly the canonical
   TOML/include/workspace/managed-exclude content, synchronizes existing linked
   worktrees, launches neither Cursor nor approval, and exits 0; a healthy rerun
   exits 0, preserves user bytes outside managed regions, and makes no semantic
   change beyond reconciliation; an injected post-write failure exits 1 and
   reports the completed writes without broad rollback; a tracked required path
   makes `init` perform no writes; a delimited exclude block is created covering
   the required paths while preserving unrelated `info/exclude` bytes; a missing
   `.config/wt.toml` is scaffolded with the exact commands; an existing TOML with
   all reserved hooks is preserved byte-for-byte; an existing TOML missing a
   reserved hook prints the exact manual additions and, after manual correction,
   reruns successfully without rewriting; the scaffolded `.worktreeinclude` has
   the two required entries and guidance; `init` creates/adopts/fails on the
   workspace JSONC per AC-09.1.

**Files modified:** `packages/cli/src/commands/init.ts`,
`packages/cli/src/artifacts/scaffold-writer.ts` (NEW, applies core scaffolds via
atomic writes),
`packages/cli/requirements/functional/04-init.yml` (NEW),
`packages/cli/requirements/functional/05-privacy.yml` (NEW),
`packages/cli/requirements/functional/06-worktrunk-config.yml` (NEW),
`packages/cli/requirements/functional/07-copy-policy.yml` (NEW),
`packages/cli/test/e2e/cases/*/case.yml` (NEW, FR-04 + init-side FR-05/06/07/09)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test:e2e` exits 0 for all FR-04 and init-side FR-05/06/07/09 cases.
- Each predictable-conflict case asserts the complete fixture is byte-for-byte
  unchanged (output-file equality assertions).
- A rerun case asserts idempotence (second `init` changes nothing beyond
  reconciliation).

**Acceptance criteria:**
- Each predictable conflict exits 1 and leaves the fixture byte-for-byte
  unchanged. (AC-04.1)
- On an empty supported repo, `init` creates exactly the canonical TOML, include,
  workspace, and managed-exclude content, synchronizes linked worktrees, launches
  neither Cursor nor approval, and exits 0. (AC-04.2)
- Rerunning `init` on a healthy setup exits 0, preserves user bytes outside
  managed regions, and makes no semantic change beyond reconciliation. (AC-04.3)
- An injected post-write failure exits 1 and reports completed writes without
  broad rollback. (AC-04.4)
- Init creates/reconciles the delimited exclude block preserving unrelated bytes;
  a tracked required path yields no writes. (AC-05.1, AC-05.2 init side, AC-05.3)
- A missing TOML is scaffolded with the exact commands; an all-hooks TOML is
  preserved byte-for-byte; a missing/conflicting reserved hook yields no writes +
  exact manual additions, then a corrected rerun succeeds without rewriting.
  (AC-06.1, AC-06.2, AC-06.3)
- Init neither invokes nor mutates Worktrunk approval. (AC-06.4 automated side;
  native-approval proof deferred to Task 15)
- The scaffolded `.worktreeinclude` carries the two required entries and
  guidance. (AC-07.1)
- Init creates/adopts/fails-without-writes on the workspace JSONC. (AC-09.1)

**Consumes:** `resolveRepositoryContext` (Task 5); `reconcileExcludeBlock` (Task
6); the Worktrunk scaffold + `checkReservedHooks` (Task 7); the `.worktreeinclude`
scaffold (Task 8); `minimalWorkspaceScaffold` (Task 9); `runSync` and the
atomic-write utility (Task 10); the E2E harness, case conventions, and fake shims
(Task 3).

**Produces:** the implemented `wtw init` command; the scaffold writer
`packages/cli/src/artifacts/scaffold-writer.ts`; the FR-04/FR-05/FR-06/FR-07
requirement manifests.
