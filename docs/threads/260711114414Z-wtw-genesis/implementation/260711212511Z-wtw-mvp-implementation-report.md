# Implementation Report — WorkTrunk Wrapper (`wtw`) MVP

Plan executed: `plans/001/` (`plan.md` + `tasks/01..16`).
Source spec: `specs/001/spec.md`.
Run: 16 tasks, all completed, one per orchestration-cycle commit, on `main`
from `467a7fa` (plan commit) through `61d69cc`. Subagent model: Opus
(claude-opus-4-8) for every implementer and reviewer dispatch. Final worktree
clean; the full `bun run test-and-report` gate passes end-to-end on macOS with
the real Worktrunk v0.62.0 binary present.

This report is the starting point for a broader review: the per-task reviews
this run performed were task-scoped gates (each checked one task's diff against
that task), not a review of the change as a whole. Verification against the
spec's acceptance criteria happens downstream and checks the implementation
against the spec, not against the plan — so the deviations below matter.

## Task outcomes (verified verdicts)

| Task | Verdict | Commit | Fix iterations |
|------|---------|--------|----------------|
| 01 Workspace & toolchain scaffold | DONE_WITH_CONCERNS | 9cc970e | 0 |
| 02 CLI skeleton (program/argv/errors/version) | DONE_WITH_CONCERNS | 97b07f7 | 0 |
| 03 E2E harness & living-doc schema foundation | DONE_WITH_CONCERNS | b69eabf | 0 |
| 04 Core repo/worktree model + porcelain parse | DONE_WITH_CONCERNS | 8a3e199 | 0 |
| 05 CLI repository resolution & support boundary | DONE_WITH_CONCERNS | 6f645d0 | 0 |
| 06 Core managed exclude block | **DONE** | e31da30 | 1 (code-quality) |
| 07 Core Worktrunk scaffold/hooks/version | DONE_WITH_CONCERNS | f557eae | 0 |
| 08 Core copy-policy scaffold & entry checks | DONE_WITH_CONCERNS | 89a4851 | 0 |
| 09 Core workspace folders + JSONC edit | DONE_WITH_CONCERNS | 1e9ae91 | 0 |
| 10 CLI `wtw sync` (lock, atomic, folders) | DONE_WITH_CONCERNS | f8a2484 | 0 |
| 11 CLI `wtw sync --open` (Cursor launch) | DONE_WITH_CONCERNS | be1094f | 0 |
| 12 CLI `wtw init` (preflight/scaffold/sync) | DONE_WITH_CONCERNS | 92a5531 | 0 |
| 13 CLI `wtw check` (read-only diagnostics) | DONE_WITH_CONCERNS | a7e6869 | 0 |
| 14 Build, SHA injection, symlink install | DONE_WITH_CONCERNS | b3dfb39 | 0 |
| 15 External-contract suite (real Worktrunk v0.62.0) | DONE_WITH_CONCERNS | 105016f | 0 |
| 16 Living-doc generator, traceability, full gate | DONE_WITH_CONCERNS | 61d69cc | 0 |

No task reached `BLOCKED` or `NEEDS_CONTEXT`. Every cycle committed. Both
review lanes (plan-compliance and code-quality) passed for every task; the sole
fix loop was Task 06 (one code-quality iteration, an orchestrator-escalated
data-loss edge, resolved and re-reviewed clean).

Per-task subagent audit: each task ran 1 implementer + 1 merged reviewer except
Task 06 (2 implementers + 2 merged reviewers). The full per-task audit trail
(claimed vs verified status, dispatch counts, per-lane fix iterations,
concerns verbatim) lives in the run ledger
`.wip/implement/plans-001/progress.md` and in each commit message body.

## Final gate status (verified by the orchestrator)

- `bun run typecheck` — exit 0
- `bun run check` (Biome) — exit 0 (2 pre-existing informational notices only)
- `bun run test` — 267 passed
- `bun run test:e2e` — 116 passed (fast harness + traceability gate green)
- `bun run test:contract` — 4 passed against **real Worktrunk v0.62.0**
- `bun run docs:living:check` — no drift (BEHAVIOR.md byte-stable)
- `bun run build` — self-contained Node bundle, `#!/usr/bin/env node`, injected SHA
- `bun run test-and-report` — **exit 0 end-to-end**, all seven stages fail-fast

