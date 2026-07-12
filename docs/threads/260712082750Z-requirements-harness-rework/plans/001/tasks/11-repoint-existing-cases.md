### Task 11: Re-point existing cases to the new registry

**Objective:** Make every existing case manifest conform to the new schema — each declarative case covers exactly one new compound ref, and the scenario cases carry their checkpoint declarations — so the E2E suite collects again.

**Input / context:** The complete registry from Tasks 8–10 and the audit's old→new mapping; all 62 case directories under `packages/cli/test/e2e/cases/`; the case schema from Task 4. Old cases carry list-valued `covers` with `WTW-FR-*` refs (up to 7 per case); `contract-lifecycle` is the scenario case; `contract-worktrunk-compat` is a contract-mode declarative case. The second lifecycle proof in `contract.test.ts` (primary-as-copy-source from a linked base) has no scenario manifest today.

**Steps:**

1. For every declarative case (fast and contract mode): replace the `covers` list with a single scalar ref — the one new AC this case most directly proves, chosen via the audit mapping. Where an old case covered several ACs, keep it pointed at its primary AC; the displaced ACs become the Task 12/13 backlog (traceability will enumerate them). Update titles/descriptions that mention old IDs.
2. Contract-mode declarative cases must point at ACs whose owning FR carries `caseMode: contract` (e.g. `contract-worktrunk-compat` → the `WTA` version-reporting AC); a fast case pointing at a `WTA` AC is a traceability failure — re-point it.
3. Rewrite `contract-lifecycle/case.yml` as a scenario manifest under the new schema: remove `covers`, add `checkpoints:` — one entry per `WTA` `verifiedBy: checkpoint` AC that the full-lifecycle scenario proves, each with a kebab id, a `title`, a `description` stating the step and the assertion, and `covers` naming that one AC.
4. Add a new scenario case directory `contract-linked-base/case.yml` (id `contract-linked-base`, `mode: scenario`) declaring the checkpoints of the second lifecycle proof (linked-base copy-source assumptions), so every `checkpoint` AC has exactly one declaring scenario. Runtime wiring for both scenarios is Task 14.
5. Sweep case fixtures/expected files for old-ID strings (descriptions and comments only — never alter product-observable expected output, which contains no IDs).
6. Confirm collection: `bunx tsx -e 'import {loadCases} from "./packages/cli/test/e2e/harness/case-manifest.ts"; console.log("cases:", (await loadCases("packages/cli")).length)'` succeeds.

**Files modified:** every `packages/cli/test/e2e/cases/*/case.yml` (re-pointed), `packages/cli/test/e2e/cases/contract-linked-base/case.yml` (NEW)

**Verification:** The `loadCases` one-liner succeeds; `grep -rn 'WTW-FR-' packages/cli/test/e2e/cases/` returns nothing; `bun run test:e2e` collects and every *case* test passes — only the traceability test may fail, and its errors name only uncovered ACs (no schema/loading errors, no failing case runs).

**Acceptance criteria:**

- All existing cases load under the new schema with exactly one `covers` ref each; no old IDs remain under `cases/`.
- Both lifecycle proofs have scenario manifests whose checkpoint declarations cover every `verifiedBy: checkpoint` AC exactly once (traceability reports no checkpoint-side violations).
- Fast-suite case runs are green; the remaining traceability failures are exclusively uncovered `verifiedBy: case` ACs.

**Consumes:** registry + audit mapping from Tasks 8–10; case schema from Task 4; traceability error reporting from Task 5.

**Produces:** a collecting E2E suite; scenario checkpoint declarations in `contract-lifecycle` and `contract-linked-base`; the uncovered-AC backlog (traceability output) that Tasks 12–13 burn down.
