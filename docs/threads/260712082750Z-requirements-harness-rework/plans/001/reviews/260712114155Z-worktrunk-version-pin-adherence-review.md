---
status:
  disposed: 260712115028Z
  disposition: accepted
  rationale: seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md
---

# Plan adherence review — requirements-harness rework plan vs. spec 001

## References

- Plan under review (index): plans/001/plan.md
- Spec the plan is judged against (v2, approved 260712111323Z): specs/001/spec.md
- Task exposing the contract-gate gap: plans/001/tasks/13-scenario-checkpoint-wiring.md
- Task exposing the full-gate/product-untouched tension: plans/001/tasks/14-docs-and-full-gate.md
- Contract-suite version pin (repo): packages/cli/test/e2e/harness/contract-env.ts
- Verified-range constants in product code (repo): packages/core/src/worktrunk/version.ts
- Contract suite skip behavior (repo): packages/cli/test/e2e/contract.test.ts
- Prior spec reviews (same thread): specs/001/reviews/260712105618Z-spec-lossless-mapping-review.md, specs/001/reviews/260712110531Z-requirements-harness-spec-review.md

## Verdict

`spec-fault — needs human`. The plan **adheres to the spec as written** — all
structural checks pass (14 contiguous tasks matching the index, valid
seven-element task shape throughout, no dangling `Consumes:`, Global
Constraints verbatim against the spec, no parallelization constructs, every
spec AC-1.1..AC-8.1 mapped to a covering task, and every plan-pinned choice
falls inside the spec's Degrees-of-freedom grants). No outcome-2 auto-fixes
were needed; the plan was not modified.

One spec-fault finding remains, triggered by new information from the owner:
the locally installed Worktrunk is now **v0.67.0**, while the spec's
"Contract pinning" constraint pins the contract suite to **v0.62.0** and
freezes the verified range `>=0.62.0 <0.63.0`. The owner has stated the
version requirement should be updated to support the new version. The plan
cannot absorb this — the fix is to the SPEC.

## Findings

### Finding 1 (blocker, spec fault): the Worktrunk version pin is stale against the environment and the owner's stated intent, and amending it collides with the spec's own no-product-changes constraint

**The fix is to the SPEC, not the plan.**

The spec's Constraints section pins "the pinned real Worktrunk v0.62.0" and
declares "the verified range `>=0.62.0 <0.63.0` semantics are unchanged."
The plan copied this verbatim (as it must) and Tasks 12–14 build their
contract-gate verification on it. Three facts make this a spec-level decision
the plan cannot legitimately resolve:

1. **The contract gate goes vacuous on this machine.** With wt v0.67.0
   installed, `resolvePinnedWorktrunk` returns not-ok and the entire contract
   suite **skips** (it does not fail). Task 13's verification
   ("`bun run test:contract` exits 0") and Task 14's full gate
   (`test-and-report`, spec AC-7.1) would pass without ever executing the
   scenario checkpoint wiring the rework exists to prove (spec AC-4.3/AC-4.4).
   The `WORKTRUNK_BIN` override can point at a different binary, but the
   version equality check to 0.62.0 is not overridable.
2. **Re-pinning requires product-code changes the spec forbids.** The verified
   range lives as `VERIFIED_MIN`/`VERIFIED_NEXT` constants (plus user-facing
   message strings) in `packages/core/src/worktrunk/version.ts` — under
   `packages/core/src/`, which the spec's "No product changes" constraint and
   AC-7.2 declare byte-untouched, with an explicit stop-and-escalate rule.
   Supporting v0.67.0 cannot be done inside this spec as approved.
3. **Re-pinning is a verification claim, not a string edit.** Bumping the
   range asserts wtw is verified against 0.67.0 — five Worktrunk minor
   versions ahead of what the contract assumptions were proven on. It also
   fans out to `PINNED_WORKTRUNK_VERSION` in `contract-env.ts`, the
   version-boundary E2E cases (`check-version-0620-passes`,
   `check-version-0629-passes`, `check-version-below-fails`) and their
   expected outputs, the regenerated `BEHAVIOR.md`, and `AGENTS.md`'s
   verified-range line.

If the plan were patched to target 0.67.0, its Global Constraints block would
drift from the approved spec (this review would then flag it as verbatim-copy
drift) and the implementation would violate AC-7.2. Only an owner-approved
spec amendment can resolve the contradiction.

## Evidence

- Spec, Constraints, "Contract pinning": "the verified range `>=0.62.0 <0.63.0` semantics are unchanged."
- Spec, Scope and non-scope: "Files under `packages/cli/src/` and `packages/core/src/` are not modified."
- Plan task 13 (`tasks/13-scenario-checkpoint-wiring.md`), Verification: "`bun run test:contract` exits 0 (… against the pinned Worktrunk v0.62.0)."
- Plan task 14 (`tasks/14-docs-and-full-gate.md`), Steps 5–6: the `test-and-report` gate (AC-7.1) and the empty product diff (AC-7.2).
- `packages/cli/test/e2e/contract.test.ts:96-99`: a non-ok resolution yields `it.skip`, not a failure.
- `packages/cli/test/e2e/harness/contract-env.ts:19`: `PINNED_WORKTRUNK_VERSION = "0.62.0"`; the version equality check has no override.
- Local environment at review time: `wt --version` → `wt v0.67.0`.

## Open Questions

1. **What should the amended pin be?** Pin the contract suite to exactly
   v0.67.0 with verified range `>=0.67.0 <0.68.0`, or something wider? (The
   current range shape is min-inclusive/next-minor-exclusive.)
2. **Where does the version bump land?** Options the owner must choose
   between: (a) amend this spec to carve the version bump into scope
   (weakening "No product changes" to except `version.ts` and the
   version-boundary cases), or (b) keep this rework on 0.62.0 semantics and
   run the version bump as a separate thread sequenced before or after it. If
   (b)-before, this rework's manifests are written against 0.67.0 from the
   start; if (b)-after, an archived 0.62.0 `wt` binary must be reachable via
   `WORKTRUNK_BIN` for Tasks 12–14's contract gate to actually execute rather
   than skip.
3. **Is a 0.62.0 binary still available on this machine at all?** If not and
   the owner picks (b)-after, Task 13/14 verification cannot execute the
   contract suite, and the rework's checkpoint proof would land unexercised
   until the bump thread runs.

## Next Actions

- **Amend the spec** (owner-approved, record-backed): update the "Contract
  pinning" constraint to the chosen Worktrunk version/range, and resolve the
  collision with "No product changes"/AC-7.2 per Open Question 2 — either an
  explicit scope carve-out in this spec or a decision to sequence the bump as
  its own thread.
- After the amendment, **re-copy the plan's Global Constraints verbatim** and
  update the pinned-version mentions in Tasks 12–14 (a re-run of this
  adherence review will do this as ordinary outcome-2 auto-fixes).
