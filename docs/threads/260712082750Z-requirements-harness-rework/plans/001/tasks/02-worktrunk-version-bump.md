### Task 2: Worktrunk verified-range and contract-pin bump to v0.67.0

**Objective:** Move the verified Worktrunk range to `>=0.67.0 <0.68.0` and the contract pin to v0.67.0 across the P6 carve-out constants, the harness, the version-boundary cases, and the docs — leaving the full pre-rework gate green so the contract suite executes (rather than skips) for every later task.

**Input / context:** Spec Constraints "Contract pinning" and FR-9 (`specs/001/spec.md`, v3, per decision P6 in `seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md`); the locally installed Worktrunk reports `wt v0.67.0`. Current pin sites: `packages/core/src/worktrunk/version.ts` (`VERIFIED_MIN`/`VERIFIED_NEXT` constants plus range text in its messages — with the comment-only example in `packages/cli/src/diagnostics/categories.ts`, the only permitted product-tree touches); `PINNED_WORKTRUNK_VERSION` in `packages/cli/test/e2e/harness/contract-env.ts`; the fake shim default (`packages/cli/test/e2e/harness/fake-worktrunk/wt`, `FAKE_WT_VERSION` fallback `0.62.0`); `packages/core/test/worktrunk/version.test.ts`; version-boundary cases (`check-version-below-fails`, `check-version-0620-passes`, `check-version-0629-passes`), `check-healthy-all-pass/expected/stdout.txt`, `contract-worktrunk-compat/case.yml`; `harness.test/case-runner.test.ts`; `AGENTS.md` (pinned-version and verified-range mentions); generated `BEHAVIOR.md`. This task precedes the red window: the old schema and manifests are untouched, and every root script must pass at its boundary.

**Steps:**

1. In `packages/core/src/worktrunk/version.ts`: set `VERIFIED_MIN = "0.67.0"` and `VERIFIED_NEXT = "0.68.0"`, and update every hardcoded `>=0.62.0 <0.63.0` range string in its comments and messages to the new range. In `packages/cli/src/diagnostics/categories.ts`, update the comment-only `wt v0.62.0` output example to `wt v0.67.0`. Touch nothing else under `packages/*/src/`.
2. Update `packages/core/test/worktrunk/version.test.ts` to the new boundaries: `0.67.0` passes, a later `0.67.x` patch passes, a version below `0.67.0` (e.g. `0.66.9`) fails, `0.68.0` warns as unverified.
3. In `packages/cli/test/e2e/harness/contract-env.ts`: set `PINNED_WORKTRUNK_VERSION = "0.67.0"` and update its v0.62.0 comments. Update the pinned-version mentions in `packages/cli/test/e2e/contract.test.ts` comments and describe/skip strings (no behavioral change).
4. In the fake shim `packages/cli/test/e2e/harness/fake-worktrunk/wt`: change the `FAKE_WT_VERSION` fallback to `0.67.0` and its comments; update the matching expectations in `packages/cli/test/e2e/harness.test/case-runner.test.ts`.
5. Rework the version-boundary cases to the new range: rename `check-version-0620-passes` → `check-version-0670-passes` (id, title, `FAKE_WT_VERSION: "0.67.0"`, expected PASS line) and `check-version-0629-passes` → `check-version-0679-passes` (`0.67.9`); update `check-version-below-fails` to report `0.66.9` with the new FAIL message; update the range line in `check-healthy-all-pass/expected/stdout.txt` and any other case fixture/expected stream naming the old range; update `contract-worktrunk-compat/case.yml` (title, description, expected `v0.67.0` PASS line).
6. Update `AGENTS.md`: the "contract (real pinned Worktrunk v0.62.0 + built bundle)" mention and the "Verified Worktrunk range" line to v0.67.0 / `>=0.67.0 <0.68.0`.
7. Regenerate the living document with the still-current renderer: `bun run docs:living` (flows the new range text into `BEHAVIOR.md`), then `bun run docs:living:check`.
8. Run the full gate: `bun run test-and-report` — with wt v0.67.0 installed the contract suite must now execute; confirm the run output shows the contract scenarios ran rather than the `SKIPPED:` placeholder.

**Files modified:** `packages/core/src/worktrunk/version.ts`, `packages/cli/src/diagnostics/categories.ts` (comment only), `packages/core/test/worktrunk/version.test.ts`, `packages/cli/test/e2e/harness/contract-env.ts`, `packages/cli/test/e2e/contract.test.ts` (comments/strings only), `packages/cli/test/e2e/harness/fake-worktrunk/wt`, `packages/cli/test/e2e/harness.test/case-runner.test.ts`, `packages/cli/test/e2e/cases/check-version-0620-passes/` → `check-version-0670-passes/` (RENAMED), `packages/cli/test/e2e/cases/check-version-0629-passes/` → `check-version-0679-passes/` (RENAMED), `packages/cli/test/e2e/cases/check-version-below-fails/case.yml`, `packages/cli/test/e2e/cases/check-healthy-all-pass/expected/stdout.txt`, `packages/cli/test/e2e/cases/contract-worktrunk-compat/case.yml`, `AGENTS.md`, `packages/cli/docs/BEHAVIOR.md` (regenerated)

**Verification:** `bun run test-and-report` exits 0 and its `test:contract` phase output contains no `SKIPPED:` contract placeholder (the scenarios executed against real wt v0.67.0). `grep -rn '0\.62\.\|0\.63\.' packages/cli/src packages/core/src packages/cli/test packages/core/test packages/cli/requirements packages/cli/docs AGENTS.md` returns nothing (spec AC-9.2). `git diff --stat -- packages/cli/src packages/core/src` lists exactly the two P6 carve-out files.

**Acceptance criteria:**

- The verified range is `>=0.67.0 <0.68.0` with unchanged semantics (in-range passes, below fails, `0.68.0`+ warns) and the contract pin is exactly v0.67.0 — proven by the updated unit tests and version-boundary cases (spec AC-9.1).
- No `0.62.`/`0.63.` version string remains in the swept paths (spec AC-9.2).
- The full gate is green before the red window opens, with the contract suite executing.

**Consumes:** none

**Produces:** the v0.67.0 pin and `>=0.67.0 <0.68.0` verified range across product constants, contract pin, fake-shim default, version-boundary cases, and docs — the executing contract gate Tasks 13–15 rely on.
