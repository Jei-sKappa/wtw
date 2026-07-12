---
version: 3
status:
  approved: 260712115028Z
---

# Spec — Requirements/E2E harness rework: 1:1 acceptance mapping and manifest convention

## Intended outcome

After this rework, the owner can audit any delegated implementation by reading
`packages/cli/docs/BEHAVIOR.md` top to bottom: every acceptance criterion is a
single short assertion, every criterion shows exactly one piece of evidence
that proves it (a dedicated E2E case, a named checkpoint of the real-Worktrunk
scenario, a named unit-test file, or a named manual checklist step), and no
criterion ever asks the reader to re-read evidence already shown elsewhere.
The requirement manifests become the single authoritative acceptance registry
for wtw's observable behavior (per
`seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md`
P4), and their format matches the convention established in the jastr
reference project, extended with the rules defined here.

## Context

The wtw MVP was implemented from the genesis spec
(`docs/threads/260711114414Z-wtw-genesis/specs/001/spec.md`), which left the
verification layer with: 13 fat requirements (one per category file) carrying
long multi-assertion acceptance criteria; globally unique AC IDs that encode
their FR number (`AC-0301`) and restate it in prose (`(spec AC-03.1)`); cases
covering up to 7 ACs and ACs covered by up to 5 cases; two requirements
(genesis FR-01, FR-14) absent from the manifests entirely because their
evidence is unit tests; manual-only criteria absent because their evidence is
a human checklist; and stale mid-implementation prose in `notes:` fields
(e.g. references to "Tasks 12 and 13" in
`packages/cli/requirements/functional/10-cursor-launch.yml`). The owner's
audit purpose — read a short criterion, see the explicit proof — is not served
by this shape. Five decisions settling the rework were recorded in
`seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md`
(P1–P5); this spec turns them into an implementable contract.

## Scope and non-scope

**In scope** — the verification layer of the wtw repository only:

- `packages/cli/requirements/functional/*.yml` (full rewrite and renumbering,
  per P2).
- The E2E harness under `packages/cli/test/e2e/` (schema, traceability,
  runner wiring for the new rules; the checkpoint concept, per P1/P3).
- The living-doc generator (`packages/cli/scripts/generate-living-docs.ts`,
  `packages/cli/scripts/living-docs.ts`) and the generated
  `packages/cli/docs/BEHAVIOR.md` (per-AC rendering, per P1).
- New and rewritten `case.yml` cases under `packages/cli/test/e2e/cases/`.
- The one-time migration audit artifact inside this thread (per P4).
- Documentation that describes the verification model: `AGENTS.md` (its
  "Verification model" section currently hard-codes the old FR-02..FR-13
  rule and ID style) and `packages/cli/docs/RELEASE-CHECKLIST.md` (its steps
  become the reference targets of `manual` ACs, and its existing genesis-ID
  references are rewritten).
- The Worktrunk version bump (P6): the verified-range constants and their
  message strings in `packages/core/src/worktrunk/version.ts` and the
  comment-only version example in `packages/cli/src/diagnostics/categories.ts`
  (the only two permitted product-tree touches); the contract pin in
  `packages/cli/test/e2e/harness/contract-env.ts` and the fake shim's default
  version; the version-boundary cases, their expected outputs, and the core
  version unit tests; the version mentions in `AGENTS.md`.

**Out of scope:**

- Any change to wtw's product behavior beyond the P6 version-range bump.
  Files under `packages/cli/src/` and `packages/core/src/` are not modified
  except the two P6 carve-out files named in scope above. If the rework
  surfaces what looks like a product bug, stop and escalate to the owner; do
  not fix it inline.
- The jastr repository. It is inspiration, not authority; nothing in this
  spec references it as a dependency, and it must not be required to be
  present (`.library/sources/` is gitignored). (P5)
- The genesis spec and any artifact of the genesis thread. They are frozen
  records; the manifests supersede the genesis acceptance list going forward
  without editing it. (P4)
- Any permanently maintained old→new ID mapping. The migration audit is
  one-time and is archived with this thread. (P4)
