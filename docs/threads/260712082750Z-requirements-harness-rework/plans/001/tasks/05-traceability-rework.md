### Task 5: Traceability rework — the per-kind 1:1 authority

**Objective:** Rework `packages/cli/test/e2e/harness/traceability.ts` so the single shared function enforces every per-kind mapping rule of the spec, and both callers (the E2E suite and the living-doc generator) feed it the evidence-resolution context.

**Input / context:** Spec §2–4 (`specs/001/spec.md`); decision `seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md` P1 (one-to-one everywhere, proof unit differs by kind) and P3 (per-kind enforcement). Consumes the Task 3 requirement types and Task 4 case/checkpoint types. Callers today: `packages/cli/test/e2e/e2e.test.ts` and `packages/cli/scripts/generate-living-docs.ts`.

**Steps:**

1. Define and export `TraceabilityContext = { repoFileExists: (repoRelativePath: string) => boolean; checklistContent: string }` and change the signature to `validateTraceability(requirements: Requirement[], cases: CaseManifest[], context: TraceabilityContext): void`. Keep it the sole authority — no rule may live only in a caller.
2. Build the AC index keyed by compound ref, tracking each AC's `verifiedBy`, retired state, and owning FR (including the FR's `caseMode`). Retired FRs/ACs are excluded from all coverage obligations, but a case or checkpoint covering a retired ref, or a missing ref, still fails (as today for `removed`).
3. Enforce for declarative (fast/contract) cases: each case's single `covers` must resolve to an active `verifiedBy: case` AC (covering any other kind fails); every active `verifiedBy: case` AC must be covered by exactly one case — zero and duplicate coverage both fail with the offending refs/case ids named.
4. Enforce mode alignment: when the owning FR carries `caseMode: contract`, the covering case's effective mode must be `contract` — a fast-mode cover fails.
5. Enforce for checkpoints: collect declarations from scenario cases; each checkpoint's `covers` must resolve to an active `verifiedBy: checkpoint` AC; every active `verifiedBy: checkpoint` AC must be covered by exactly one checkpoint — zero and duplicates fail.
6. Enforce evidence references: a `verifiedBy: unit` AC fails when `context.repoFileExists(ac.unitTest)` is false; a `verifiedBy: manual` AC fails when `context.checklistContent` does not contain the literal `` ## `<manualStep>` `` heading marker.
7. Update both callers to build the context from disk: repo root is two levels above the package root (`path.resolve(root, "../..")`); `repoFileExists` via `existsSync` against repo root; `checklistContent` read from `packages/cli/docs/RELEASE-CHECKLIST.md`. Update the stale `FR-02..FR-13` comment in `generate-living-docs.ts`.
8. Rewrite `packages/cli/test/e2e/harness.test/traceability.test.ts` as the persistent violation matrix: build small in-memory requirement/case/checkpoint fixtures and assert a distinct failure for — uncovered `case` AC; doubly covered `case` AC; case covering a `checkpoint`/`unit`/`manual` AC; fast case covering a `caseMode: contract` FR's AC; uncovered `checkpoint` AC; doubly covered checkpoint AC; checkpoint covering a `case`-kind AC; `unit` AC whose file the context reports missing; `manual` AC whose step is absent from the checklist content; cover of a retired AC. Assert the happy path (one fixture with all four kinds correctly proven) passes, and that a retired AC needs no coverage. These tests feed violating input to the shared function itself — this is the spec's AC-3.4 single-authority proof.

**Files modified:** `packages/cli/test/e2e/harness/traceability.ts`, `packages/cli/test/e2e/harness.test/traceability.test.ts`, `packages/cli/test/e2e/e2e.test.ts`, `packages/cli/scripts/generate-living-docs.ts`

**Verification:** `bunx vitest run packages/cli/test/e2e/harness.test/traceability.test.ts` exits 0; `bun run check` and `bun run typecheck` exit 0; `grep -rn 'validateTraceability' packages/cli --include='*.ts'` shows exactly the two call sites plus the definition and tests (single authority intact).

**Acceptance criteria:**

- Every enforcement rule of spec FR-3 (AC-3.1–3.4), AC-2.3, and AC-4.2 has a named passing test against the shared function.
- Both the E2E suite and the living-doc generator call `validateTraceability` with a disk-derived `TraceabilityContext`.
- The workspace still typechecks and lints.

**Consumes:** `Requirement`/`AcceptanceCriterion` types from Task 3; `CaseManifest`/`Checkpoint` types from Task 4.

**Produces:** `validateTraceability(requirements, cases, context)` and `TraceabilityContext`, plus wired callers — the gate Tasks 11–13 drive to green and Task 6's generator relies on.
