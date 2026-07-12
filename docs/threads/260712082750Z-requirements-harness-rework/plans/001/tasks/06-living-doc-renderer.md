### Task 6: Per-AC living-doc renderer

**Objective:** Rework `packages/cli/scripts/living-docs.ts` so `BEHAVIOR.md` renders every active AC exactly once with its own `verifiedBy`-labeled evidence block, and retired items render as tombstones.

**Input / context:** Spec §5 (`specs/001/spec.md`): per-AC evidence, no shared evidence bodies, visible `verifiedBy` labels, retained Real/Simulated/Not-exercised labeling, distinguishable tombstones. Consumes Task 3 types (`verifiedBy`, `unitTest`, `manualStep`, retired) and Task 4 types (scalar `covers`, `Checkpoint`). Current renderer: FR-level acceptance table + per-case collapsibles keyed off multi-AC `covers`; regression test at `packages/cli/test/living-docs.test.ts`. Exact layout (section ordering, tombstone presentation, anchors) is a degree of freedom — keep the current chapter structure per manifest file and change the per-FR body.

**Steps:**

1. Extend `loadRenderCases` (or a sibling loader) so a render case carries its scalar `covers` and, for scenario cases, its declared `checkpoints` — the renderer must know which case or checkpoint proves each AC.
2. Replace the per-FR acceptance table + shared case blocks with a per-AC layout: under each FR heading render the FR description once, then one subsection per active AC showing its id, statement, a visible `verifiedBy` label, and that AC's own evidence block:
   - `case` — the covering case's existing evidence render (dependency-mode labels, input, command, output collapsible), placed under this AC only;
   - `checkpoint` — the owning scenario case's identity and dependency-mode labels plus the checkpoint's `title` and `description` (its step and assertion within the scenario);
   - `unit` — the named repo-root-relative test file;
   - `manual` — the named checklist step id, pointing at `packages/cli/docs/RELEASE-CHECKLIST.md`.
3. Guarantee no evidence body is shared: a case/checkpoint renders exactly once, under exactly the one AC it covers (the 1:1 gate makes this structural — assert it in the renderer rather than deduplicating).
4. Render retired FRs and ACs as tombstones — visually distinct (id, `retired` marker, `retiredReason`), with no evidence block, either inline-collapsed or in a dedicated retired section, so the active audit surface stays clean.
5. Update the document preamble: keep the generated-file warning and the Real/Simulated/Not-exercised explanation; remove the hardcoded `WTW-FR-0012` reference (cite the compatibility domain by its new prefix once Task 9 lands — use the pinned `COMPAT` prefix now); update the counts line to count FRs, ACs, cases, and checkpoints.
6. Rewrite `packages/cli/test/living-docs.test.ts` (and add renderer-level tests if clearer) against synthetic in-memory areas/cases: every active AC appears exactly once; each of the four kinds renders its correct evidence form and label; a retired AC renders as a tombstone without evidence; no two ACs share one rendered evidence body (e.g. assert a case id appears under exactly one AC section); the `--check` drift path still fails on a byte difference.

**Files modified:** `packages/cli/scripts/living-docs.ts`, `packages/cli/scripts/generate-living-docs.ts` (only if loader wiring requires), `packages/cli/test/living-docs.test.ts`

**Verification:** `bunx vitest run packages/cli/test/living-docs.test.ts` exits 0; `bun run check` and `bun run typecheck` exit 0. (The generator cannot run against the real tree until Tasks 8–13 land — synthetic-fixture tests are the gate here; the real regeneration happens in Task 15.)

**Acceptance criteria:**

- Renderer tests prove spec AC-5.1 (per-AC uniqueness, kind labels, no shared bodies) and the tombstone rendering on synthetic input.
- The Real/Simulated/Not-exercised dependency labeling is still emitted per case/checkpoint evidence (spec AC-5.2).
- The drift-check mechanism (`--check` byte comparison) is unchanged and still exercised by a test (spec AC-5.3's mechanism half).

**Consumes:** `Requirement`/`AcceptanceCriterion` from Task 3; `CaseManifest`/`Checkpoint` from Task 4; `validateTraceability` call wiring from Task 5.

**Produces:** the per-AC `renderDocument` pipeline that Task 15 runs via `bun run docs:living` to regenerate `packages/cli/docs/BEHAVIOR.md`.
