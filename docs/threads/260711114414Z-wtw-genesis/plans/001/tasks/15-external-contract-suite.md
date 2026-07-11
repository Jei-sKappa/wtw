### Task 15: External-contract suite (real Worktrunk v0.62.0)

**Objective:** Prove the real Worktrunk lifecycle end-to-end against the built
`wtw` artifact: real initialization, native first-use approval, blocking
ignored-file/control copying, post-start workspace synchronization, removal
invoked from a linked worktree, and post-remove reconciliation — using real Git,
a pinned real Worktrunk v0.62.0 binary, isolated approval state, and a fake
Cursor.

**Input / context:** Depends on Task 14's built artifact and Task 3's harness
(the second, `contract` mode). Behavior fixed by the spec's "Executable behavior
documentation and verification" and "Lifecycle behavior" sections and decision
log `seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P13,
P19, P20, P28. This suite uses the built `wtw` bundle, not the source entrypoint.
The fake Cursor still never opens a GUI. Every rendered case must label its
evidence as real Git / real Worktrunk / simulated Cursor.

**Steps:**
1. Add the contract-mode entry `packages/cli/test/e2e/contract.test.ts` that runs
   the harness in `contract` mode: real `git`, the pinned real Worktrunk v0.62.0
   binary resolved through `PATH` (documented as a prerequisite; the suite skips
   with a clear message when the pinned binary is absent locally, but must run on
   the macOS gate), isolated `HOME`/config/approval state, the built `wtw`
   artifact from `packages/cli/dist`, and the fake Cursor.
2. Author at least one full-lifecycle scenario proving, in order: `wtw init` on a
   real repository; native Worktrunk first-use approval observed in isolated
   approval state (init neither grants nor bypasses it); a real `wt` create
   running the blocking `pre-start` copy so selected ignored data and both control
   files exist before the create command returns; the `post-start`
   `wtw sync --open` reconciling the workspace and the fake Cursor recording the
   exact workspace open; removal invoked from a linked worktree via real
   Worktrunk; and `post-remove` `wtw sync` reconciliation leaving the root
   workspace without the removed path after the background hook completes.
3. Add a case proving native Worktrunk copies selected ignored data and both
   control files from the primary before creation readiness, including when the
   new branch base is a linked-worktree branch.
4. Add a compatibility case running against the real v0.62.0 binary so the
   verified range is backed by a passing real contract before Task 16 renders it
   as supported.
5. Author the FR-13 requirement file
   `packages/cli/requirements/functional/13-lifecycle.yml` (AC-13.1..13.3) and
   register the AC-12.2 real-binary case against the FR-12 file (Task 13). Keep
   the fast repair cases (simulated background failure, `--no-hooks`, raw-Git
   drift repaired via explicit `check`/`sync`) in the fast suite and reference
   them from AC-13.3 — they do not need the real binary.
6. Add a root `test:contract` script running only the contract suite.

**Files modified:** `packages/cli/test/e2e/contract.test.ts` (NEW),
`packages/cli/test/e2e/harness/` (contract-mode wiring if not already present
from Task 3),
`packages/cli/requirements/functional/13-lifecycle.yml` (NEW),
`packages/cli/test/e2e/cases/*/case.yml` (NEW, FR-13 contract + AC-12.2 + fast
repair cases),
`package.json` (root `test:contract` script)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test:contract` exits 0 on macOS with the pinned Worktrunk v0.62.0
  binary present: the full-lifecycle scenario passes.
- The fake-Cursor invocation log records the post-start workspace open exactly
  once with the absolute workspace path; no real GUI process is spawned.
- Rendered contract cases are labeled real Git / real Worktrunk / simulated
  Cursor.

**Acceptance criteria:**
- The real scenario proves selected ignored content exists before a successful
  create returns, and the fake Cursor records the post-start workspace open.
  (AC-13.1)
- Removing from a linked worktree through real Worktrunk leaves the root
  workspace without the removed path after the background hook completes.
  (AC-13.2)
- Fast cases demonstrate repair after simulated background failure, `--no-hooks`,
  and raw-Git drift via explicit `check`/`sync`. (AC-13.3)
- The external-contract suite uses a real v0.62.0 binary and passes. (AC-12.2)
- The real scenario proves native Worktrunk copies selected ignored data and both
  control files from the primary before creation readiness, including a
  linked-worktree branch base. (AC-07.3)
- The real contract case observes native first-use approval in isolated Worktrunk
  state. (AC-06.4 real side)

**Consumes:** the built `wtw` bundle (Task 14); the contract-mode harness and fake
Cursor (Task 3); the implemented `init`/`sync`/`check` commands (Tasks 10-13).

**Produces:** the external-contract suite `contract.test.ts`; the FR-13
requirement manifest; the `test:contract` root script; the real-lifecycle
evidence backing the verified Worktrunk range.