- Unit-test suites under `packages/*/test/` other than the E2E harness are
  not restructured (they may gain references *from* manifests, and may be
  extended where an AC needs a named covering test, but no rewrite of the
  existing unit suites is in scope).

## Expected behavior

### 1. Requirement manifest convention (P2)

Requirements live in `packages/cli/requirements/functional/*.yml`, one domain
per file, many narrow FRs per file. The convention, stated self-containedly:

- **FR shape.** A functional requirement is narrow: one behavior theme with a
  short title (e.g. "check rejects command-specific options"), a description
  that carries the shared context, and a small list of acceptance criteria.
  The description holds the context so each AC statement can be one line.
- **FR IDs.** `<DOMAIN>-FR-<NNNN>`: an uppercase-alphabetic domain prefix
  followed by a four-digit, zero-padded number scoped to that prefix. The
  prefix↔file binding is an invariant: every FR in one manifest file carries
  that file's single domain prefix (e.g. `INIT-FR-0001` in the init
  manifest, `SYNC-FR-0001` in the sync manifest), and no two manifest files
  share a prefix. (How a filename spells its domain is the implementer's
  choice; one-prefix-per-file and prefix-uniqueness-across-files are not.)
- **AC IDs.** `AC-<NNNN>`, numbered locally per FR, restarting at `AC-0001`
  in each FR. A bare AC ID has no meaning outside its FR; every
  cross-reference anywhere (cases, checkpoints, evidence fields, docs) uses
  the compound form `<FR-ID>.<AC-ID>` (e.g. `INIT-FR-0002.AC-0001`).
