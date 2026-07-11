### Task 3: E2E harness and living-doc schema foundation

**Objective:** Build the declarative E2E harness — requirement/case manifest
validators, the case runner, and the fake executables — plus the first
CLI-surface and version cases, so every later command task authors cases against
a validated, single-sourced schema.

**Input / context:** Depends on Task 2's runnable entrypoint. Verification
architecture fixed by the spec's "Executable behavior documentation and
verification" section and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P12, P13.
Model the harness closely on the Jastr reference:
`<jastr-ref>/test/e2e/harness/case-manifest.ts`, `requirements.ts`,
`case-runner.ts`, `traceability.ts`, the harness self-tests under
`<jastr-ref>/test/e2e/harness.test/`, a sample requirement file
`<jastr-ref>/requirements/functional/08-version.yml`, and sample cases
`<jastr-ref>/test/e2e/cases/version/case.yml` and `.../help-root/case.yml`. The
Jastr case-runner also shows the fake-git shim pattern
(`test/e2e/harness/fake-git/git`, `__FAKE_GIT_BIN__` sentinel) to imitate.

**Steps:**
1. Create `packages/cli/test/e2e/harness/requirements.ts`: a strict validator
   for requirement manifests. Requirement id pattern `^[A-Z]+-FR-\d{4}$`,
   acceptance id `^AC-\d{4}$`, statuses `active|deferred|removed`, closed field
   sets that reject unknown fields, and helpers to load all
   `requirements/functional/*.yml` files and to build acceptance references
   (`<FR>.<AC>`). Retain `deferred`/`removed` statuses explicitly. These 4-digit
   manifest ids map one-to-one to the spec's dotted identifiers by a fixed rule:
   spec `FR-NN` → requirement id `WTW-FR-00NN`, and spec `AC-NN.M` → acceptance id
   `AC-NNMM` (each segment zero-padded to two digits), so spec `AC-02.1` is
   manifest `AC-0201` with covers ref `WTW-FR-0002.AC-0201`. This is the explicit
   spec-to-manifest mapping the spec's "Coverage and traceability" section
   requires; the `FR-`/`AC-` labels in step 8 name the spec criteria each file
   encodes under it.
2. Create `packages/cli/test/e2e/harness/case-manifest.ts`: a strict validator
   for case YAML. Case id grammar, `covers` acceptance-ref pattern
   `^[A-Z]+-FR-\d{4}\.AC-\d{4}$`, closed field set
   (`id`, `covers`, `title`, `description`, `cwd`, `command`, `substitute`,
   `env`, `setup`, `expect`), an `expect` field set covering `exitCode`,
   `stdout`/`stdoutFile`/`stdoutContains`, `stderr`/`stderrFile`, and file
   assertions (`files`, `fileContains`, `fileNotContains`), a closed
   substitution-name set, and `setup` step shapes (a prior `wtw` invocation and a
   fixture copy). Reject unsafe (escaping) fixture paths.
3. Create `packages/cli/test/e2e/harness/case-runner.ts`: for each case, build an
   isolated temp environment, copy the case `fixture/` tree in, point isolated
   `HOME`/config at a per-case base, resolve `substitute` tokens (project root,
   CLI version, absolute paths) on the correct side (fixture vs expected),
   resolve `env` sentinels to the absolute fake-executable paths, run the real
   `wtw` entrypoint via `execa`, and assert exit code, streams, and file
   outputs. Support the two labelled modes from P13 by a mode flag/parameter:
   `fast` (this task) and `contract` (Task 15), so the same runner serves both.
4. Create `packages/cli/test/e2e/harness/traceability.ts`: cross-check that every
   `covers` ref resolves to a declared active acceptance criterion and that every
   active acceptance criterion has at least one case. Expose it as a function the
   suite and the living-doc generator both call (single-sourced).