Every active observable acceptance criterion in FR-02..FR-13 has at least one
E2E case mapping (enforced mechanically by the single `validateTraceability`
authority in both `test:e2e` and the generator). FR-15 build/install criteria
(AC-15.2/15.3/15.4) are established by the build/install tests; AC-15.1 by fast
cases. FR-14 is the generator meta-requirement, not a manifest.

## 1. Deviations from the plan (with justification)

- **Task 06 — additive `malformed` flag + orchestrator-escalated fix.** The
  initial implementation's `reconcileExcludeBlock` was non-idempotent on an
  unpaired begin marker and could silently delete user bytes across two writes,
  violating the spec's privacy guarantee that content outside the managed block
  is preserved. The orchestrator escalated this non-blocking review finding to a
  fix (it touches the `info/exclude` privacy boundary): heal-in-place (approach
  2), plus an additive `malformed: boolean` on `findManagedBlock`'s return
  (structural superset of the declared `{present, entries}` `Produces` shape),
  consumed by `check` in Task 13. Re-reviewed clean (31 empirical probes).
- **Files beyond the stated `Files modified` lists (several tasks).** Task 05
  extended `@wtw/core` `WtwErrorCode` (distinct error classes) and made `execa`
  an explicit `@wtw/cli` dependency; Tasks 07/09 added `smol-toml`/`jsonc-parser`
  as `@wtw/core` runtime deps (task-directed library choices); Task 10 added an
  additive E2E harness `run:` setup step + error codes + `proper-lockfile`; Task
  12 added `deps.ts` + `lsFilesTracked`; Task 13 added a `WTW_PLATFORM` seam +
  `lsFilesIgnored` + an opt-in `FAKE_GIT_SHAPE` fake-git mode; Task 15 added a
  `scenario` case mode + `contract-env.ts`. Each is a necessary, task-implied
  enabler; all reviewer-judged justified.
- **Task 14 — `jsonc-parser` ESM-entry import in `@wtw/core`
  (`workspace/folders.ts`).** The default UMD `main` uses lazy
  `require("./impl/…")` that a Node-target bundle cannot resolve at runtime; the
  import was switched to `jsonc-parser/lib/esm/main.js` so the bundle is genuinely
  self-contained (AC-01.4/AC-15.3). `@wtw/core` stays pure.
- **Task 15 — CLI version-parse fix in `diagnostics/categories.ts` (Task-13
  code).** The contract suite surfaced a real incompatibility: real
  `wt --version` prints `wt v0.62.0`, which the resolver could not parse, so
  `check` incorrectly FAILed against the real binary. `resolveWorktrunkVersion`
  now extracts the `major.minor.patch` token before the pure core evaluator
  (`@wtw/core` untouched; fast version cases unchanged). Required for AC-12.2 to
  truthfully pass.
- **Bare `wtw` help stream (Task 02, carried).** Bare invocation prints root
  help to STDERR (exit 0) via Commander's no-subcommand path, while explicit
  `--help` prints to STDOUT. Meets AC-02.1 (help printed, exit 0) and does not
  violate AC-02.2 (empty-stdout clause scoped to error/excluded cases). Task 03
  encoded the case to the real observed behavior rather than changing committed
  code. A UX asymmetry worth a product decision, not a defect.
- **Degrees of freedom exercised (documented):** Node baseline `engines.node
  >=20`; initial version `0.1.0`; TOML parser `smol-toml`; JSONC editor
  `jsonc-parser`; lock library `proper-lockfile` (mutex `<git-common-dir>/
  wtw-sync.lock`, wait 5s / retry 100ms / stale 10s, env-overridable); managed
  exclude markers `# >>> wtw managed >>>` / `# <<< wtw managed <<<`; the
  worktree display label strips `refs/heads/` (confirmed consistent with the
  spec in Task 09, and the primary folder omits `name`).

## 2. Surprises

- **Real Worktrunk `--version` output shape.** `wt v0.62.0` (with a `wt `
  prefix and `v`) is not a bare semver; the pure `evaluateWorktrunkVersion`
  expected a version-ish string. Only the real-binary contract suite exposed
  this — exactly the value the two-mode (fast + contract) testing design exists
  to provide.