- **Statement grammar (P2 codicil 2).** Each AC `statement` is exactly one
  observable assertion, phrased as a checkable outcome — an exit code, a
  stream content, a file state, or an invocation record. Statements contain
  no ID tokens (no `FR-`/`AC-` substrings) and no back-references to the
  genesis spec (no `(spec AC-…)` suffixes). This lint is absolute — even ACs
  that describe the ID grammar itself (the harness-self-describing
  requirements absorbing genesis FR-14) must phrase their statements without
  literal ID tokens (e.g. "a malformed requirement identifier is rejected at
  load time"), never by exempting the lint.
- **ID stability (P2 codicil 1).** IDs are append-only: never reused, never
  renumbered. A withdrawn FR or AC keeps its ID forever with
  `status: retired` plus a stated reason; numbering gaps are normal and carry
  no meaning. (This replaces the current `removed` status literal; the
  retired item stays in the manifest as a tombstone.)
- **No coverage claims in prose.** The `notes:` field (if kept at all) must
  not carry coverage justifications or transient implementation state (task
  numbers, "not yet implemented" remarks). Coverage and evidence live only
  in the structured fields defined below.

### 2. Completeness and `verifiedBy` (P3)

The requirements tree is complete: every requirement of the product — 
including the substance of genesis FR-01 (workspace architecture, the
core/CLI dependency boundary, toolchain gates) and genesis FR-14 (the living
behavior document and traceability gate), and including manual-only criteria
such as the real-Cursor open check — appears in the manifests. Every AC
carries a `verifiedBy` kind:

- `case` — proven by exactly one declarative E2E case (fast or contract
  mode).
- `checkpoint` — proven by exactly one named checkpoint of the imperative
  real-Worktrunk scenario.
- `unit` — proven by a named unit-test file; the AC must reference an
  existing test file by repo-root-relative path (the covering test may live
  in another package, e.g. `packages/core/test/dependency-boundary.test.ts`),
  and traceability fails if the file is missing.
  **Boundary rule:** `unit` is reserved for requirements inherently
  unreachable by the E2E harness (architecture invariants, the harness
  itself). It is never a loophole for skipping E2E coverage of observable
  CLI behavior.
- `manual` — proven by a named step of
  `packages/cli/docs/RELEASE-CHECKLIST.md`; the AC must reference an
  existing, identifiable step, and traceability fails if the reference does
  not resolve.

### 3. One-to-one mapping (P1)

The proof unit differs by kind, but the mapping is one-to-one everywhere:

- **Declarative cases.** Every case (fast or contract mode) covers exactly
  one AC — its `covers` resolves to a single active `verifiedBy: case`
  criterion — and every active `verifiedBy: case` AC is covered by exactly
  one case. Zero coverage fails, and so does double coverage. A case's
  assertions are scoped to its one AC's substance plus the runner's
  mandatory envelope (exit code, stdout, stderr); it does not take on extra
  ACs' assertions. Near-duplicate cases and duplicated fixtures across cases
  are accepted by design — readability of the audit trail is preferred over
  maintenance efficiency.
- **Scenario checkpoints.** The real-Worktrunk lifecycle proof remains a
  single execution per scenario, but declares named checkpoints. Each
  checkpoint covers exactly one active `verifiedBy: checkpoint` AC, and each
  such AC is covered by exactly one checkpoint. The scenario fails if a
  declared checkpoint is not reached and asserted. The number of real
  Worktrunk lifecycle executions must not grow with the number of
  checkpoint ACs. Scenario-mode case manifests remain declared (as today:
  for traceability and living-doc rendering, never executed by the generic
  runner), but they carry no direct case-level AC coverage — a scenario's
  coverage is expressed exclusively through its declared checkpoints, and
  the one-case-one-AC rule above does not apply to scenario manifests.
- **Traceability authority.** One traceability function remains the sole
  authority (as `packages/cli/test/e2e/harness/traceability.ts` is today),
  called by both the E2E suite and the living-doc generator, so the gate and
  the document can never disagree. It enforces all the per-kind rules above.

Where the same behavior deserves proof from multiple angles, the answer is
multiple ACs (each with its own proof), never one AC with multiple proofs.

### 4. The Worktrunk-assumptions group (P1)

The contract layer is reframed: every assumption wtw makes about real
Worktrunk behavior (hooks fire at the documented moments, the blocking
pre-start copy completes before worktree readiness, post-remove reconcile
runs after removal, native approval semantics, version reporting, …) becomes
its own short AC in a dedicated requirements group, each proven by a named
checkpoint (or, where a single command suffices, a contract-mode case; the
owner confirmed both forms are legal — see the disposed lossless-mapping
review). **Mode alignment is enforced:** an assumption AC's evidence must be
real Worktrunk — the manifests declare, in a machine-readable way, that the
group's `verifiedBy: case` ACs require contract-mode coverage, and
traceability fails if a fast-mode case covers one (simulated evidence is
never real-Worktrunk proof). The declaration mechanism (a group-level or
AC-level marker) is the implementer's choice. This converts the implicit
assumptions currently buried in
`packages/cli/test/e2e/contract.test.ts` into an enumerated, auditable list.
The two-layer model is thereby explicit: the contract layer validates the
assumptions about real Worktrunk; the fast layer proves wtw's behavior in
simulated situations whose realism those assumptions guarantee.

### 5. Living document rendering (P1, P3)

`BEHAVIOR.md` remains fully generated (`bun run docs:living`, drift-checked
by `docs:living:check`). Its rendering changes to per-AC evidence:

- Every FR renders with its description and its AC list; every AC renders
  exactly once, with its own proof unit's specific evidence: the dedicated
  case's fixture/command/expected streams, or the checkpoint's step and
  assertion within the scenario, or the named unit-test file, or the named
  manual checklist step.
- No AC's section shares a rendered evidence body with another AC; the
  reader never re-reads evidence to verify a second criterion.
- Every AC's evidence is visibly labeled with its `verifiedBy` kind, and the
  existing real-vs-simulated dependency labeling (Real / Simulated / Not
  exercised) is retained.
- Retired FRs/ACs render distinguishably as tombstones (or in a dedicated
  retired section) so the active audit surface stays clean.

### 6. Migration (P2, P4)

The rewrite is a full renumbering: old `WTW-FR-<NNNN>` IDs and FR-encoding
AC IDs disappear from manifests, cases, and the generated document. To prove
no behavior guarantee is lost:

- A one-time migration audit artifact is written inside this thread. It maps
  **every** AC of the genesis spec's acceptance list (genesis FR-01 through
  FR-15, including criteria previously excluded from manifests) to the new
  compound ref(s) that absorb its substance, with a check-off per row.
