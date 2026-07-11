---
status:
  disposed: 260711152838Z
  disposition: accepted
  rationale: specs/001/discussions/260711143813Z-review-findings-decision-log.md
---

# Review — WorkTrunk Wrapper MVP specification

## References

- Spec under review: `specs/001/spec.md` (version 1)
- Decision log checked against: `seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` (P1–P28; operative here: P4 Cursor workspace, P16 worktree-local setup, P17 code-workspace customization, P18 existing TOML, P20 compatibility, P22 workspace-folder representation, P23 sync scope/concurrency, P24 diagnostics, P25 init model, P27 command surface)
- Thread seed (context/prototype provenance): `seed/seed.md`
- Prior reviews on this spec: none found

## Verdict

**Partially ready.** All eight semantic-contract elements are present, coherent, and unusually thorough, and no settled decision is contradicted. What holds it back from `ready` is a small cluster of expected-behavior gaps around the Cursor workspace and `sync` — most sharply the undefined predicate "unrecognized workspace collision" — that force a downstream implementer (and E2E case author) to invent behavior the spec elsewhere asserts is deterministic and machine-checkable. Pin those and the spec passes the handoff-grade bar.

## Findings

### 1. `issue` — "unrecognized workspace collision" is never defined (expected behavior / init)

The `init` preflight lists two *separate* workspace checks — "absence of an unrecognized workspace collision" and "validity of existing `.worktreeinclude`, JSONC, and managed exclude content" (Public CLI contract → `wtw init`) — and AC-09.1 requires `init` to "refuse an unrecognized collision without writes." But the spec never says what makes an existing workspace file "unrecognized," nor how "unrecognized collision" differs from the separately-listed "invalid JSONC" case. The intended model is reconcilable by careful reading (a valid existing workspace is adopted and its `folders` synced by the internal sync run; invalid JSONC is a no-write failure), which leaves "unrecognized collision" as some third category that is never characterized. Two implementers could reasonably build "refuse any pre-existing workspace file" versus "adopt any valid workspace, refuse only non-workspace/garbage files" — a materially different init contract on a common real-world starting state (a repo that already has a `.code-workspace`).

### 2. `issue` — detached-worktree sort key is underspecified while determinism is asserted (expected behavior / Cursor workspace)

The workspace folder list "sort[s] remaining entries by branch name and then absolute path" and labels "detached entries [as] `detached@<short-sha>`" (Canonical local artifacts → Cursor workspace; AC-09.4). Detached worktrees have no branch name, so their primary sort key is undefined — an implementer must guess whether they sort by empty string, by the `detached@<sha>` label, or fall through to absolute path. The spec simultaneously promises "deterministic detached labels" and E2E cases that assert ordering "exactly as specified" (AC-09.4), so the missing rule surfaces directly as guesswork the living document would then encode as a contract the spec never pinned.

### 3. `issue` — `sync` behavior when the primary workspace file is absent is unspecified (expected behavior / sync)

`wtw sync` "atomically updates only the workspace `folders` property" (Public CLI contract → `wtw sync`), and `init` — not `sync` — is the command described as creating missing scaffolds. The natural reading is that standalone `sync` fails cleanly if `<repo>.code-workspace` is missing, but the spec never states it. `check` clearly treats a missing required artifact as a `FAIL`, yet `sync`'s own behavior (fail with the standard error envelope? recreate the scaffold?) is left open. A downstream implementer would guess, and the two guesses diverge on whether `sync` can be a repair path for a deleted workspace.

### 4. `nit` — "usable primary worktree" is an undefined predicate (constraints / scope)

The phrase "usable primary worktree" gates support (Scope, Compatibility and safety constraints, `wtw init`, FR-03) but is never defined. Bare repositories are already excluded, so the residual meaning is narrow, but the exact predicate an implementer must code — and the exact `FAIL`/unsupported finding text it drives — is left to interpretation.

### 5. `nit` — AC-13.3 is conditional, conflicting with the "each criterion is machine-checkable" claim (acceptance guidance)

