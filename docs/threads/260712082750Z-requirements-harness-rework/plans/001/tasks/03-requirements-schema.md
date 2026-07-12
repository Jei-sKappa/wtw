### Task 3: Requirements manifest schema rework

**Objective:** Rework `packages/cli/test/e2e/harness/requirements.ts` so the strict manifest schema enforces the new convention — per-file domain prefixes, `verifiedBy` kinds with evidence references, `retired` tombstones, and the statement/notes lints — each rejection proven by a unit test.

**Input / context:** The spec's Expected behavior §1–2 (`specs/001/spec.md`) and the plan's pinned choices (index `plan.md`). Current schema: `requirements.ts` (FR pattern `^[A-Z]+-FR-\d{4}$`, statuses `active|deferred|removed`, AC statuses `removed`, field allow-lists `REQUIREMENT_FIELDS`/`ACCEPTANCE_FIELDS`) and its tests in `packages/cli/test/e2e/harness.test/requirements.test.ts`. This task begins the red window: old manifests will no longer load; repository-wide suites stay red until Task 13.

**Steps:**

1. Delete the stale header comment in `requirements.ts` (the `WTW`/spec-ID mapping note above `REQUIREMENT_ID_PATTERN`) and replace it with a short statement of the new convention.
2. Statuses: FR statuses become `active | deferred | retired`; AC status becomes optional `retired`. Rename `removedReason` to `retiredReason` (FR and AC); `retired` at either level requires `retiredReason`. Keep `deferred` requiring `coverage`. Drop the `removed` literal entirely.
3. Extend `AcceptanceCriterion` and its validation: required `verifiedBy` with exactly the values `case | checkpoint | unit | manual`; `unitTest` (validated with `validateSafePath` semantics — non-empty, relative, no `..`) required iff `verifiedBy: unit` and forbidden otherwise; `manualStep` (kebab-case, pattern `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) required iff `verifiedBy: manual` and forbidden otherwise.
4. Statement lint: fail loading when an AC `statement` contains any of the substrings `FR-`, `AC-`, or `(spec`.
5. Notes lint: keep `notes` as an allowed FR field but fail loading when it matches `/Task \d/`.
6. Add optional FR field `caseMode` whose only legal value is `contract`.
7. Prefix binding in `loadRequirements`: after loading all files, derive each file's domain prefix from its FRs — fail if two FRs in one file carry different prefixes, and fail if two files share a prefix. Keep the existing cross-file duplicate-ID rejection.
8. Update `REQUIREMENT_FIELDS` / `ACCEPTANCE_FIELDS` for the new field set so unknown-field rejection still covers everything.
9. Mechanically update dependent modules (`traceability.ts`, `scripts/living-docs.ts`, and any other `removed`-literal references) to the renamed types/statuses only as far as needed to keep `bun run typecheck` green — their behavioral rework is Tasks 5–6.
10. Rewrite `harness.test/requirements.test.ts`: keep still-valid strictness tests; add rejection tests for — malformed FR id; two prefixes in one file; shared prefix across two files (exercise `loadRequirements` against a temp dir); missing `verifiedBy`; unknown `verifiedBy` value; each banned statement substring (`FR-`, `AC-`, `(spec`); `retired` without `retiredReason`; re-use of a retired AC id within the FR (duplicate rejection); `unitTest` missing on a `unit` AC and present on a non-`unit` AC; `manualStep` missing on a `manual` AC and malformed; `notes` matching `Task 3`; `caseMode: fast` rejected. Add acceptance tests: a valid manifest with all four kinds loads; a retired AC loads and keeps its id.

**Files modified:** `packages/cli/test/e2e/harness/requirements.ts`, `packages/cli/test/e2e/harness.test/requirements.test.ts`, plus rename-level touches in `packages/cli/test/e2e/harness/traceability.ts` and `packages/cli/scripts/living-docs.ts` (typecheck only).

**Verification:** `bunx vitest run packages/cli/test/e2e/harness.test/requirements.test.ts` exits 0; `bun run check` and `bun run typecheck` exit 0. `grep -n 'removed' packages/cli/test/e2e/harness/requirements.ts` shows no remaining status literal.

**Acceptance criteria:**

- Every schema rule of spec §1–2 that concerns manifest *loading* (spec AC-1.1's format/prefix rules, AC-1.2 AC-id grammar, AC-1.3 statement lint, AC-1.4 retired semantics, AC-2.1 `verifiedBy`) has a named rejection test that passes.
- `requirements.ts` exports the extended `Requirement`/`AcceptanceCriterion` types carrying `verifiedBy`, `unitTest`, `manualStep`, `retiredReason`, `caseMode`.
- The workspace still typechecks and lints.

**Consumes:** none

**Produces:** the new manifest schema — `validateRequirements(value, source)` and `loadRequirements(root)` enforcing prefix binding; types `Requirement` (with optional `caseMode: "contract"`, statuses `active|deferred|retired`) and `AcceptanceCriterion` (with `verifiedBy: "case"|"checkpoint"|"unit"|"manual"`, optional `unitTest`, `manualStep`, `status: "retired"`, `retiredReason`) — consumed by Tasks 5, 6, 8–10.
