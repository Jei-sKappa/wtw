import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const CASE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ACCEPTANCE_REF_PATTERN = /^[A-Z]+-FR-\d{4}\.AC-\d{4}$/;
const CASE_FIELDS = new Set([
  "id",
  "covers",
  "checkpoints",
  "title",
  "description",
  "mode",
  "cwd",
  "command",
  "substitute",
  "env",
  "setup",
  "expect",
]);
const CHECKPOINT_FIELDS = new Set(["id", "title", "description", "covers"]);

// Which labelled suite owns a case and how it is verified. `fast` (the default
// when omitted) runs through the generic runner in fast mode against the source
// entrypoint with fake executables; `contract` runs through the generic runner
// in contract mode against the built artifact and a pinned real Worktrunk;
// `scenario` is a contract case whose ordered, background-hook-driven proof
// cannot be expressed as a single-command run — it is verified by a bespoke
// scenario test and declared here only for traceability and living-doc
// rendering. The generic runner never executes a `scenario` case.
export const CASE_MODES = ["fast", "contract", "scenario"] as const;
export type CaseMode = (typeof CASE_MODES)[number];
const CASE_MODE_SET: ReadonlySet<string> = new Set(CASE_MODES);
const SETUP_STEP_FIELDS = new Set(["cli", "cp", "run"]);
const CP_STEP_FIELDS = new Set(["from", "to"]);
const RUN_STEP_FIELDS = new Set(["cmd", "background", "allowFailure", "env"]);
const EXPECT_FIELDS = new Set([
  "exitCode",
  "stdout",
  "stdoutFile",
  "stdoutContains",
  "stderr",
  "stderrFile",
  "files",
  "fileContains",
  "fileNotContains",
]);

// The closed set of built-in values a case may substitute into its fixtures or
// expected output. The case `substitute` map binds author-chosen literal tokens
// to one of these names; the runner owns the token→value resolution and which
// side (fixture vs expected output) each name applies to. `projectRoot` is the
// temp project-root realpath rewritten into copied **fixture** files (for
// absolute-path fixtures); `wtwCliVersion` is the CLI package version rewritten
// into **expected** output before comparison.
export const SUBSTITUTION_VALUES = ["projectRoot", "wtwCliVersion"] as const;
export type SubstitutionValue = (typeof SUBSTITUTION_VALUES)[number];
const SUBSTITUTION_VALUE_SET: ReadonlySet<string> = new Set(
  SUBSTITUTION_VALUES,
);

export type CaseExpect = {
  exitCode: number;
  stdout?: string;
  stdoutFile?: string;
  stdoutContains?: string[];
  stderr?: string;
  stderrFile?: string;
  files?: Record<string, string>;
  fileContains?: Record<string, string[]>;
  fileNotContains?: Record<string, string[]>;
};

/** A `cli:` setup step: run the wtw CLI before the main `command`, sharing the
 * case's cwd, env, and isolated HOME. A non-zero exit fails the case loudly. */
export type SetupCliStep = { cli: string[] };

/** A `cp:` setup step: copy a case-relative fixture path onto a root-relative
 * destination in the temp tree (used to mutate a fixture between two CLI runs,
 * e.g. simulating raw-git drift between an `init` and a later `sync`). Both
 * paths are safe relatives. */
export type SetupCpStep = { cp: { from: string; to: string } };

/** A `run:` setup step: execute an arbitrary program with STRUCTURED arguments
 * (never a shell string) from the case cwd, used to build real Git fixtures
 * (`git init`, `git worktree add`), pre-create lock state, or drive a second
 * overlapping `wtw` process. The first `cmd` element may be the token `__WTW__`,
 * which the runner expands to the CLI entrypoint argv so a run step can invoke
 * `wtw` itself with a step-local `env`. `background: true` launches the process
 * without awaiting it inline (the runner awaits all background processes after
 * the main command); `allowFailure: true` tolerates a non-zero exit (e.g. a
 * deliberate fault-injection run); `env` is merged over the case environment for
 * this step only. */
export type SetupRunStep = {
  run: {
    cmd: string[];
    background?: boolean;
    allowFailure?: boolean;
    env?: Record<string, string>;
  };
};

/** One ordered setup pre-step: exactly a `cli:`, `cp:`, or `run:` step. */
export type SetupStep = SetupCliStep | SetupCpStep | SetupRunStep;