The Acceptance criteria section opens with "Each criterion is machine-checkable," but AC-13.3 is discretionary: a real merge-removal case is "covered only if needed to establish behavior not proven by the removal case; otherwise native merge semantics remain documented and unmodified." That is a reviewer judgment call, not a machine check. Small self-inconsistency in the acceptance element; a downstream reader can't mechanically decide whether AC-13.3 is satisfied.

### 6. `nit` — spec reverses P4 without that reversal being explicitly recorded (decision-log consistency / explicit decisions)

The spec places the Cursor workspace in the primary root and gives `wtw` ownership of only its `folders` property — reversing P4, which put the workspace under `<git-common-dir>/wtw/workspaces/` and had `wtw` own the entire generated file (plus a separate `wtw workspace sync` command). The spec correctly follows the later P16/P17/P27 decisions, so there is no live contradiction. However, P16's explicit supersession list names only P2, P3/P6, and P7 — not P4 — so the reversal is traceable only by inferring that P16/P17 override P4. This is closer to decision-log hygiene than a spec defect, but worth confirming the P4 reversal is intended and not an oversight.

## Evidence

- Finding 1: `wtw init` preflight bullets "absence of an unrecognized workspace collision" and "validity of existing … JSONC"; AC-09.1 ("refuses an unrecognized collision without writes"); Canonical local artifacts → Cursor workspace ("user-editable JSONC", `wtw` owns only `folders`).
- Finding 2: Canonical local artifacts → Cursor workspace ("Remaining entries sort by branch name and then absolute path… detached entries use `detached@<short-sha>`"); AC-09.4 ("sorted/labeled exactly as specified… deterministic detached labels"). Same gap present in decision log P22.
- Finding 3: Public CLI contract → `wtw sync` ("atomically updates only the workspace `folders` property"); `wtw init` ("creates missing scaffolds"); `wtw check` failures list includes "missing/invalid/tracked/unexcluded required artifacts."
- Finding 4: Scope → Explicitly excluded ("repositories without a usable primary worktree"); Compatibility and safety constraints; FR-03.
- Finding 5: Acceptance criteria preamble ("Each criterion is machine-checkable") versus AC-13.3.
- Finding 6: Spec Canonical local artifacts → Cursor workspace and FR-09 (primary-root, folders-only) versus decision-log P4 (git-common-dir, full ownership, `wtw workspace sync`); P16 supersession sentence naming only P2/P3/P6/P7.

## Open Questions

- For an existing valid-JSONC `.code-workspace` at the target path, should `init` adopt-and-sync it or treat it as a collision and refuse? What concretely distinguishes an "unrecognized collision" from "invalid JSONC"? (Author decision; belongs in the spec before init cases are authored.)
- What is the sort key for detached worktrees, given they have no branch name? (Author decision; blocks deterministic AC-09.4 case authoring.)
- Should standalone `wtw sync` fail or recreate when the primary workspace file is absent? (Author decision.)
- Is the reversal of P4 (workspace location and ownership) intentional and fully captured by P16/P17, or should P4's supersession be recorded explicitly in the decision log? (Author confirmation.)

## Next Actions

- Revise the spec in place to (a) define "unrecognized workspace collision" and its boundary against "invalid JSONC," (b) pin the detached-worktree sort key, and (c) state `sync`'s behavior when the primary workspace file is absent (findings 1–3).
- In the same revision, either define "usable primary worktree" or point at a precise predicate, and reconcile AC-13.3's conditional wording with the "machine-checkable" preamble (findings 4–5).
- Optionally note P4's supersession explicitly in the decision log, or confirm P16/P17 already cover it (finding 6).
- This is a standard handoff-grade + decision-log pass only. Given the spec's stakes (a full delegated MVP with real-Worktrunk contract obligations), consider a separate adversarial review pass targeting the concurrency/lock model (FR-08) and the real-lifecycle contract suite (FR-13) before planning.
