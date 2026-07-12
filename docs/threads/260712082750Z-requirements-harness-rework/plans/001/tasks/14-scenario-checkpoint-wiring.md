### Task 14: Scenario checkpoint wiring in the contract suite

**Objective:** Wire `packages/cli/test/e2e/contract.test.ts` to the declared checkpoints so each scenario registers, asserts, and verifies every checkpoint of its manifest — without adding real-Worktrunk lifecycle executions.

**Input / context:** The checkpoint declarations in `contract-lifecycle/case.yml` and `contract-linked-base/case.yml` (Task 11); the tracker from Task 7 (`createCheckpointTracker`); spec §4 (the scenario fails when a declared checkpoint is not reached or its assertion does not hold; execution count must not scale with checkpoint ACs — spec AC-4.3/AC-4.4). Today's file: two lifecycle `it` blocks plus the contract-case loop and the pinned-binary check; comments cite genesis IDs (`AC-06.4`, `AC-13.1`, `(AC-12.2)`, "Task 15").

**Steps:**

1. At suite start, load both scenario manifests' declared checkpoints via `loadCases` (filter `mode === "scenario"`, index by case id). Fail loudly if a scenario case id expected by the test is missing — the test and the declarations must not drift silently.
2. In the full-lifecycle `it` block: create a tracker from `contract-lifecycle`'s declarations; after each existing assertion phase (approval-store untouched, refused create grants nothing, blocking pre-start copy complete on return, post-start single Cursor open, workspace reconciled, post-remove reconcile, no extra open), call `tracker.reach("<checkpoint-id>")` with the matching declared id; end the block with `tracker.assertAllReached()`. Keep the single `wt switch --create` lifecycle drive — add no new executions.
3. Do the same in the linked-base `it` block against `contract-linked-base`'s declarations.
4. Rewrite the file's comments: describe the checkpoint mechanism and cite new compound refs where helpful; remove every genesis-ID and task-number mention.
5. Confirm the execution count is structurally unchanged: still exactly two scenario `it` blocks, each driving its lifecycle once (no per-checkpoint `execa` lifecycle calls added).

**Files modified:** `packages/cli/test/e2e/contract.test.ts`

**Verification:** `bun run test:contract` exits 0 with the suite executing, not skipped (builds the bundle, runs both scenarios with checkpoint verification plus all contract-mode cases against the pinned Worktrunk v0.67.0); `grep -n 'WTW-FR-\|(spec AC-\|AC-[0-9][0-9]\.' packages/cli/test/e2e/contract.test.ts` returns nothing; `grep -c 'wt.*switch.*--create' packages/cli/test/e2e/contract.test.ts` is no higher than before the task (compare against `git show HEAD -- packages/cli/test/e2e/contract.test.ts`).

**Acceptance criteria:**

- Both scenarios verify all their declared checkpoints via the tracker, so an unreached or failed checkpoint fails `test:contract` (spec AC-4.3's wired half).
- Real-Worktrunk lifecycle executions remain one per scenario (spec AC-4.4).
- `bun run test:contract` passes.

**Consumes:** `createCheckpointTracker` from Task 7; checkpoint declarations from Task 11; green declarative coverage from Task 13; the executing v0.67.0 contract pin from Task 2.

**Produces:** a fully wired contract suite — the last moving part before Task 15's whole-change gate.
