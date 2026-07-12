### Task 7: Checkpoint runtime helper

**Objective:** Provide the tracker the scenario test will use so every declared checkpoint must be reached and asserted, with the failure paths proven by a persistent harness test (spec AC-4.3).

**Input / context:** Spec §3 (scenario checkpoints: "The scenario fails if a declared checkpoint is not reached and asserted") and §4. Consumes the `Checkpoint` type from Task 4. Pure in-process helper — no subprocesses, no fs — so it is fully unit-testable; the wiring into `contract.test.ts` is Task 14.

**Steps:**

1. Create `packages/cli/test/e2e/harness/checkpoints.ts` exporting `createCheckpointTracker(declared: readonly Pick<Checkpoint, "id">[]): CheckpointTracker` with `CheckpointTracker = { reach(id: string): void; assertAllReached(): void }`.
2. Implement: `reach` throws on an id not in `declared` (a drifted scenario must fail loudly, not silently skip) and on a second `reach` of the same id (a duplicate reach means the scenario and its declarations disagree); `assertAllReached` throws naming every declared id never reached. The intended call shape — the scenario test runs a step's assertions, then calls `reach(id)`; a failing assertion aborts the test before `reach`, so an asserted-false checkpoint is inherently "not reached".
3. Add `packages/cli/test/e2e/harness.test/checkpoints.test.ts`: happy path (reach all, `assertAllReached` passes); unreached checkpoint fails with its id in the message; undeclared `reach` fails; duplicate `reach` fails.

**Files modified:** `packages/cli/test/e2e/harness/checkpoints.ts` (NEW), `packages/cli/test/e2e/harness.test/checkpoints.test.ts` (NEW)

**Verification:** `bunx vitest run packages/cli/test/e2e/harness.test/checkpoints.test.ts` exits 0; `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**

- `createCheckpointTracker` exists with the signature above and the three failure modes.
- The persistent harness test exercising the unreached-checkpoint failure path passes (spec AC-4.3's helper half; the wired scenario half lands in Task 14).

**Consumes:** `Checkpoint` type from Task 4.

**Produces:** `createCheckpointTracker(declared): { reach(id): void; assertAllReached(): void }` from `packages/cli/test/e2e/harness/checkpoints.ts` — consumed by Task 14.
