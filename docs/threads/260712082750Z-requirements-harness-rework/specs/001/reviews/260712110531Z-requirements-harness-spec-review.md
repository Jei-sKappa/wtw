---
status:
  accepted: 260712111041Z
---

# Review — spec quality check of specs/001/spec.md against the handoff-grade bar

## References

- Spec under review (requirements/E2E harness rework): specs/001/spec.md
- Decision log checked for consistency (P1–P5, P2 codicils 1–2, P3 boundary rule): seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md
- Thread ledger (tier 2 rationale): ledger.md
- Prior accepted review on the same spec (lossless-mapping axis; its open question on assumption-AC proof units was owner-confirmed at disposition): specs/001/reviews/260712105618Z-spec-lossless-mapping-review.md
- Current traceability authority the spec's §3 claims describe (verified accurate — single function, called by suite and generator): packages/cli/test/e2e/harness/traceability.ts
- Current manifest schema (verified: strict fields, `removed`/`deferred` statuses, `removedReason` requirement, `AC-<NNNN>` pattern): packages/cli/test/e2e/harness/requirements.ts
- Current case schema (verified: `fast`/`contract`/`scenario` modes, mandatory `expect.exitCode`/stdout/stderr envelope, compound `covers` refs): packages/cli/test/e2e/harness/case-manifest.ts
- Stale-notes example the spec's Context cites (verified: "Tasks 12 and 13" prose present): packages/cli/requirements/functional/10-cursor-launch.yml
- Existing multi-AC scenario case affected by the rework (`mode: scenario`, multi-ref `covers`): packages/cli/test/e2e/cases/contract-lifecycle/case.yml
- Manual-evidence surface referenced by the `manual` kind (verified: contains genesis-style "FR-10" / "spec AC-10.4" references): packages/cli/docs/RELEASE-CHECKLIST.md
- Genesis acceptance list the migration audit maps from (verified: FR-01..FR-15 present): docs/threads/260711114414Z-wtw-genesis/specs/001/spec.md
- Traceability call sites confirming the single-authority claim: packages/cli/test/e2e/e2e.test.ts, packages/cli/scripts/generate-living-docs.ts

## Verdict

**Ready.** All eight semantic-contract elements are present and coherent; every
factual claim the spec makes about the current codebase was verified accurate;
all five decision-log decisions (including both P2 codicils and the P3 boundary
rule) are carried without contradiction or silent reversal; the degrees-of-
freedom section cleanly separates pinned *what* from delegated *how*. The
highest-impact residue is two issue-level ambiguities at the scenario-case /
traceability seam (findings 1–2) — a junior implementer can build from this
spec, but under the spec's own "escalate rather than decide silently" rule
those two points will each cost an owner round-trip unless clarified first.

## Findings

### 1. `issue` — Expected behavior: the `scenario` case mode's traceability standing is unstated

Element: expected behavior (§3), cross-referencing acceptance (AC-3.1).
Type: partial coverage / hidden assumption. Today `contract-lifecycle/case.yml`
is `mode: scenario` with a multi-ref `covers` list — the exact artifact the
checkpoint concept replaces. §3 binds "every case (fast or contract mode)" to
the 1:1 rule and AC-3.1 polices "any declarative case", but the spec never says
what becomes of the scenario-mode case manifest itself: whether it survives,
whether it may or must carry `covers`, and how a surviving scenario case is
treated by the zero/double-coverage checks. The DoF entry on checkpoint wiring
("scenario `case.yml`, a sibling file, or another schema shape") delegates the
syntax, but not the traceability obligation: an implementer who keeps a
scenario case.yml with a covers list cannot tell from the spec whether that
passes or fails AC-3.1. Downstream impact: a guess between "scenario cases are
exempt from the declarative-case rule" and "scenario cases must lose `covers`
entirely" — either an owner escalation or a silently divergent implementation.

### 2. `issue` — Expected behavior / acceptance guidance: mode alignment for Worktrunk-assumption ACs is unenforced

Element: expected behavior (§4) and acceptance guidance (AC-4.1). Type: gap
between a stated rule and its enforcement. §4 permits an assumption AC to be
proven by "a contract-mode case", and AC-4.1 repeats "(or `case` in contract
mode)" — but the `verifiedBy` vocabulary has a single `case` kind that does not
encode mode, and no stated traceability rule prevents a *fast*-mode case from
covering a Worktrunk-assumption AC. The two-layer model the section declares
("the contract layer validates the assumptions") is therefore guarded only by
human review, and the spec does not say whether that is intentional. Downstream
impact: an implementer could satisfy every machine check while proving a
real-Worktrunk assumption against the fake shim — the precise failure the group
exists to prevent. The spec should state whether traceability must enforce
mode alignment for the assumptions group, or explicitly assign it to review.

