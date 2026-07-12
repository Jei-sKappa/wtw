### Task 10: New manifests — architecture, harness, and the Worktrunk-assumptions group

**Objective:** Complete the requirements tree: author `ARCH` and `HARNESS` (absorbing genesis FR-01 and FR-14 with `verifiedBy: unit` evidence) and the `WTA` Worktrunk-assumptions group (enumerating every assumption currently implicit in `contract.test.ts`), retire the old lifecycle manifest, and make the whole directory load.

**Input / context:** Audit rows for genesis FR-01, FR-13, FR-14; spec §2 and §4 (`specs/001/spec.md`); decision log P1 (assumptions group) and P3 (completeness, unit-boundary rule). Raw material: genesis FR-01/FR-13/FR-14 sections; the old `13-lifecycle.yml`; the assertions and comments of `packages/cli/test/e2e/contract.test.ts` (native approval semantics, blocking pre-start copy before worktree readiness, background post-start sync+open, post-remove reconcile, primary-as-copy-source from a linked base, version reporting, single Cursor open). Existing unit evidence to reference: `packages/core/test/dependency-boundary.test.ts`, the harness tests under `packages/cli/test/e2e/harness.test/`, `packages/cli/test/living-docs.test.ts`.

**Steps:**

1. Author `01-architecture.yml` (`ARCH`): narrow FRs for the genesis FR-01 substance — the two-package workspace shape, the core purity/dependency boundary, toolchain gates. ACs are `verifiedBy: unit` with `unitTest` naming existing repo-root-relative test files (the dependency boundary AC references `packages/core/test/dependency-boundary.test.ts`). If a stated invariant has no existing covering test, either add a minimal named unit test (allowed by scope: unit suites may be extended) or escalate; never point `unitTest` at an unrelated file.
2. Author `14-harness.yml` (`HARNESS`): the genesis FR-14 substance — the living behavior document stays generated and drift-checked, traceability is enforced by a single shared authority, the manifest/case schemas reject malformed input. ACs are `verifiedBy: unit` referencing the harness test files (e.g. `packages/cli/test/e2e/harness.test/traceability.test.ts`, `packages/cli/test/living-docs.test.ts`). Phrase every statement without literal ID tokens — e.g. "a malformed requirement identifier is rejected at load time" — the lint applies with no exemptions.
3. Author `13-worktrunk-assumptions.yml` (`WTA`) with `caseMode: contract` on every FR whose ACs are `verifiedBy: case`: one short AC per assumption wtw makes about real Worktrunk, each `verifiedBy: checkpoint` (multi-step lifecycle facts) or `verifiedBy: case` (single-command facts, e.g. version reporting — the existing `contract-worktrunk-compat` case's territory). Enumerate from `contract.test.ts` exhaustively; this list is the audit's absorption target for "behavior previously proven only by contract.test.ts" (spec AC-4.1).
4. Delete the old `13-lifecycle.yml` (its substance is now split across `WTA` and Task 9's domains — confirm via the audit rows before deleting).
5. Fill the `New refs` audit cells for genesis FR-01, FR-13, FR-14, and re-scan `contract.test.ts` top to bottom confirming every assertion maps to some new AC (add a note row to the audit for any contract-test assertion that has no genesis AC, so the absorption claim is checkable).
6. Full-directory validation now applies: `bunx tsx -e 'import {loadRequirements} from "./packages/cli/test/e2e/harness/requirements.ts"; await loadRequirements("packages/cli"); console.log("ok")'` must pass (all 15 files new-format, prefixes unique).

**Files modified:** `packages/cli/requirements/functional/01-architecture.yml` (NEW), `packages/cli/requirements/functional/14-harness.yml` (NEW), `packages/cli/requirements/functional/13-worktrunk-assumptions.yml` (NEW), `packages/cli/requirements/functional/13-lifecycle.yml` (DELETED), possibly new/extended unit tests under `packages/*/test/`, `docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` (refs filled)

**Verification:** The full-directory `loadRequirements` one-liner prints `ok`; `grep -rn 'WTW-FR-' packages/cli/requirements/` returns nothing; every `unitTest` path in the three new files exists (`test -f` each); every audit row now has a non-empty `New refs` cell or a recorded owner disposition (`grep -c '| *|' `-style scan for empty cells returns 0 rows).

**Acceptance criteria:**

- The requirements tree is complete: 15 manifest files, unique prefixes, loading clean under the strict schema.
- `ARCH`/`HARNESS` absorb genesis FR-01/FR-14 with `verifiedBy: unit` ACs naming existing test files (spec AC-2.2's manifest half).
- The `WTA` group exists with `caseMode: contract`, one AC per real-Worktrunk assumption (spec AC-4.1's manifest half).
- Every audit row across all 15 genesis FRs resolves; check-off still pending (Task 15).

**Consumes:** audit rows from Task 1; manifest schema from Task 3; domain registries from Tasks 8–9.

**Produces:** the complete FR+AC registry — in particular the `WTA-FR-*` checkpoint/contract ACs Task 11 declares checkpoints for and Task 13 covers with contract cases; `ARCH`/`HARNESS` unit refs; fully ref-filled audit.
