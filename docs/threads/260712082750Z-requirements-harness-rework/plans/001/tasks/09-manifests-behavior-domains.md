### Task 9: New manifests — behavior domains and checklist step targets

**Objective:** Rewrite the six behavior-domain manifests (`COPY`, `SYNC`, `WORK`, `CURSOR`, `CHECK`, `COMPAT`) under the new convention, rework `RELEASE-CHECKLIST.md` into addressable `manual` step targets, and fill the matching audit rows.

**Input / context:** Audit rows for genesis FR-07..FR-12; old manifests `07-copy-policy.yml`, `08-sync.yml`, `09-cursor-workspace.yml`, `10-cursor-launch.yml`, `11-diagnostics.yml`, `12-compatibility.yml`; `packages/cli/docs/RELEASE-CHECKLIST.md` (currently headed `## FR-10 — Cursor launch (manual evidence for spec AC-10.4)` — genesis-ID references must go, spec AC-6.2). Same convention and validation approach as Task 8. The pinned manual-step contract: a `manual` AC's `manualStep` id resolves to a `` ## `<step-id>` `` heading in the checklist.

**Steps:**

1. Decompose and rewrite the six manifests exactly as in Task 8 steps 1–3, audit-guided. Domain notes: the old `10-cursor-launch.yml` `notes:` block (stale "Tasks 12 and 13" prose, the AC-10.4 manual folklore) is deleted — its live substance becomes ACs; behavior split across old FR-13 (lifecycle) that is wtw-observable behavior (e.g. what `wtw sync` does when hooks invoke it) belongs in `SYNC`/`WORK`/`CURSOR` here, while assumptions about *real Worktrunk itself* are deferred to Task 10's `WTA` group.
2. Rework `packages/cli/docs/RELEASE-CHECKLIST.md`: keep the purpose preamble; convert each manual check into a step section headed `` ## `<step-id>` — <title> `` (first step: `` ## `cursor-open-focus` — Real Cursor opens and focuses the workspace ``, carrying the existing three-step procedure and recording instructions); remove every `FR-10`/`spec AC-10.4`-style genesis reference.
3. In `10-cursor-launch.yml`, add the manual criterion: an AC with `verifiedBy: manual`, `manualStep: cursor-open-focus`, stating the observable outcome (a supported real Cursor opens and focuses the named workspace) — this is spec AC-2.4. Add further `manual` ACs (with their own checklist steps) only if the audit surfaces other manual-only substance.
4. Fill the `New refs` audit cells for every genesis FR-07..FR-12 row, escalating any apparent drop to the owner.
5. Validate each rewritten manifest with the Task 8 per-file one-liner.

**Files modified:** `packages/cli/requirements/functional/07-copy-policy.yml`, `08-sync.yml`, `09-cursor-workspace.yml`, `10-cursor-launch.yml`, `11-diagnostics.yml`, `12-compatibility.yml` (rewritten in place), `packages/cli/docs/RELEASE-CHECKLIST.md`, `docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` (refs filled)

**Verification:** Per-file validation prints `ok` for all six manifests; `grep -n 'WTW-FR-\|(spec AC-' packages/cli/docs/RELEASE-CHECKLIST.md` returns nothing; `grep -n '^## \`cursor-open-focus\`' packages/cli/docs/RELEASE-CHECKLIST.md` matches; `grep -n 'verifiedBy: manual' packages/cli/requirements/functional/10-cursor-launch.yml` matches; every genesis FR-07..FR-12 audit row has a non-empty `New refs` cell.

**Acceptance criteria:**

- Six manifests exist in the new convention with prefixes `COPY`, `SYNC`, `WORK`, `CURSOR`, `CHECK`, `COMPAT`, each loading clean.
- At least one `verifiedBy: manual` AC covers the real-Cursor open/focus check and its `manualStep` resolves to a checklist heading (spec AC-2.4).
- `RELEASE-CHECKLIST.md` carries addressable step headings and no genesis-ID references.
- Every genesis FR-07..FR-12 audit row resolves.

**Consumes:** audit rows from Task 1; manifest schema from Task 3; `CLI`…`VER` prefix precedents from Task 8.

**Produces:** the `COPY`/`SYNC`/`WORK`/`CURSOR`/`CHECK`/`COMPAT` registry for Tasks 11–13; the `cursor-open-focus` checklist step id; filled audit rows for genesis FR-07..FR-12.