- A row may be resolved only by (a) one or more new compound refs, or (b) an
  explicit owner-approved disposition recorded on the row. An implementer
  who believes an old criterion should be dropped must escalate to the
  owner; silent drops are prohibited.
- After the audit is complete and checked off, it is archived with this
  thread and never maintained again.

## Constraints

- **Platform and toolchain.** macOS is the verified platform. Bun is the
  package manager/test runner; the existing root scripts (`check`,
  `typecheck`, `test`, `test:e2e`, `test:contract`, `docs:living[:check]`,
  `build`, `test-and-report`) keep their names and their fail-fast gate
  role, and all must pass at completion.
- **Strict schemas stay strict.** The manifest and case schemas keep the
  current posture: unknown fields rejected, unsafe paths rejected, duplicate
  IDs rejected, deterministic loading order. New fields (`verifiedBy`,
  checkpoint declarations, evidence references) are added to the strict
  set, not exempted from it.
- **Contract pinning.** The contract suite keeps using a pinned real
  Worktrunk and the built bundle. As part of this rework the pin moves from
  v0.62.0 to v0.67.0 and the verified range from `>=0.62.0 <0.63.0` to
  `>=0.67.0 <0.68.0` (P6); the pin/range semantics (exact-version contract
  pin; min-inclusive, next-minor-exclusive verified range; below-range
  fails, above-range warns as unverified) are unchanged.
- **Generated file discipline.** `BEHAVIOR.md` is never hand-edited;
  `docs:living:check` must fail on drift, as today.
- **Frozen records.** The genesis thread's artifacts are not edited (P4).
  The jastr tree is not read as a build input and not modified (P5).
- **No product changes.** `packages/cli/src/` and `packages/core/src/` are
  untouched (see Scope), with exactly the P6 carve-out: the verified-range
  constants/messages in `packages/core/src/worktrunk/version.ts` and the
  comment-only version example in
  `packages/cli/src/diagnostics/categories.ts`.

## Acceptance criteria

Machine-checkable criteria for *this rework* (distinct namespace from the
manifest convention it mandates — these are spec-level checks a reviewer
runs once at completion). Each cites the decision it enforces. Every
criterion is machine-checkable (a committed test, a command exit, or a grep)
except the clauses explicitly labeled review-verified (in AC-1.5, AC-6.1,
and AC-8.1).

### FR-1 — Manifest convention adopted

- **AC-1.1:** Every requirement manifest under
  `packages/cli/requirements/functional/` loads under the strict schema;
  every FR ID matches `<DOMAIN>-FR-<NNNN>` with an uppercase-alphabetic
  domain prefix; all FRs within one manifest file share a single prefix and
  no two manifest files share a prefix (both violations fail loading, each
  proven by a test); no `WTW-FR-` ID remains anywhere in
  `packages/cli/requirements/`, `packages/cli/test/e2e/cases/`, or
  `packages/cli/docs/BEHAVIOR.md`. (P2)
- **AC-1.2:** Every AC ID matches `AC-<NNNN>` and is unique within its FR;
  every reference outside the owning FR uses the compound
  `<FR-ID>.<AC-ID>` form, enforced by schema. (P2)
- **AC-1.3:** No AC `statement` in any manifest contains the substrings
  `FR-`, `AC-`, or `(spec` — enforced by a schema/lint check that fails
  loading, with a test proving the rejection. (P2 codicil 2)
- **AC-1.4:** The schema accepts `status: retired` (with a mandatory reason)
  on FRs and ACs, and a test proves a retired AC is excluded from coverage
  obligations while its ID remains reserved (a duplicate re-use of a retired
  ID fails validation). (P2 codicil 1)
- **AC-1.5 (review-verified, not automatable):** Each AC statement reads as
  exactly one observable assertion; FR descriptions, not AC statements,
  carry shared context. (P2 codicil 2)

### FR-2 — Complete tree with `verifiedBy`

