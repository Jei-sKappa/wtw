# Plan — Requirements/E2E harness rework: 1:1 acceptance mapping and manifest convention

Source: specs/001/spec.md

## Objective and context

Rebuild wtw's verification layer so the requirement manifests become the single
authoritative acceptance registry and `packages/cli/docs/BEHAVIOR.md` reads as
a per-criterion audit trail: every AC is one short assertion carrying a
`verifiedBy` kind (`case | checkpoint | unit | manual`), every AC shows exactly
one piece of evidence, and the mapping is one-to-one everywhere. The work
covers: the Worktrunk pin/verified-range bump to v0.67.0 (P6), the manifest
and case schemas, the single traceability authority, a
new scenario-checkpoint concept, the living-doc renderer, a full
rewrite/renumbering of all manifests (`WTW-FR-*` disappears), a re-point/split
of all 62 E2E cases, a one-time genesis migration audit inside this thread,
and the model documentation (`AGENTS.md`, `packages/cli/docs/RELEASE-CHECKLIST.md`).
Product code (`packages/cli/src/`, `packages/core/src/`) is untouched except
the two P6 carve-out files.

### Pinned choices (within the spec's degrees of freedom)

The spec leaves these *hows* to the implementer; this plan pins them so each
task is dispatchable:

- **Domain/prefix map.** One domain prefix per manifest file, per this table
  (an implementer may add a further domain if the migration audit demands one,
  respecting one-prefix-per-file and cross-file prefix uniqueness):
  `01-architecture.yml`→`ARCH`, `02-cli-surface.yml`→`CLI`,
  `03-repository.yml`→`REPO`, `04-init.yml`→`INIT`, `05-privacy.yml`→`PRIV`,
  `06-worktrunk-config.yml`→`CONF`, `07-copy-policy.yml`→`COPY`,
  `08-sync.yml`→`SYNC`, `09-cursor-workspace.yml`→`WORK`,
  `10-cursor-launch.yml`→`CURSOR`, `11-diagnostics.yml`→`CHECK`,
  `12-compatibility.yml`→`COMPAT`, `13-worktrunk-assumptions.yml`→`WTA`,
  `14-harness.yml`→`HARNESS`, `15-version.yml`→`VER`.
- **`covers` becomes a scalar** (one compound ref) on fast/contract cases and
  is forbidden on scenario cases.
- **Checkpoints are declared in the scenario `case.yml`** under a
  `checkpoints:` list — `{ id, title, description, covers }`, kebab-case ids,
  each `covers` one compound ref.
- **Evidence fields.** Per-AC `verifiedBy` (required); `unitTest`
  (repo-root-relative test-file path, required iff `verifiedBy: unit`);
  `manualStep` (kebab-case step id, required iff `verifiedBy: manual`)
  resolving to a `` ## `<step-id>` `` heading in
  `packages/cli/docs/RELEASE-CHECKLIST.md`.
- **Mode alignment** is an optional FR-level `caseMode: contract` field: every
  `verifiedBy: case` AC of such an FR must be covered by a contract-mode case.
- **Retirement.** `status: retired` with a mandatory `retiredReason` replaces
  the `removed` literal at both FR and AC level; the auxiliary `deferred` FR
  status (with its `coverage` field) is retained.
- **Migration audit** lives at `migration/genesis-audit.md` in this thread.

### Execution note — the red window

Task 2 (the P6 version bump) precedes the red window and must leave the full
gate green — with wt v0.67.0 installed it makes the contract suite execute
rather than skip for the rest of the plan. The new schema then necessarily
rejects the old manifests and cases, so from Task 3
onward repository-wide suites are expected red: `bun run test` and
`bun run test:e2e` recover at Task 13, `test:contract` at Task 14, and
`docs:living:check` at Task 15 (when `BEHAVIOR.md` is regenerated). The spec's
constraint ("all root scripts pass") binds **at completion** and is proven in
Task 15. Until then each task's verification is scoped: `bun run check`,
`bun run typecheck`, and targeted `bunx vitest run <path>` invocations must
pass at every task boundary. Tasks 3–4 include the mechanical (rename-level)
updates to dependent modules needed to keep `typecheck` green; the behavioral
rework of those dependents lands in Tasks 5–6.

## Global Constraints