/**
 * One named checkpoint declared by a `scenario` case. A scenario's ordered,
 * background-hook-driven proof cannot be expressed as a single covered AC, so
 * instead of a case-level `covers` it declares the criteria it demonstrates as
 * a list of checkpoints — each a kebab-case `id`, a human `title`/`description`,
 * and exactly one `covers` compound acceptance-criterion ref. The scenario test
 * (Task 14) asserts each checkpoint is reached; the living-doc renderer (Task 6)
 * and traceability (Task 5) consume the declarations.
 */
export type Checkpoint = {
  id: string;
  title: string;
  description: string;
  covers: string;
};

export type CaseManifest = {
  id: string;
  /** The single acceptance criterion a `fast`/`contract` case covers; absent on
   * `scenario` cases (which declare per-checkpoint coverage instead). */
  covers?: string;
  /** The named checkpoints a `scenario` case declares; absent on other modes. */
  checkpoints?: Checkpoint[];
  title: string;
  description: string;
  mode?: CaseMode;
  cwd: string;
  command: string[];
  substitute: Record<string, SubstitutionValue>;
  env: Record<string, string>;
  setup: SetupStep[];
  expect: CaseExpect;
};

export type RawCaseManifest = CaseManifest;

export type LoadedCase = {
  manifest: CaseManifest;
  dirPath: string;
  filePath: string;
};

type Source = {
  filePath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(source: Source, detail: string): never {
  throw new Error(`${source.filePath}: ${detail}`);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  source: Source,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(source, `unknown ${label} field ${key}`);
  }
}

function requireString(value: unknown, field: string, source: Source): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  source: Source,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(source, `${field} must be a string.`);
  return value;
}

function optionalStringArray(
  value: unknown,
  field: string,
  source: Source,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    fail(source, `${field} must be a non-empty string array.`);
  }
  if (!value.every((item) => typeof item === "string")) {
    fail(source, `${field} must contain only strings.`);
  }
  return value;
}