- **AC-2.1:** Every AC in every manifest carries
  `verifiedBy: case | checkpoint | unit | manual`; a manifest with a missing
  or unknown kind fails loading, with a test proving the rejection. (P3)
- **AC-2.2:** Manifests exist whose FRs absorb genesis FR-01 and FR-14
  substance (workspace/dependency-boundary invariants; living-doc and
  traceability gate), with `verifiedBy: unit` ACs naming existing test
  files — confirmed by the corresponding checked-off migration-audit rows.
  (P3, P4)
- **AC-2.3:** Traceability fails when a `verifiedBy: unit` AC references a
  non-existent test file, and when a `verifiedBy: manual` AC references a
  checklist step that does not resolve to
  `packages/cli/docs/RELEASE-CHECKLIST.md` content — each proven by a test.
  (P3)
- **AC-2.4:** At least one `verifiedBy: manual` AC exists covering the
  real-Cursor open/focus check, referencing its checklist step. (P3)

### FR-3 — One-to-one mapping enforced

- **AC-3.1:** Traceability fails if any declarative (fast- or contract-mode)
  case covers zero or more than one AC, or covers an AC whose kind is not
  `case`; a scenario-mode manifest carrying direct case-level AC coverage
  (outside its checkpoint declarations) also fails — each proven by tests.
  (P1)
- **AC-3.2:** Traceability fails if any active `verifiedBy: case` AC has
  zero or more than one covering case — proven by tests. (P1)
- **AC-3.3:** Traceability fails if any checkpoint covers anything but
  exactly one active `verifiedBy: checkpoint` AC, or if any such AC lacks
  exactly one checkpoint — proven by tests. (P1)
- **AC-3.4:** The E2E suite and the living-doc generator call the same
  traceability function (single authority), demonstrated by a persistent
  harness test that feeds one violating input to that shared function (not a
  one-off manual check). (P1)

### FR-4 — Worktrunk-assumptions group and checkpoints

- **AC-4.1:** A dedicated requirements group enumerates wtw's assumptions
  about real Worktrunk as individual ACs, each `verifiedBy: checkpoint` (or
  `case` in contract mode), and the migration audit confirms it absorbs all
  behavior previously proven only by `contract.test.ts`. (P1, P4)
- **AC-4.2:** Traceability fails when a fast-mode case covers a
  Worktrunk-assumption AC (mode alignment) — proven by a test. (P1)
- **AC-4.3:** The scenario execution fails when a declared checkpoint is not
  reached or its assertion does not hold — proven by a persistent harness
  test exercising the failure path. (P1)
- **AC-4.4:** The count of real-Worktrunk lifecycle executions in
  `test:contract` does not scale with the number of checkpoint ACs (one
  execution per scenario, as today). (P1)

### FR-5 — Per-AC living document

- **AC-5.1:** In the regenerated `BEHAVIOR.md`, every active AC appears
  exactly once with its own evidence block, labeled with its `verifiedBy`
  kind; no two ACs share one rendered evidence body. (P1, P3)
- **AC-5.2:** The real-vs-simulated dependency labeling is present per
  rendered case/checkpoint evidence, as today. (P1)
- **AC-5.3:** `bun run docs:living:check` passes immediately after
  `bun run docs:living`, and fails on any manual byte edit — as today,
  proven by the existing drift mechanism still being exercised in the gate.

### FR-6 — Migration audit complete

- **AC-6.1:** The migration audit artifact exists in this thread and
  contains one checked-off row for every AC of the genesis spec's
  acceptance section (genesis FR-01..FR-15), each resolving to new compound
  ref(s) or an explicit owner-approved disposition. Row completeness (one
  row per genesis AC, all checked) is mechanically countable against the
  genesis spec; whether each row's new refs truly absorb the old substance
  is review-verified. (P4)
- **AC-6.2:** No occurrence of the strings `WTW-FR-` or `(spec AC-` remains
  under `packages/cli/requirements/`, `packages/cli/test/e2e/`,
  `packages/cli/docs/BEHAVIOR.md`, or
  `packages/cli/docs/RELEASE-CHECKLIST.md` (the checklist's genesis-ID
  references are rewritten when its steps become `manual` evidence targets);
  no manifest `notes:` field matches `Task <n>`-style task references —
  each checkable by grep. (P2, P3)