- **Platform and toolchain.** macOS is the verified platform. Bun is the package manager/test runner; the existing root scripts (`check`, `typecheck`, `test`, `test:e2e`, `test:contract`, `docs:living[:check]`, `build`, `test-and-report`) keep their names and their fail-fast gate role, and all must pass at completion.
- **Strict schemas stay strict.** The manifest and case schemas keep the current posture: unknown fields rejected, unsafe paths rejected, duplicate IDs rejected, deterministic loading order. New fields (`verifiedBy`, checkpoint declarations, evidence references) are added to the strict set, not exempted from it.
- **Contract pinning.** The contract suite keeps using a pinned real Worktrunk and the built bundle. As part of this rework the pin moves from v0.62.0 to v0.67.0 and the verified range from `>=0.62.0 <0.63.0` to `>=0.67.0 <0.68.0` (P6); the pin/range semantics (exact-version contract pin; min-inclusive, next-minor-exclusive verified range; below-range fails, above-range warns as unverified) are unchanged.
- **Generated file discipline.** `BEHAVIOR.md` is never hand-edited; `docs:living:check` must fail on drift, as today.
- **Frozen records.** The genesis thread's artifacts are not edited (P4). The jastr tree is not read as a build input and not modified (P5).
- **No product changes.** `packages/cli/src/` and `packages/core/src/` are untouched (see Scope), with exactly the P6 carve-out: the verified-range constants/messages in `packages/core/src/worktrunk/version.ts` and the comment-only version example in `packages/cli/src/diagnostics/categories.ts`.

## Tasks

1. **Migration audit skeleton** — enumerate every genesis acceptance criterion as an unchecked audit row and record the baseline commit. → `tasks/01-migration-audit-skeleton.md`
2. **Worktrunk version bump** — move the verified range to `>=0.67.0 <0.68.0` and the contract pin to v0.67.0 (P6 carve-out), full gate green with the contract suite executing. → `tasks/02-worktrunk-version-bump.md`
3. **Requirements manifest schema rework** — new ID/prefix rules, `verifiedBy`, evidence refs, `retired`, statement/notes lints in `requirements.ts`, with rejection tests. → `tasks/03-requirements-schema.md`
4. **Case schema: scalar `covers` and checkpoint declarations** — one-AC cases and the scenario `checkpoints:` schema in `case-manifest.ts`, with rejection tests. → `tasks/04-case-schema-checkpoints.md`
5. **Traceability rework** — the single authority enforces all per-kind 1:1 rules, mode alignment, and evidence-reference resolution. → `tasks/05-traceability-rework.md`
6. **Per-AC living-doc renderer** — `BEHAVIOR.md` renders every AC exactly once with its own kind-labeled evidence block. → `tasks/06-living-doc-renderer.md`
7. **Checkpoint runtime helper** — a tracker the scenario test uses so an unreached or failed checkpoint fails the run, proven by a persistent harness test. → `tasks/07-checkpoint-runtime-helper.md`
8. **New manifests: core CLI domains** — rewrite `CLI`, `REPO`, `INIT`, `PRIV`, `CONF`, `VER` manifests and fill their audit rows. → `tasks/08-manifests-core-domains.md`
9. **New manifests: behavior domains** — rewrite `COPY`, `SYNC`, `WORK`, `CURSOR`, `CHECK`, `COMPAT` manifests, rework the release checklist into `manual` step targets, fill audit rows. → `tasks/09-manifests-behavior-domains.md`
10. **New manifests: architecture, harness, Worktrunk assumptions** — author `ARCH`, `HARNESS`, `WTA` (absorbing genesis FR-01/FR-13/FR-14 and the implicit contract-test assumptions), fill audit rows; whole tree loads. → `tasks/10-manifests-arch-assumptions.md`
11. **Re-point existing cases** — every existing case covers exactly one new AC; scenario cases gain their checkpoint declarations. → `tasks/11-repoint-existing-cases.md`
12. **Author missing dedicated cases: core domains** — one new fast case per still-uncovered `CLI`/`REPO`/`INIT`/`PRIV`/`CONF`/`VER` case-kind AC. → `tasks/12-author-cases-core.md`
13. **Author missing dedicated cases: behavior domains and contract-mode assumptions** — complete declarative coverage; `bun run test:e2e` goes green. → `tasks/13-author-cases-behavior.md`
14. **Scenario checkpoint wiring in the contract suite** — `contract.test.ts` registers and asserts every declared checkpoint without adding lifecycle executions. → `tasks/14-scenario-checkpoint-wiring.md`
15. **Docs, audit check-off, and the full gate** — rewrite `AGENTS.md`'s verification model, regenerate `BEHAVIOR.md`, check off the audit, run every grep sweep and `bun run test-and-report`. → `tasks/15-docs-and-full-gate.md`