### 3. `nit` — Expected behavior: "prefix matches the manifest file's domain" has no defined binding and no enforcing AC

Element: expected behavior (§1 FR IDs) and DoF. Type: vague-but-present. The
convention requires the domain prefix to "match the manifest file's domain",
and the DoF re-states that bound, but nothing defines how a file's domain is
determined (filename convention? a declared field?) and no acceptance criterion
enforces the match — AC-1.1 checks only the ID regex. An implementer must guess
whether placing a `SYNC-FR-*` requirement in the init-domain file is a schema
error, a traceability error, or merely poor style.

### 4. `nit` — Acceptance guidance: the "machine-checkable" preamble over-claims; several criteria are partly human checks without the AC-1.5-style label

Element: acceptance guidance. Type: false precision. The section opens with
"Machine-checkable criteria" and labels only AC-1.5 as review-verified, but:
AC-3.4's "demonstrated by both failing on the same seeded violation" does not
say whether the demonstration is a committed test or a one-off; AC-4.2 offers
"a deliberate seeded failure" as proof, which leaves no persistent artifact;
AC-6.2's "'not yet implemented'-style state" clause and AC-8.1's doc check are
judgment calls; AC-4.1's audit-confirmation clause is a review act. Downstream
impact: a reviewer assembling the completion checklist cannot mechanize what
the preamble promises is mechanical, and an implementer may satisfy AC-4.2
with an undocumented one-time demonstration.

### 5. `nit` — Expected behavior / constraints: resolution root for `verifiedBy: unit` test-file references is unstated

Element: expected behavior (§2) with acceptance tether AC-2.3. Type: hidden
assumption. Manifests live under `packages/cli/`, but the canonical unit
evidence for genesis FR-01 substance is `packages/core/test/dependency-boundary.test.ts`
— another package. The existence check in AC-2.3 needs a resolution root
(repo-relative vs package-relative), and the DoF entry covers field *shape*,
not resolution semantics. Two implementers would pick differently and one
would fail the other's traceability.

### 6. `nit` — Scope / acceptance: the stale-ID sweep omits RELEASE-CHECKLIST.md, which carries genesis-style IDs today

Element: scope and acceptance guidance (AC-6.2). Type: gap. AC-6.2 sweeps
`packages/cli/requirements/`, `packages/cli/test/e2e/`, and `BEHAVIOR.md`, but
`packages/cli/docs/RELEASE-CHECKLIST.md` — the mandated `manual`-evidence
surface — currently titles its section "FR-10 — Cursor launch (manual evidence
for spec AC-10.4)". Scope includes the checklist only "if touched by evidence
references", so a minimal implementation could leave the manual audit surface
citing dead genesis IDs while new `manual` ACs point at it.

### 7. `nit` — Expected behavior: the blanket `FR-`/`AC-` substring ban collides with self-describing harness ACs

Element: expected behavior (§1 statement grammar, AC-1.3). Type: unjustified
absolute at the edge. The tree must absorb genesis FR-14 substance (the
manifest/traceability harness itself), whose natural AC statements describe ID
grammars — e.g. "the loader rejects a requirement ID not matching
`<DOMAIN>-FR-<NNNN>`" — which the lint forbids, since the statement contains
`FR-`. Paraphrase is possible ("the requirement-ID pattern"), but the spec
neither acknowledges the edge nor grants an escape, so an implementer may
write a statement that fails its own lint and be unsure whether that means
reword or relax.

## Evidence