### FR-7 — Gate green, product untouched

- **AC-7.1:** `bun run test-and-report` passes end-to-end on the completed
  rework, with the contract suite executing (not skipped) against the pinned
  Worktrunk v0.67.0.
- **AC-7.2:** `git diff` for the rework shows no modifications under
  `packages/cli/src/` or `packages/core/src/` except the P6 carve-out:
  `packages/core/src/worktrunk/version.ts` (verified-range
  constants/messages) and `packages/cli/src/diagnostics/categories.ts`
  (comment only).

### FR-8 — Model documentation updated

- **AC-8.1:** `AGENTS.md` contains no occurrence of `WTW-FR-` and no
  "FR-02..FR-13"-style traceability-scope claim (grep-checkable); its
  verification-model description accurately reflects the new convention
  (review-verified), per its own update rule.

### FR-9 — Worktrunk pin updated (P6)

- **AC-9.1:** The contract suite is pinned to real Worktrunk v0.67.0 and
  `packages/core` evaluates versions against `>=0.67.0 <0.68.0` with
  unchanged semantics (in-range passes, below-range fails, `0.68.0` and
  newer warns) — proven by the updated core version unit tests and the
  version-boundary E2E cases, and by the contract suite executing per
  AC-7.1.
- **AC-9.2:** No occurrence of the version strings `0.62.` or `0.63.`
  remains under `packages/cli/src/`, `packages/core/src/`,
  `packages/*/test/`, `packages/cli/requirements/`, `packages/cli/docs/`,
  or in `AGENTS.md` — checkable by grep.

**Coverage note:** every expected-behavior clause in sections 1–6 above is
enforced by at least one AC here: section 1 → FR-1; section 2 → FR-2;
section 3 → FR-3; section 4 → FR-4; section 5 → FR-5; section 6 → FR-6 and
AC-6.2; the constraints → FR-7 and FR-8, and the contract-pinning
constraint's P6 bump → FR-9.

## Degrees of freedom

The *what* above is pinned; the following *hows* are explicitly the
implementer's choice:

- **The FR decomposition itself:** how many FRs, their titles, their exact
  domain prefixes and file organization — bounded only by the convention
  rules (narrow FRs, prefix matches the file's domain) and the migration
  audit (no substance lost).
- **The wording and enumeration of all new AC statements**, including the
  Worktrunk-assumptions list — bounded by the statement grammar and the
  audit.
- **Checkpoint declaration syntax and wiring:** where checkpoints are
  declared (scenario `case.yml`, a sibling file, or another schema shape),
  their ID grammar, and how the scenario test registers/asserts them —
  bounded by strict-schema validation, the 1:1 rules, and renderability in
  `BEHAVIOR.md`.
- **The mode-alignment marker for the Worktrunk-assumptions group** (a
  group-level or per-AC declaration), bounded by the rule that traceability
  must reject fast-mode coverage of an assumption AC.
- **The filename↔prefix spelling** (how a manifest filename expresses its
  domain), bounded by one-prefix-per-file and prefix uniqueness across
  files.
- **Field names and shapes for evidence references** (`unit` test-file
  refs, `manual` checklist refs, the retirement reason field), and whether
  `covers` stays a one-element list or becomes a scalar.
- **Whether the auxiliary `deferred` FR status is retained**, provided
  `retired` semantics are implemented as specified.
- **The migration audit's exact path and format inside this thread**, and
  the order of migration work — provided the audit is complete before the
  rework is declared done.
- **Case naming, fixture layout, and any fixture-sharing mechanism** —
  duplication is explicitly acceptable (P1); sharing is permitted but never
  at the cost of per-case readability.
- **BEHAVIOR.md's exact layout** (section ordering, tombstone presentation,
  anchors), bounded by the per-AC rendering rules in section 5.

## Unresolved questions

None blocking. All settled decisions are recorded in
`seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md`
(P1–P5); any specific not pinned above is either listed as a degree of
freedom or must be escalated to the owner rather than decided silently.
