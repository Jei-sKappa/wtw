### Task 15: Docs, audit check-off, and the full gate

**Objective:** Land the model documentation, regenerate the living document, check off the migration audit, and prove the whole rework against every spec-level acceptance check that is machine-runnable.

**Input / context:** Everything through Task 14 green. Spec acceptance section (`specs/001/spec.md` FR-1..FR-9); the audit with all refs filled (Task 10) and its baseline commit (Task 1); `AGENTS.md`'s "Verification model" section, which currently hard-codes the old `FR-02..FR-13` rule and `WTW-FR` ID style and must be updated per its own update rule.

**Steps:**

1. Regenerate the living document: `bun run docs:living`, then `bun run docs:living:check` (must pass immediately; spec AC-5.3).
2. Rewrite `AGENTS.md`'s "Verification model" paragraph: manifests as the authoritative acceptance registry; domain-prefixed narrow FRs with per-FR AC numbering and compound refs; the four `verifiedBy` kinds and their per-kind 1:1 traceability (dedicated case, named scenario checkpoint, named unit-test file, named checklist step); the `WTA` contract-mode alignment; the migration audit archived in this thread. Remove every `WTW-FR-` mention and any "FR-02..FR-13"-style scope claim.
3. Check off the migration audit: for each row, confirm its `New refs` exist in the loaded tree (they were enforced by traceability throughout) and flip `[ ]` to `[x]`; rows resolved by owner disposition cite that disposition. The audit is thereafter archived — never maintained again.
4. Run the grep sweeps and record their emptiness:
   - `grep -rn 'WTW-FR-' packages/cli/requirements packages/cli/test/e2e packages/cli/docs/BEHAVIOR.md packages/cli/docs/RELEASE-CHECKLIST.md AGENTS.md`
   - `grep -rn '(spec AC-' packages/cli/requirements packages/cli/test/e2e packages/cli/docs/BEHAVIOR.md packages/cli/docs/RELEASE-CHECKLIST.md`
   - `grep -rn 'Task [0-9]' packages/cli/requirements`
   - `grep -n 'FR-02\.\.FR-13\|FR-02\.\. FR-13' AGENTS.md`
   - `grep -rn '0\.62\.\|0\.63\.' packages/cli/src packages/core/src packages/cli/test packages/core/test packages/cli/requirements packages/cli/docs AGENTS.md` (spec AC-9.2; Task 2 made this empty — re-proven at the gate)
   All five must return nothing.
5. Run the full gate: `bun run test-and-report` must pass end-to-end, with the contract suite executing rather than skipped (spec AC-7.1).
6. Prove the product untouched outside the P6 carve-out: `git diff --stat <baseline-commit> -- packages/cli/src packages/core/src` (baseline from the audit header) lists exactly `packages/core/src/worktrunk/version.ts` and `packages/cli/src/diagnostics/categories.ts`, nothing else (spec AC-7.2 as amended).
7. Confirm audit completeness mechanically: row count still equals the genesis bullet count (Task 1's greps) and `grep -c '\[ \]' migration/genesis-audit.md` returns 0.
8. Surface the review-verified residuals to the owner in the task's closing report — they are human judgment, not automatable: AC-1.5 (each statement reads as one assertion; context lives in FR descriptions), AC-6.1's substance half (each row's new refs truly absorb the old criterion), AC-8.1's accuracy half (the `AGENTS.md` description matches the implemented convention).

**Files modified:** `packages/cli/docs/BEHAVIOR.md` (regenerated), `AGENTS.md`, `docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` (checked off)

**Verification:** Steps 1, 4, 5, 6, 7 are themselves the verification block: `docs:living:check` exit 0; five empty greps; `bun run test-and-report` exit 0 with the contract suite executing; product diff against the baseline limited to the two P6 carve-out files; zero unchecked audit rows.

**Acceptance criteria:**

- `bun run test-and-report` passes on the completed rework with the contract suite executing against the pinned v0.67.0; `packages/cli/src/` and `packages/core/src/` are identical to the baseline commit except the two P6 carve-out files.
- `BEHAVIOR.md` is regenerated per-AC and drift-clean; no legacy ID string survives anywhere the spec greps.
- The migration audit is fully checked off and archived with this thread.
- The three review-verified items are explicitly listed for the owner.

**Consumes:** everything: the green gates from Tasks 13–14, the filled audit from Task 10, the baseline commit from Task 1, the renderer from Task 6, the v0.67.0 pin from Task 2.

**Produces:** none — this is the terminal task; downstream is the human review and the thread's finish handshake.
