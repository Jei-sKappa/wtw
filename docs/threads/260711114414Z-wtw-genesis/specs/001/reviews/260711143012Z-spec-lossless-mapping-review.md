---
status:
  disposed: 260711152827Z
  disposition: accepted
  rationale: specs/001/discussions/260711143813Z-review-findings-decision-log.md
---

# Lossless-mapping review — WorkTrunk Wrapper MVP specification

## References

- Document under review (spec): `specs/001/spec.md`
- Source decision log (genesis discussion, targets the seed; P1–P28): `seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md`
- Upstream seed (handoff document the discussion elaborated): `seed/seed.md`
- Thread lifecycle ledger (tier 2): `ledger.md`

The spec maps against the single decision log above; the seed is upstream input the discussion already digested (its "consider"-level pointers are not user decisions). Where a finding hinges on supersession, the governing identifier is P16 (supersedes P2's environment activation, P3/P6's primary-only `.worktreeinclude`, and P7's generated-state ownership) and P25 (final `init` output/behavior).

## Verdict

**Lossless — the review passes.** Both Findings sections are empty: every decision and assumption the spec commits to traces to a P-decision the user accepted (or is declared a Degree of freedom), and every one of P1–P28 is carried into the spec, including the correct death of the superseded decisions. Two concretizations are surfaced as Open Questions — they are plausibly faithful, not clearly smuggled — but neither blocks the lossless verdict.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

None — every committed choice in the spec was checked against P1–P28 and traces to an accepted decision or to the `## Degrees of freedom` section. Spot-checks that could have been additive but are not:

- Check category set and order (Repository → Dependencies → Privacy → Worktrunk → Copy policy → Synchronization → Cursor workspace), `PASS`/`WARN`/`FAIL`, exit-0-with-warnings / exit-1-on-failure, no JSON — verbatim from P24.
- Workspace folder ordering, `detached@<short-sha>` labels, absolute paths, exclusion of prunable/missing registrations without pruning — verbatim from P22.
- Verified Worktrunk range `>=0.62.0 <0.63.0`, v0.63.0+ warns-not-fails, unparseable fails — verbatim from P20.
- `<version> (dev)` / `<version> (<short-sha>)`, `WTW_GIT_SHA`, no dirty-tree suffix, build-fails-without-SHA — verbatim from P14.
- `~/.local/bin/wtw` symlink install, private packages, no registry/Homebrew/standalone — verbatim from P26.
- `Error: <message>` single-line stderr envelope, exit 1, empty stdout — verbatim from P15/P27.
- Implementation-detail choices left open (TOML/JSONC/lock libraries, Node baseline, lock path/timing, exclude-marker spelling, initial version) are correctly parked in `## Degrees of freedom`, not silently committed.

### (b) Dropped — decisions the user made that the document failed to capture

None — P1–P28 were each located in the spec. Supersession is handled correctly rather than by silent omission:

- P2 (environment activation via `WORKTRUNK_PROJECT_CONFIG_PATH`) is explicitly retired by P16; the spec carries no env-var model and says so (Context; `.config/wt.toml` section citing P16 superseding P8's activation).
- P3/P6/P7 residue (generated-state directory, primary-only include, generated-state ownership) is dropped exactly where P16 supersedes it, and the retained parts (managed `info/exclude` block, primary as authoritative source, idempotent safe init) are kept — AC-04.3/AC-07.3 annotate the supersession inline.
- P8's approval boundary is kept (init neither grants nor bypasses; native first-use flow); P8's now-obsolete "print activation/first-use instructions" is correctly governed by the later, more specific P25 ("prints no generic next-step advice"), not dropped in error.
- P13's real-contract "activation" item is absent only because activation itself was superseded by P16; the remaining contract obligations (init, native approval, blocking copy, post-start sync, linked-worktree removal, post-remove reconcile) are all present in the E2E section and FR-13.

## Open Questions

- **Reserved hook-name spelling.** The spec pins `wtw-copy` and `wtw-sync` as the reserved hook names and declares the "three reserved hook names and command strings" the immutable `wtw` contract (`.config/wt.toml` section; AC-06.1/AC-06.2/AC-06.3). P16 established "distinct named hooks" and P18 established that `check` "validate[s] the required names and commands exactly" — so the user accepted that reserved named hooks exist and are the contract, but the discussions never show these specific name strings, and the DoF section pins "exact scaffold commands" without listing the names. Is fixing the exact name spelling a faithful concretization of P16/P18, or should the names be added to `## Degrees of freedom` (as the exclude-marker spelling and JSONC formatting already are)?
- **Dual-OS test matrix.** AC-03.2 requires "macOS and Linux cases" for space-containing paths, implying a two-OS CI matrix. P19 declares macOS and Linux both officially supported, but P13 (which defines the E2E execution model) describes the two modes without committing to running them on both operating systems. Did the user sign up for dual-OS execution of the suites, or is single-OS execution acceptable with macOS/Linux support asserted by portability review?

## Next Actions

- Treat the spec as **ready to be approved on the lossless-mapping axis** — it faithfully carries P1–P28 and adds nothing the user did not accept.
- Before setting `status.approved`, resolve the two Open Questions in a short follow-on discussion: either confirm both concretizations as faithful (accept-and-leave), or move the hook names / dual-OS matrix into `## Degrees of freedom` or an explicit decision. Because both sit at AC granularity, disposing them is a light touch; a full re-run of this review is only needed if that discussion adds or removes a committed decision.
