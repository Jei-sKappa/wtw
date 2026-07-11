### Task 16: Living-doc generator, traceability, and full report gate

**Objective:** Complete the living-behavior document system: a deterministic
`BEHAVIOR.md` generator whose `--check` form exact-compares bytes and writes
nothing on drift, complete FR-02..FR-13 traceability with real/simulated evidence
labels, and the aggregate full test-and-report gate that runs every quality
stage.

**Input / context:** Depends on every prior task — all requirement manifests
(FR-02..FR-15) and E2E cases must already exist. Behavior fixed by the spec's
"Executable behavior documentation and verification" section and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P12, P13,
P15. Model the generator on `<jastr-ref>/packages/cli/scripts/living-docs.ts` and
`generate-living-docs.ts`. `BEHAVIOR.md` is generated output, never hand-edited.

**Steps:**
1. Add `packages/cli/scripts/living-docs.ts`: load requirements grouped by source
   file (preserving curated chapter order), load and flatten every E2E case to
   what the document renders (id, title, description, cwd, command, covers, setup
   steps, exit code, exact stdout/stderr, dependency mode, input/global fixtures,
   expected output files), and render a deterministic Markdown document. The
   render MUST distinguish real vs simulated Git/Worktrunk/Cursor evidence per
   case, and MUST surface fixtures, invoked commands, dependency mode, exact
   expected streams, exit codes, and expected file outputs. Retain explicit
   statuses for deferred and removed requirements.
2. Add `packages/cli/scripts/generate-living-docs.ts`: resolve the package root,
   render the document, and either write `packages/cli/docs/BEHAVIOR.md` or, with
   `--check`, exact-compare bytes against the file on disk and fail (writing
   nothing) on any drift.
3. Enforce full traceability using the harness `traceability.ts` (Task 3): every
   active observable criterion in FR-02 through FR-13 must have at least one E2E
   case mapping. Run the traceability check as part of the e2e suite and the
   generator. Confirm the requirement files cover FR-02..FR-15 with one-to-one AC
   identifiers matching the spec's AC numbers (or an explicit documented mapping).
4. Add a living-docs schema/regression test at
   `packages/cli/test/living-docs.test.ts` asserting the generator output is
   deterministic and `--check` fails on injected drift and writes nothing.
5. Regenerate `BEHAVIOR.md` and commit it as generated output.
6. Add the aggregate root scripts: `docs:living`
   (runs `generate-living-docs.ts`), `docs:living:check` (`--check`), and a full
   `test-and-report` gate that runs, in order and failing nonzero on any stage:
   formatting/linting, typechecking, package tests, fast E2E, the real external
   contract (Task 15), the behavior-doc drift check, and build. Document that the
   full local macOS gate runs both E2E modes and the living-doc drift check.

**Files modified:** `packages/cli/scripts/living-docs.ts` (NEW),
`packages/cli/scripts/generate-living-docs.ts` (NEW),
`packages/cli/docs/BEHAVIOR.md` (NEW, generated),
`packages/cli/test/living-docs.test.ts` (NEW),
`package.json` (root `docs:living`, `docs:living:check`, `test-and-report` scripts)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run docs:living` writes `packages/cli/docs/BEHAVIOR.md`; a subsequent
  `bun run docs:living:check` exits 0 (no drift).
- Introducing a deliberate case change and rerunning `docs:living:check` fails
  and writes nothing; reverting restores a passing check.
- `bun run test:e2e` traceability check passes: every active FR-02..FR-13
  criterion has a case.
- `bun run test-and-report` runs every stage and exits 0 on macOS with the
  Worktrunk v0.62.0 binary present; it exits nonzero when any stage fails.

**Acceptance criteria:**
- Strict schema tests already reject invalid manifests (AC-14.1, Task 3); this
  task adds the deterministic renderer whose `--check` fails on any byte drift and
  writes nothing. (AC-14.2)
- Every active observable criterion in FR-02 through FR-13 has an E2E case
  mapping, and the living document visibly distinguishes real and simulated Git,
  Worktrunk, and Cursor evidence. (AC-14.3)
- The full test-and-report command runs formatting/linting, typechecking, package
  tests, fast E2E, the real external contract, behavior-doc drift, and build, and
  exits nonzero when any stage fails. (AC-14.4)
- The verified Worktrunk range is represented as supported in the living document
  only after the real contract suite passes. (AC-12.2 documentation side)

**Consumes:** all requirement manifests and E2E cases (Tasks 3, 10-13, 15);
the harness `traceability.ts` (Task 3); the `build` and `test:contract` scripts
(Tasks 14, 15).

**Produces:** `BEHAVIOR.md` generation via `docs:living`/`docs:living:check`; the
full `test-and-report` aggregate gate; enforced FR-02..FR-13 traceability with
labeled evidence.