export function validateSafePath(
  field: string,
  value: unknown,
  source: Source,
): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty relative path.`);
  }
  if (value.includes("\\"))
    fail(source, `${field} must use forward slashes: ${value}`);
  if (path.posix.isAbsolute(value))
    fail(source, `${field} must not be absolute: ${value}`);
  if (value.split("/").some((segment) => segment === "..")) {
    fail(source, `${field} must not contain .. path segments: ${value}`);
  }
  return value;
}

function validateStringMap(
  value: unknown,
  field: string,
  source: Source,
): Record<string, string> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    validateSafePath(`${field}["${key}"]`, key, source);
    result[key] = validateSafePath(`${field}.${key}`, raw, source);
  }
  return result;
}

function validateSubstringMap(
  value: unknown,
  field: string,
  source: Source,
): Record<string, string[]> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    validateSafePath(`${field}["${key}"]`, key, source);
    if (!Array.isArray(raw) || raw.length === 0) {
      fail(source, `${field}.${key} must be a non-empty string array.`);
    }
    if (!raw.every((item) => typeof item === "string")) {
      fail(source, `${field}.${key} must contain only strings.`);
    }
    result[key] = raw;
  }
  return result;
}

function validateSubstitute(
  value: unknown,
  field: string,
  source: Source,
): Record<string, SubstitutionValue> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, SubstitutionValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.length === 0) fail(source, `${field} keys must be non-empty.`);
    if (typeof raw !== "string" || !SUBSTITUTION_VALUE_SET.has(raw)) {
      fail(
        source,
        `${field}["${key}"] must be one of ${SUBSTITUTION_VALUES.join(", ")}: ${String(raw)}`,
      );
    }
    result[key] = raw as SubstitutionValue;
  }
  return result;
}

/**
 * `env` is a free-form string→string map merged into the CLI subprocess
 * environment after the isolated `HOME`. Unlike `files`/`substitute`, its
 * values are environment variables (e.g. a fake-executable path via the
 * `__FAKE_WT_BIN__` / `__FAKE_CURSOR_BIN__` / `__FAKE_GIT_BIN__` sentinels the
 * runner resolves), so they are not constrained to safe relative paths.
 */
function validateEnvMap(
  value: unknown,
  field: string,
  source: Source,
): Record<string, string> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.length === 0) fail(source, `${field} keys must be non-empty.`);
    if (typeof raw !== "string") {
      fail(source, `${field}["${key}"] must be a string: ${String(raw)}`);
    }
    result[key] = raw;
  }
  return result;
}

/**
 * `setup` is an optional ordered list of pre-`command` steps. Each entry is
 * exactly one of a `cli:` step (a CLI argv run before the main command) or a
 * `cp:` step (a fixture copy into the temp tree). The runner executes them in
 * order after fixture/substitute expansion and before the main `command`.
 */
function validateSetup(
  value: unknown,
  field: string,
  source: Source,
): SetupStep[] {
  if (!Array.isArray(value)) fail(source, `${field} must be an array.`);
  return value.map((entry, index) => {
    const where = `${field}[${index}]`;
    if (!isRecord(entry)) fail(source, `${where} must be a mapping.`);
    rejectUnknownFields(entry, SETUP_STEP_FIELDS, "setup step", source);
    const present = ["cli", "cp", "run"].filter(
      (key) => entry[key] !== undefined,
    );
    if (present.length !== 1) {
      fail(source, `${where} must set exactly one of cli, cp, or run.`);
    }
    if (entry.cli !== undefined) {
      if (!Array.isArray(entry.cli) || entry.cli.length === 0) {
        fail(source, `${where}.cli must be a non-empty string array.`);
      }
      const cli = entry.cli.map((item, argIndex) => {
        if (typeof item !== "string") {
          fail(source, `${where}.cli[${argIndex}] must be a string.`);
        }
        return item;
      });
      return { cli };
    }
    if (entry.run !== undefined) {
      return validateRunStep(entry.run, where, source);
    }
    if (!isRecord(entry.cp)) fail(source, `${where}.cp must be a mapping.`);
    rejectUnknownFields(entry.cp, CP_STEP_FIELDS, "cp step", source);
    const from = validateSafePath(`${where}.cp.from`, entry.cp.from, source);
    const to = validateSafePath(`${where}.cp.to`, entry.cp.to, source);
    return { cp: { from, to } };
  });
}

/** Validate a `run:` step's nested body (`cmd`, optional flags, optional env). */
function validateRunStep(
  value: unknown,
  where: string,
  source: Source,
): SetupRunStep {
  if (!isRecord(value)) fail(source, `${where}.run must be a mapping.`);
  rejectUnknownFields(value, RUN_STEP_FIELDS, "run step", source);
  if (!Array.isArray(value.cmd) || value.cmd.length === 0) {
    fail(source, `${where}.run.cmd must be a non-empty string array.`);
  }
  const cmd = value.cmd.map((item, argIndex) => {
    if (typeof item !== "string") {
      fail(source, `${where}.run.cmd[${argIndex}] must be a string.`);
    }
    return item;
  });
  const run: SetupRunStep["run"] = { cmd };
  if (value.background !== undefined) {
    if (typeof value.background !== "boolean") {
      fail(source, `${where}.run.background must be a boolean.`);
    }
    run.background = value.background;
  }
  if (value.allowFailure !== undefined) {
    if (typeof value.allowFailure !== "boolean") {
      fail(source, `${where}.run.allowFailure must be a boolean.`);
    }
    run.allowFailure = value.allowFailure;
  }
  if (value.env !== undefined) {
    run.env = validateEnvMap(value.env, `${where}.run.env`, source);
  }
  return { run };
}

/**
 * Validate a `scenario` case's `checkpoints` list: a non-empty array of strict
 * `{ id, title, description, covers }` mappings. Ids are kebab-case (the case-id
 * pattern) and unique within the case; each `covers` is a single compound
 * acceptance-criterion ref and no two checkpoints may cover the same ref.
 */
function validateCheckpoints(
  value: unknown,
  caseId: string,
  source: Source,
): Checkpoint[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(source, `${caseId}.checkpoints must be a non-empty array.`);
  }
  const seenIds = new Set<string>();
  const seenCovers = new Set<string>();
  return value.map((entry, index) => {
    const where = `${caseId}.checkpoints[${index}]`;
    if (!isRecord(entry)) fail(source, `${where} must be a mapping.`);
    rejectUnknownFields(entry, CHECKPOINT_FIELDS, "checkpoint", source);
    const id = requireString(entry.id, `${where}.id`, source);
    if (!CASE_ID_PATTERN.test(id)) {
      fail(source, `${where}.id must be kebab-case: ${id}`);
    }
    if (seenIds.has(id)) {
      fail(source, `${caseId}.checkpoints contains duplicate id ${id}`);
    }
    seenIds.add(id);
    const title = requireString(entry.title, `${where}.title`, source);
    const description = requireString(
      entry.description,
      `${where}.description`,
      source,
    );
    const covers = requireString(entry.covers, `${where}.covers`, source);
    if (!ACCEPTANCE_REF_PATTERN.test(covers)) {
      fail(source, `${where}.covers must be an acceptance criterion ref.`);
    }
    if (seenCovers.has(covers)) {
      fail(
        source,
        `${caseId}.checkpoints contains duplicate covers ref ${covers}`,
      );
    }
    seenCovers.add(covers);
    return { id, title, description, covers };
  });
}

export function validateCaseManifest(
  value: unknown,
  source: Source,
): CaseManifest {
  if (!isRecord(value)) fail(source, "case manifest must be a mapping.");
  rejectUnknownFields(value, CASE_FIELDS, "case", source);
  const id = requireString(value.id, "id", source);
  if (!CASE_ID_PATTERN.test(id)) fail(source, `invalid case id ${id}`);

  // `mode` is optional; an omitted mode means the default `fast` suite. Only
  // contract/scenario cases declare it. An unknown value is rejected so the
  // strict schema never silently mis-routes a case. It is resolved first because
  // the `covers`/`checkpoints` contract depends on the effective mode.
  let mode: CaseMode | undefined;
  if (value.mode !== undefined) {
    if (typeof value.mode !== "string" || !CASE_MODE_SET.has(value.mode)) {
      fail(
        source,
        `${id}.mode must be one of ${CASE_MODES.join(", ")}: ${String(value.mode)}`,
      );
    }
    mode = value.mode as CaseMode;
  }
  const effectiveMode: CaseMode = mode ?? "fast";

  // Coverage is declared one of two mutually exclusive ways, gated on mode. A
  // `fast`/`contract` case covers exactly one acceptance criterion via a scalar
  // `covers` ref (a list is rejected). A `scenario` case declares no case-level
  // `covers` at all; it carries a non-empty `checkpoints` list instead, each
  // checkpoint naming the one criterion it demonstrates.
  let covers: string | undefined;
  let checkpoints: Checkpoint[] | undefined;
  if (effectiveMode === "scenario") {
    if (value.covers !== undefined) {
      fail(
        source,
        `${id}.covers is forbidden on scenario cases; declare per-checkpoint coverage instead.`,
      );
    }
    checkpoints = validateCheckpoints(value.checkpoints, id, source);
  } else {
    if (value.checkpoints !== undefined) {
      fail(source, `${id}.checkpoints is only allowed on scenario cases.`);
    }
    covers = requireString(value.covers, `${id}.covers`, source);
    if (!ACCEPTANCE_REF_PATTERN.test(covers)) {
      fail(source, `${id}.covers must be an acceptance criterion ref.`);
    }
  }

  const title = requireString(value.title, `${id}.title`, source);
  const description = requireString(
    value.description,
    `${id}.description`,
    source,
  );
  // `cwd` is optional: cases run from the project root by default (the 99%
  // scenario a real user is in). The rare case that needs to exercise running
  // from a nested or linked worktree directory can still set it explicitly.
  const cwd =
    value.cwd === undefined
      ? "."
      : validateSafePath(`${id}.cwd`, value.cwd, source);

  // `command` is the CLI argv (after the entrypoint). An empty array is valid
  // and meaningful: it is the bare `wtw` invocation with no arguments.
  if (!Array.isArray(value.command)) {
    fail(source, `${id}.command must be a string array.`);
  }
  const command = value.command.map((item, index) => {
    if (typeof item !== "string")
      fail(source, `${id}.command[${index}] must be a string.`);
    return item;
  });

  // `substitute` is optional: only cases that need a runtime value (the temp
  // project root, the CLI version) injected into their fixtures or expected
  // output declare it. Keys are author-chosen literal tokens; values name the
  // built-in substitution to apply.
  const substitute =
    value.substitute === undefined
      ? {}
      : validateSubstitute(value.substitute, `${id}.substitute`, source);

  // `env` is optional: only cases that need extra environment for the CLI
  // subprocess (e.g. a fake-executable path sentinel) declare it.
  const env =
    value.env === undefined
      ? {}
      : validateEnvMap(value.env, `${id}.env`, source);

  // `setup` is optional: only stateful cases that must mutate the temp tree or
  // run a prior CLI invocation (e.g. an `init` before a drift `sync`) declare it.
  const setup =
    value.setup === undefined
      ? []
      : validateSetup(value.setup, `${id}.setup`, source);

  if (!isRecord(value.expect)) fail(source, `${id}.expect must be a mapping.`);
  rejectUnknownFields(value.expect, EXPECT_FIELDS, "expect", source);
  if (typeof value.expect.exitCode !== "number") {
    fail(source, `${id}.expect.exitCode must be a number.`);
  }
  const stdout = optionalString(
    value.expect.stdout,
    `${id}.expect.stdout`,
    source,
  );
  const stderr = optionalString(
    value.expect.stderr,
    `${id}.expect.stderr`,
    source,
  );
  const stdoutFile =
    value.expect.stdoutFile === undefined
      ? undefined
      : validateSafePath(
          `${id}.expect.stdoutFile`,
          value.expect.stdoutFile,
          source,
        );
  const stdoutContains = optionalStringArray(
    value.expect.stdoutContains,
    `${id}.expect.stdoutContains`,
    source,
  );
  const stderrFile =
    value.expect.stderrFile === undefined
      ? undefined
      : validateSafePath(
          `${id}.expect.stderrFile`,
          value.expect.stderrFile,
          source,
        );
  if (
    stdout === undefined &&
    stdoutFile === undefined &&
    stdoutContains === undefined
  ) {
    fail(
      source,
      `${id}.expect requires stdout, stdoutFile, or stdoutContains.`,
    );
  }
  if (stderr === undefined && stderrFile === undefined) {
    fail(source, `${id}.expect requires stderr or stderrFile.`);
  }
  if (stdout !== undefined && stdoutFile !== undefined) {
    fail(source, `${id}.expect must not set both stdout and stdoutFile.`);
  }
  if (stderr !== undefined && stderrFile !== undefined) {
    fail(source, `${id}.expect must not set both stderr and stderrFile.`);
  }

  const expect: CaseExpect = { exitCode: value.expect.exitCode };
  if (stdout !== undefined) expect.stdout = stdout;
  if (stdoutFile !== undefined) expect.stdoutFile = stdoutFile;
  if (stdoutContains !== undefined) expect.stdoutContains = stdoutContains;
  if (stderr !== undefined) expect.stderr = stderr;
  if (stderrFile !== undefined) expect.stderrFile = stderrFile;
  if (value.expect.files !== undefined) {
    expect.files = validateStringMap(
      value.expect.files,
      `${id}.expect.files`,
      source,
    );
  }
  if (value.expect.fileContains !== undefined) {
    expect.fileContains = validateSubstringMap(
      value.expect.fileContains,
      `${id}.expect.fileContains`,
      source,
    );
  }
  if (value.expect.fileNotContains !== undefined) {
    expect.fileNotContains = validateSubstringMap(
      value.expect.fileNotContains,
      `${id}.expect.fileNotContains`,
      source,
    );
  }

  return {
    id,
    ...(covers === undefined ? {} : { covers }),
    ...(checkpoints === undefined ? {} : { checkpoints }),
    title,
    description,
    ...(mode === undefined ? {} : { mode }),
    cwd,
    command,
    substitute,
    env,
    setup,
    expect,
  };
}

async function findCaseManifestFiles(root: string): Promise<string[]> {
  const casesDir = path.join(root, "test/e2e/cases");
  const entries = await readdir(casesDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory())
      files.push(path.join(casesDir, entry.name, "case.yml"));
  }
  return files.sort();
}

export async function loadCases(root: string): Promise<LoadedCase[]> {
  const files = await findCaseManifestFiles(root);
  const loaded: LoadedCase[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const relativeFile = path.relative(root, file);
    const raw = YAML.parse(await readFile(file, "utf8"));
    const manifest = validateCaseManifest(raw, { filePath: relativeFile });
    const previous = seen.get(manifest.id);
    if (previous !== undefined) {
      throw new Error(
        `duplicate case id ${manifest.id} (${previous} and ${relativeFile})`,
      );
    }
    seen.set(manifest.id, relativeFile);
    loaded.push({
      manifest,
      dirPath: path.dirname(file),
      filePath: relativeFile,
    });
  }
  return loaded;
}