- Finding 1: spec §3 "Every case (fast or contract mode) covers exactly one AC" and AC-3.1 "any declarative case"; the unaddressed artifact is `packages/cli/test/e2e/cases/contract-lifecycle/case.yml` (`mode: scenario`, multi-ref `covers`); the mode is defined in `packages/cli/test/e2e/harness/case-manifest.ts` (`CASE_MODES`).
- Finding 2: spec §4 "(or, where a single command suffices, a contract-mode case)" and AC-4.1 "(or `case` in contract mode)" versus §2's mode-blind kind definition "`case` — proven by exactly one declarative E2E case (fast or contract mode)"; owner confirmation of the alternative is recorded in specs/001/reviews/260712105618Z-spec-lossless-mapping-review.md (Disposition) — this finding is about enforcement, not about whether the alternative is legitimate.
- Finding 3: spec §1 "an uppercase-alphabetic domain prefix that matches the manifest file's domain" versus AC-1.1, which checks only the pattern.
- Finding 4: spec "Acceptance criteria" preamble "Machine-checkable criteria for *this rework*"; AC-3.4 "demonstrated by both failing on the same seeded violation"; AC-4.2 "proven by a harness test or a deliberate seeded failure"; AC-6.2 "'not yet implemented'-style state".
- Finding 5: spec §2 "`unit` … the AC must reference an existing test file path"; the cross-package target is `packages/core/test/dependency-boundary.test.ts` (named in AGENTS.md as the boundary test).
- Finding 6: spec AC-6.2's three swept locations versus the current heading in packages/cli/docs/RELEASE-CHECKLIST.md ("FR-10 — Cursor launch (manual evidence for spec AC-10.4)"); spec Scope "if touched by evidence references".
- Finding 7: spec §1 "Statements contain no ID tokens (no `FR-`/`AC-` substrings)" and AC-1.3, versus §2's requirement that the tree include "genesis FR-14 (the living behavior document and traceability gate)" substance.
- Decision-log consistency (no findings): every operative spec commitment traced to P1–P5 of seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md; no settled decision is contradicted or silently reversed. Codebase claims verified: stale "Tasks 12 and 13" notes (packages/cli/requirements/functional/10-cursor-launch.yml), single traceability authority with two call sites (packages/cli/test/e2e/harness/traceability.ts, e2e.test.ts, scripts/generate-living-docs.ts), strict schemas and current `removed` literal (harness/requirements.ts), genesis FR-01..FR-15 list, Real/Simulated/Not-exercised labeling in BEHAVIOR.md, and the root script names in package.json.

## Open Questions

- Finding 1 (author): should scenario-mode case manifests survive at all under the new model, and if so may they carry `covers`? If the intended answer is "entirely the implementer's choice within the checkpoint-wiring DoF", saying so beside AC-3.1 (e.g. defining "declarative case" as excluding `mode: scenario`) closes the gap without pinning a design.
- Finding 2 (author): is fast-mode coverage of a Worktrunk-assumption AC a traceability failure, or a review-caught convention breach? Either answer works; only silence forces a guess.
- Finding 5 (likely resolvable in planning): are unit-test references repo-relative? If the author has a preference, one clause settles it; otherwise it can be an implementer choice noted in the DoF list.

## Next Actions

- Revise the spec in place for findings 1 and 2 — one or two sentences each (scenario-case standing beside AC-3.1; enforcement locus for assumption-AC mode alignment beside AC-4.1). These are the only findings likely to trigger the spec's mandatory owner-escalation path mid-implementation.
- Optionally fold findings 3–7 into the same revision pass: define or explicitly delegate the file↔domain binding; label the non-mechanical clauses of AC-3.4/AC-4.2/AC-6.2/AC-8.1 as review-verified (or require committed tests); state the unit-reference resolution root; add RELEASE-CHECKLIST.md to AC-6.2's sweep (or state why it is exempt); acknowledge the ID-grammar edge in AC-1.3 (paraphrase is the expected resolution).
- No adversarial pass has been run on this spec. Given the thread is tier 2 and the rework's blast radius is the verification gate itself (a wrong traceability rule silently weakens every future audit), a short pre-mortem on the traceability rules is worth considering before planning; not blocking.

## Disposition

Accepted @ 260712111041Z. All seven findings were fixed in place in
specs/001/spec.md (bumping it to version 2):

- Finding 1 → §3 now states scenario-mode manifests survive (traceability +
  rendering only), carry no direct case-level AC coverage, and are excluded
  from the one-case-one-AC rule; AC-3.1 polices declarative (fast/contract)
  cases and fails a scenario manifest carrying direct coverage.
- Finding 2 → §4 now mandates machine-enforced mode alignment (traceability
  rejects fast-mode coverage of an assumption AC; marker mechanism is DoF);
  new AC-4.2 tests it (subsequent ACs renumbered: old AC-4.2→4.3,
  4.3→4.4 — legal here because this spec is a Draft, not an emitted
  requirement manifest under the ID-stability rule it mandates).
- Finding 3 → §1 pins one-prefix-per-file and prefix uniqueness across
  files; AC-1.1 enforces both; filename↔prefix spelling added to DoF.
- Finding 4 → acceptance preamble now names the review-verified clauses
  (AC-1.5, AC-6.1, AC-8.1); AC-3.4 and AC-4.3 require persistent committed
  tests; AC-6.2's notes check is a concrete grep; AC-8.1 split into
  grep-checkable and review-verified clauses.
- Finding 5 → §2 pins repo-root-relative unit test references.
- Finding 6 → RELEASE-CHECKLIST.md moved to definite scope and added to
  AC-6.2's sweep.
- Finding 7 → §1 states the ID-token lint is absolute and self-describing
  ACs must paraphrase, never exempt.

The optional adversarial pre-mortem on the traceability rules remains open
as a recommendation for the owner before planning.