5. Create the fake executables under `packages/cli/test/e2e/harness/`: a fake
   `worktrunk`/`wt` and a fake `cursor` (and, where cheap real Git is not wanted,
   a fake `git`) as small scripts that record their invocations (argv, cwd) to a
   file and support deterministic success/failure injection via env. Document the
   sentinel tokens the runner substitutes for their absolute paths. The fake
   Cursor must never open a GUI — it only records the workspace path it was asked
   to open.
6. Add harness self-tests under `packages/cli/test/e2e/harness.test/`
   (`requirements.test.ts`, `case-manifest.test.ts`, `case-runner.test.ts`,
   `traceability.test.ts`): assert the validators reject invalid manifests,
   unknown fields, unsafe fixture paths, invalid coverage refs, and an active
   acceptance criterion with no case.
7. Create `packages/cli/test/e2e/e2e.test.ts` that loads all cases, runs them
   through the runner in fast mode, and runs the traceability check.
8. Author the first requirement file and cases proving the surface built in Task
   2: create `packages/cli/requirements/functional/02-cli-surface.yml`
   (FR-02 with AC-02.1/02.2/02.3) and
   `packages/cli/requirements/functional/15-version.yml` (FR-15 with AC-15.1),
   plus cases under `packages/cli/test/e2e/cases/` covering bare invocation, root
   and command help, `-h`/`--help`, `-V`/`--version` (dev), an unknown command,
   an unknown flag, and an unexpected positional. Each case's `covers` maps to the
   matching AC.

**Files modified:**
`packages/cli/test/e2e/harness/requirements.ts` (NEW),
`packages/cli/test/e2e/harness/case-manifest.ts` (NEW),
`packages/cli/test/e2e/harness/case-runner.ts` (NEW),
`packages/cli/test/e2e/harness/traceability.ts` (NEW),
`packages/cli/test/e2e/harness/fake-worktrunk/wt` (NEW),
`packages/cli/test/e2e/harness/fake-cursor/cursor` (NEW),
`packages/cli/test/e2e/harness/fake-git/git` (NEW),
`packages/cli/test/e2e/harness.test/requirements.test.ts` (NEW),
`packages/cli/test/e2e/harness.test/case-manifest.test.ts` (NEW),
`packages/cli/test/e2e/harness.test/case-runner.test.ts` (NEW),
`packages/cli/test/e2e/harness.test/traceability.test.ts` (NEW),
`packages/cli/test/e2e/e2e.test.ts` (NEW),
`packages/cli/requirements/functional/02-cli-surface.yml` (NEW),
`packages/cli/requirements/functional/15-version.yml` (NEW),
`packages/cli/test/e2e/cases/*/case.yml` and expected-output sidecars (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/cli/test/e2e/harness.test` exits 0 (validators reject
  the invalid manifests).
- `bun run test:e2e` exits 0: all FR-02 and FR-15 (dev) cases pass and the
  traceability check passes for the criteria authored so far.
- The fake Cursor records the workspace path to its invocation log and never
  spawns a GUI process.

**Acceptance criteria:**
- Strict schema tests reject invalid requirement/case manifests, unknown fields,
  unsafe fixture paths, invalid coverage references, and an active acceptance
  criterion with no E2E case. (AC-14.1)
- FR-02 (AC-02.1/02.2/02.3) and FR-15 AC-15.1 are proven by passing E2E cases
  that exercise the real `wtw` entrypoint in an isolated environment.
- The fast harness runs the real entrypoint with declared fake
  Worktrunk/Cursor executables and never opens a GUI.

**Consumes:** `buildProgram`, `validateCliArgv`, and the entrypoint from Task 2.

**Produces:** the E2E harness modules `case-manifest.ts`, `requirements.ts`,
`case-runner.ts`, `traceability.ts`; the fake `wt`, `cursor`, and `git` shims
with documented substitution sentinels; the case directory convention
`packages/cli/test/e2e/cases/<id>/case.yml`; the requirement manifest directory
`packages/cli/requirements/functional/`; and the fast-mode `e2e.test.ts` entry.
