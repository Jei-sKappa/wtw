---
status:
  accepted: 260712110155Z
---

# Review — lossless-mapping check of specs/001/spec.md against the genesis decisions

## References

- Document under review (spec for the requirements/harness rework): specs/001/spec.md
- Decision log the spec maps from (decisions P1–P5, including P2 codicils 1–2 and the P3 boundary rule): seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md
- Trigger narrative (upstream framing the decisions settled): seed/seed.md
- Current manifest schema consulted to classify two spec presuppositions as status quo rather than new decisions (`removed` status requires `removedReason`): packages/cli/test/e2e/harness/requirements.ts
- Current case schema consulted for the "mandatory envelope" presupposition (`expect.exitCode` is required today): packages/cli/test/e2e/harness/case-manifest.ts

## Verdict

The mapping is **lossless and additive-free** — both findings sections are empty; the review passes. One genuine ambiguity (whether the contract-mode-case alternative for Worktrunk-assumption ACs is elaboration of P1 or a new proof-unit choice) is raised under Open Questions for the owner to confirm.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

None — every committed choice in the spec traces to a P1–P5 decision (including their codicils and the P3 boundary rule, which is carried near-verbatim), to the seed's framing, to standing project rules in `AGENTS.md` (script names, gate discipline, generated-file discipline, pinned Worktrunk range), or to verified status quo of the existing harness explicitly restated as "as today" (the mandatory `exitCode` expectation behind the "runner's mandatory envelope" carve-out; the mandatory reason on the retirement status, which mirrors today's `removedReason` requirement on `removed`; the Real/Simulated/Not-exercised labeling). Everything else that would otherwise pin an implementation choice — FR decomposition, AC wording, checkpoint syntax, evidence-reference field shapes, the `deferred` status, audit path/format, fixture layout, BEHAVIOR.md layout — is explicitly declared in `## Degrees of freedom`. The migration rule allowing a row to close via "an explicit owner-approved disposition" (spec §6) was checked and judged non-additive: it routes any drop to the owner as an escalation rather than deciding on the owner's behalf, consistent with P4's "prove nothing was dropped".

### (b) Dropped — decisions the user made that the spec failed to capture

None — every clause of P1–P5 is carried:

- P1: one-to-one everywhere (spec §3), fast-mode strict bijection with zero/double coverage both failing (§3, AC-3.1/3.2), the checkpoint concept enforced by traceability (§3, AC-3.3), single scenario execution that must not scale with checkpoint ACs (§4, AC-4.3), per-AC evidence rendering with no shared body (§5, AC-5.1), fixture/near-duplicate duplication explicitly accepted with readability preferred over maintenance efficiency (§3, DoF), and the explicit two-layer model (§4 closing sentence).
- P2: full jastr convention — narrow FRs, per-domain prefixes matching the manifest file, per-FR local AC numbering, compound cross-references everywhere (§1, AC-1.1/1.2); full renumbering with old IDs disappearing from manifests, cases, and BEHAVIOR.md (§6, AC-1.1, AC-6.2); codicil 1 (append-only IDs, `status: retired`, meaningless gaps — §1, AC-1.4); codicil 2 (one-assertion statement grammar, no embedded IDs, no spec back-references — §1, AC-1.3, AC-1.5).
- P3: complete tree including genesis FR-01/FR-14 substance and manual-only criteria (§2, AC-2.2, AC-2.4), `verifiedBy: case | checkpoint | unit | manual` on every AC with per-kind traceability enforcement (§2, AC-2.1, AC-2.3), visible kind labeling in BEHAVIOR.md (§5, AC-5.1), and the `unit` boundary rule stated explicitly as P3 required (§2).
- P4: manifests as the single authoritative acceptance registry (Intended outcome), genesis spec frozen/historical and never edited (Scope, Constraints), the one-time checked-off migration audit covering every genesis AC including previously excluded ones, archived with the thread and never maintained (§6, AC-6.1, Scope).
- P5: wtw-only scope, jastr untouched and never a build dependency, convention stated self-containedly, `.library/sources/` may be absent (Scope, Constraints, §1 preamble).

## Open Questions

- **Proof unit for Worktrunk-assumption ACs (spec §4 and AC-4.1).** The spec says each assumption is proven "by a named checkpoint (or, where a single command suffices, a contract-mode case)" and AC-4.1 permits "`verifiedBy: checkpoint` (or `case` in contract mode)". P1's decision names only checkpoints as the proof unit for this group ("the single real-Worktrunk lifecycle execution declares named checkpoints, each checkpoint covering exactly one AC"). Contract-mode declarative cases exist in today's harness and P1's "one-to-one everywhere" binds them, so the alternative is plausibly faithful elaboration (e.g. a `wt --version` assumption needs no lifecycle) — but it is also readable as a new proof-unit choice for that group. Owner to confirm the alternative is intended.

## Next Actions

- The spec is ready to carry the user's decisions forward on the lossless-mapping axis — no smuggled decisions to remove or mark as DoF, no dropped decisions to add.
- Before approval, have the owner confirm the single Open Question (contract-mode-case alternative for assumption ACs); if intended, no spec change is needed — the confirmation can be noted when disposing this review.

## Disposition

Accepted @ 260712110155Z. The owner confirmed the Open Question: for
Worktrunk-assumption ACs the proof unit may be either a scenario checkpoint
or a single-command contract-mode case (checkpoints are not the only legal
form). The spec text stands unchanged; no findings required action.
