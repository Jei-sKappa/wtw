### Task 13: Author missing dedicated cases — behavior domains and contract-mode assumptions

**Objective:** Complete declarative coverage: one dedicated case per remaining uncovered `verifiedBy: case` AC (`COPY`, `SYNC`, `WORK`, `CURSOR`, `CHECK`, `COMPAT`, and the `WTA` single-command assumptions), turning `bun run test:e2e` fully green.

**Input / context:** The residual backlog from Task 12. Behavior-domain ACs get fast cases exactly as in Task 12 (near-duplicates welcome). `WTA` ACs with `verifiedBy: case` sit in `caseMode: contract` FRs, so their cases must declare `mode: contract` — traceability rejects a fast cover (Task 5), and `contract.test.ts` already runs every contract-mode case through the generic runner against the built bundle and pinned Worktrunk.

**Steps:**

1. Re-extract the backlog (as in Task 12 step 1); it must now contain only `COPY-`, `SYNC-`, `WORK-`, `CURSOR-`, `CHECK-`, `COMPAT-`, and `WTA-` refs.
2. Author fast cases for the behavior-domain refs, verifying each with `bunx vitest run packages/cli/test/e2e/e2e.test.ts -t '<case-id>'`.
3. Author contract-mode cases for the uncovered `WTA` case-kind refs (single-command real-Worktrunk facts — pattern them on `contract-worktrunk-compat`). These are collected but not executed by the fast suite; their execution proof is `bun run test:contract` (run it here — the Task 2 pin bump makes the locally installed Worktrunk the pinned v0.67.0 binary; Task 15's gate re-proves it end-to-end).
4. Run `bun run test:e2e` and iterate until the whole suite — traceability test included — passes.

**Files modified:** new `packages/cli/test/e2e/cases/*/` directories (one per remaining uncovered AC); no existing files change.

**Verification:** `bun run test:e2e` exits 0 (traceability green: every active `case` AC covered exactly once, checkpoint declarations 1:1, unit/manual refs resolving); `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**

- `bun run test:e2e` passes end-to-end — the red window closes.
- Every `WTA` case-kind AC is covered by a contract-mode case (mode alignment satisfied, spec AC-4.2's content half).

**Consumes:** residual backlog from Task 12; behavior/`WTA` registries from Tasks 9–10; the executing v0.67.0 contract pin from Task 2; contract-case runner wiring in `contract.test.ts` (pre-existing).

**Produces:** a fully green fast gate and complete declarative coverage — the state Task 14 wires the scenario runtime onto.
