### Task 4: Case schema — scalar `covers` and checkpoint declarations

**Objective:** Rework `packages/cli/test/e2e/harness/case-manifest.ts` so a declarative case declares exactly one covered AC and a scenario case declares named checkpoints instead of case-level coverage, both under the strict schema.

**Input / context:** Spec §3 (`specs/001/spec.md`) and the plan's pinned choices: `covers` becomes a scalar compound ref on fast/contract cases, forbidden on scenario cases; scenario cases carry a required non-empty `checkpoints:` list. Current schema: `case-manifest.ts` (`covers` a non-empty list, `ACCEPTANCE_REF_PATTERN`, modes `fast|contract|scenario`) and `packages/cli/test/e2e/harness.test/case-manifest.test.ts`. Depends on Task 3 only for repository typecheck state, not for its own code.

**Steps:**

1. Change `covers` to a scalar: a single string matching `ACCEPTANCE_REF_PATTERN`, required when the case's effective mode is `fast` or `contract`, rejected (as an unknown/forbidden field) when mode is `scenario`. Update `CaseManifest.covers` to `string | undefined` (present exactly on non-scenario cases).
2. Add the `checkpoints` field: required non-empty list on `scenario` cases, forbidden on other modes. Each entry is a strict mapping `{ id, title, description, covers }`: `id` kebab-case (same pattern as case ids), unique within the case; `title` and `description` non-empty strings; `covers` a single compound ref matching `ACCEPTANCE_REF_PATTERN`. Reject duplicate checkpoint ids and duplicate `covers` refs within one case. Export a `Checkpoint` type.
3. Add `checkpoints` (and scalar `covers`) to the `CASE_FIELDS` allow-list handling so unknown-field rejection still holds for every other key.
4. Mechanically update dependents that iterate `covers` as a list (`traceability.ts`, `e2e.test.ts`, `scripts/living-docs.ts`) just enough to keep `bun run typecheck` green; their behavioral rework is Tasks 5–6.
5. Extend `harness.test/case-manifest.test.ts`: rejection tests for — a list-valued `covers`; a fast case without `covers`; a scenario case with `covers`; a scenario case without `checkpoints`; a fast case with `checkpoints`; a checkpoint with a malformed `covers` ref; duplicate checkpoint ids; two checkpoints covering the same ref. Acceptance tests: a fast case with one scalar ref loads; a scenario case with two checkpoints loads.

**Files modified:** `packages/cli/test/e2e/harness/case-manifest.ts`, `packages/cli/test/e2e/harness.test/case-manifest.test.ts`, plus rename-level touches in `packages/cli/test/e2e/harness/traceability.ts`, `packages/cli/test/e2e/e2e.test.ts`, `packages/cli/scripts/living-docs.ts` (typecheck only).

**Verification:** `bunx vitest run packages/cli/test/e2e/harness.test/case-manifest.test.ts` exits 0; `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**

- The schema structurally guarantees a declarative case covers exactly one AC (spec AC-3.1's schema half) and a scenario manifest carries no direct case-level coverage, only checkpoint declarations — each rejection proven by a named passing test.
- `Checkpoint` is exported with `id`, `title`, `description`, `covers` so the renderer (Task 6) and traceability (Task 5) can consume declarations.
- The workspace still typechecks and lints.

**Consumes:** repository typecheck state from Task 3 (renamed requirement types).

**Produces:** the new case schema — `CaseManifest` with `covers?: string` and `checkpoints?: Checkpoint[]`; exported type `Checkpoint = { id: string; title: string; description: string; covers: string }` — consumed by Tasks 5, 6, 11, 14.