- **`jsonc-parser` UMD lazy-require breaks Node bundling.** The dependency works
  fine under the test runner (source resolution) but its default entry's lazy
  `require("./impl/…")` cannot be resolved from a bundled Node artifact; only the
  build step (Task 14) surfaced it. Fixed via the ESM entry.
- **Real Worktrunk lifecycle is fully scriptable.** `wt switch --create --yes`
  runs the blocking `pre-start` copy before returning and `wt remove --yes` from
  a linked worktree drives `post-remove`; native first-use approval is observable
  in an isolated HOME without an interactive TTY (a non-`--yes` create refuses
  and leaves the approval store empty — that refusal *is* the observed approval
  gate). No interactive-TTY obstacle materialized.

## 3. Problems hit

- **Task 06 data-loss edge (resolved).** Described under Deviations — the only
  fix loop of the run. No unresolved problem remains; it was fixed and
  re-reviewed clean within the cycle.
- No `BLOCKED` states, no non-converging fix loops, no failed commits. The real
  Worktrunk binary being present on this macOS host let Task 15 actually run
  (rather than skip), so the real-lifecycle acceptance criteria are genuinely
  proven here.

## 4. Follow-ups (discovered, intentionally not done)

Routed as **candidate seeds for future threads** (this is tier-2 work with no
tier-3 roadmap; no inbox in this workflow). The user may open any of these later.

- **`resolve.test.ts` timeout flake.** `packages/cli/test/repo/resolve.test.ts`
  carries a marginal 5000ms per-test timeout that can flake under heavy parallel
  load (surfaced in Tasks 15/16; file not modified — out of scope). Candidate
  seed: raise/relax the timeout or reduce its subprocess load.
- **Test-strictness gaps (non-blocking, mechanism proven).** (a) Several `sync`
  success-path E2E cases assert `fileContains` (token presence) rather than an
  exact folder-set compare (Task 10). (b) `applyFoldersEdit`'s preservation test
  uses `toContain` rather than byte-equality of the surrounding span (Task 09) —
  the implementation is byte-preserving (surgical jsonc-parser edit), but the
  assertion is weaker than AC-09.2's wording. (c) AC-04.1 has dedicated
  byte-equality cases for a subset of the six preflight conflict categories
  (Task 12) — non-mutation is structurally guaranteed, but not every enumerated
  conflict has its own case. (d) AC-03.1's nested-linked invocation cell is
  unit-proven (`resolve.test.ts`) rather than a distinct E2E case, due to a
  harness cwd-vs-`git worktree add` limitation (Task 13). Candidate seed:
  strengthen these assertions / add the missing cells, and consider whether the
  harness should support a nested-linked cwd.
- **Test-only seams in production code.** `runSync` carries `WTW_TEST_HOLD_UNTIL`
  / `WTW_TEST_FAIL_AFTER_LOCK` and `init` carries `WTW_TEST_FAIL_AFTER`, gated
  behind env vars production never sets (Tasks 10/12). Candidate seed: extract a
  test-injection seam so production paths carry no test-only branches.
- **`scenario` case→imperative-test link is convention-only (Task 15).**
  AC-13.1/13.2/07.3/06.4-real are declared on a `scenario` case whose
  `command`/`expect` are inert descriptors; the real proof is bespoke code in
  `contract.test.ts`. It genuinely asserts each AC today, but a future edit could
  drop an assertion without failing traceability. Candidate seed: bind the
  scenario case to its imperative proof, or assert the scenario steps declaratively.
- **Minor code-quality nits (non-blocking):** vestigial first branch in
  `formatCliError` (Task 02); `renderReservedHooks` exported without TOML
  escaping — safe for fixed-contract callers only (Task 07); anchored-only
  `.worktreeinclude` match can yield a false WARN for a nested basename — advisory
  only, never a fail (Task 08); `readMaybe` / `buildWithSha` helper duplication
  (Tasks 12/14); the deep `jsonc-parser/lib/esm/main.js` import is fragile across
  future majors (Task 14); the dependency-boundary test scans raw file text so a
  future core comment/string mentioning an effect token could false-positive
  (Task 01).
