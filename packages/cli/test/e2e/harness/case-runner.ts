import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { expect } from "vitest";
import type {
  CaseManifest,
  LoadedCase,
  SetupStep,
  SubstitutionValue,
} from "./case-manifest";
import { loadPackageVersion } from "./requirements";

type Side = "fixture" | "expected";
type ResolveCtx = { projectRoot: string; repoRoot: string };

/**
 * The two labelled automated modes the single harness supports (decision log
 * P13). `fast` runs the real `wtw` source entrypoint through `bun` in an
 * isolated temp environment with declared fake Worktrunk/Cursor/Git
 * executables. `contract` runs the built artifact under Node against a pinned
 * real Worktrunk — filled in by Task 15; the parameter exists now so every case
 * and the same runner serve both modes.
 */
export type RunMode = "fast" | "contract";

// The runner owns how each built-in substitution name resolves to a runtime
// value and which side(s) it applies to: `projectRoot` is injected into copied
// fixture files AND into expected output — the temp project root is
// machine-dependent, so a case asserting an absolute runtime path (e.g. the
// exact workspace path the fake Cursor was launched with) must be able to name
// it on the expected side too. `wtwCliVersion` is injected into expected output
// only. A case's `substitute` map only binds author-chosen tokens to these names.
const SUBSTITUTIONS: Record<
  SubstitutionValue,
  {
    sides: readonly Side[];
    resolve: (ctx: ResolveCtx) => string | Promise<string>;
  }
> = {
  projectRoot: {
    sides: ["fixture", "expected"],
    resolve: (ctx) => ctx.projectRoot,
  },
  wtwCliVersion: {
    sides: ["expected"],
    resolve: (ctx) => loadPackageVersion(ctx.repoRoot),
  },
};

function context(testCase: CaseManifest, field: string): string {
  return `[${testCase.id}] covers ${testCase.covers.join(", ")} ${field}`;
}

/**
 * The harness-relative locations of the checked-in fake executables, keyed by
 * the env-value sentinel a case uses to reference each one. The absolute path
 * of a checked-in shim is machine-dependent and so cannot be hard-coded into a
 * case; a case writes the sentinel as an `env` value and the runner rewrites it
 * to the shim's absolute path (resolved against `repoRoot`). Each shim records
 * its argv and cwd and injects deterministic success/failure via env; the fake
 * Cursor only records the workspace path it was asked to open and never spawns
 * a GUI.
 */
const FAKE_SHIMS: Record<string, string> = {
  __FAKE_GIT_BIN__: "test/e2e/harness/fake-git/git",
  __FAKE_WT_BIN__: "test/e2e/harness/fake-worktrunk/wt",
  __FAKE_CURSOR_BIN__: "test/e2e/harness/fake-cursor/cursor",
};

export const FAKE_GIT_BIN_TOKEN = "__FAKE_GIT_BIN__";
export const FAKE_WT_BIN_TOKEN = "__FAKE_WT_BIN__";
export const FAKE_CURSOR_BIN_TOKEN = "__FAKE_CURSOR_BIN__";

/**
 * Resolve a case's `env` map for the subprocess: every value equal to a
 * fake-executable sentinel becomes that checked-in shim's absolute path
 * (resolved against `repoRoot`); all other values pass through verbatim.
 */
export function resolveEnv(
  env: Record<string, string>,
  repoRoot: string,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const shim = FAKE_SHIMS[value];
    resolved[key] = shim === undefined ? value : path.resolve(repoRoot, shim);
  }
  return resolved;
}

async function readExpectedText(
  testCase: LoadedCase,
  inline: string | undefined,
  file: string | undefined,
): Promise<string> {
  if (inline !== undefined) return inline;
  if (file === undefined) return "";
  return readFile(path.join(testCase.dirPath, file), "utf8");
}

function expandExpected(
  value: string,
  replacements: ReadonlyMap<string, string>,
): string {
  let result = value;
  for (const [token, replacement] of replacements) {
    result = result.replaceAll(token, replacement);
  }
  return result;
}

async function createTempDir(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "wtw-e2e-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function copyCaseDir(
  caseDir: string,
  subdir: string,
  tempRoot: string,
): Promise<void> {
  const source = path.join(caseDir, subdir);
  // A case's `fixture/` folder holds the files that exist when the CLI runs;
  // its *contents* are copied to `tempRoot`, so `tempRoot` becomes the root the
  // command sees. Some cases intentionally have an *empty* workspace (e.g. a
  // bare-invocation surface case), and Git cannot track an empty directory, so
  // such a case ships with no `fixture/` folder at all (only `case.yml`). Treat
  // an absent source as an empty workspace: `tempRoot` was just created by
  // `mkdtemp`, so an empty workspace is exactly what we want.
  try {
    await cp(source, tempRoot, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function copyCaseFixture(
  caseDir: string,
  tempRoot: string,
): Promise<void> {
  // The `fixture/` contents populate the project root the command sees.
  await copyCaseDir(caseDir, "fixture", tempRoot);
}

export async function expandFixturePlaceholders(
  root: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await expandFixturePlaceholders(absolutePath, replacements);
      continue;
    }
    if (!entry.isFile()) continue;

    const original = await readFile(absolutePath, "utf8");
    let expanded = original;
    for (const [token, replacement] of replacements) {
      expanded = expanded.replaceAll(token, replacement);
    }
    if (expanded !== original) {
      await writeFile(absolutePath, expanded, "utf8");
    }
  }
}

async function resolveCwd(
  projectRoot: string,
  cwd: string,
  testCase: CaseManifest,
): Promise<string> {
  const realRoot = await realpath(projectRoot);
  const absoluteCwd = path.resolve(realRoot, cwd);
  const relative = path.relative(realRoot, absoluteCwd);
  if (relative === "") return realRoot;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${context(testCase, "cwd")} escapes temp project`);
  }
  await mkdir(absoluteCwd, { recursive: true });
  return absoluteCwd;
}

type SetupContext = {
  /** The case directory (source of `cp:` `from` paths). */
  caseDir: string;
  /** The temp project root (target of `cp:` `to` paths). */
  projectRoot: string;
  /** The cwd the CLI runs from (same as the main command). */
  cwd: string;
  /** The CLI entrypoint argv (e.g. `["bun", <src/index.ts>]`). */
  cli: string[];
  /** The subprocess environment (already includes isolated HOME + case `env`). */
  env: NodeJS.ProcessEnv;
  /** Label prefix for assertion/error context. */
  label: string;
  /** Repo root, needed to resolve fake-shim sentinels in a run step's `env`. */
  repoRoot?: string;
  /** Collector for `background: true` run steps, awaited after the main command. */
  background?: Promise<unknown>[];
};

/** The token a `run:` step uses as `cmd[0]` to mean "the wtw CLI entrypoint". */
const WTW_ENTRYPOINT_TOKEN = "__WTW__";

/**
 * Run the case's `setup` pre-steps in order, before the main `command`.
 *
 * - A `cli:` step runs the wtw CLI through the same entrypoint, cwd, and
 *   environment as the main command — a non-zero exit fails the case loudly so a
 *   broken setup never silently masquerades as the behavior under test.
 * - A `cp:` step copies a case-relative fixture path onto a root-relative
 *   destination in the temp tree (creating parent directories).
 * - A `run:` step executes an arbitrary program with structured args (real Git,
 *   `mkdir`/`touch`, or the wtw entrypoint via the `__WTW__` token) with a
 *   step-local env merged over the case env. `background: true` starts it without
 *   awaiting inline (collected for the caller to await after the main command);
 *   `allowFailure: true` tolerates a non-zero exit.
 */
export async function runSetupSteps(
  steps: readonly SetupStep[],
  ctx: SetupContext,
): Promise<void> {
  const [cliFile, ...cliArgs] = ctx.cli;
  if (cliFile === undefined) {
    throw new Error(`${ctx.label} setup requires a non-empty cli entrypoint`);
  }
  for (const [index, step] of steps.entries()) {
    if ("cli" in step) {
      const result = await execa(cliFile, [...cliArgs, ...step.cli], {
        cwd: ctx.cwd,
        env: ctx.env,
        reject: false,
        stripFinalNewline: false,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `${ctx.label} setup[${index}] cli step failed (exit ${result.exitCode}): ` +
            `wtw ${step.cli.join(" ")}\n${result.stderr}`,
        );
      }
    } else if ("run" in step) {
      const [rawBin, ...rawArgs] = step.run.cmd;
      const [bin, args] =
        rawBin === WTW_ENTRYPOINT_TOKEN
          ? [cliFile, [...cliArgs, ...rawArgs]]
          : [rawBin as string, rawArgs];
      const stepEnv =
        step.run.env === undefined
          ? ctx.env
          : {
              ...ctx.env,
              ...resolveEnv(step.run.env, ctx.repoRoot ?? process.cwd()),
            };
      const child = execa(bin, args, {
        cwd: ctx.cwd,
        env: stepEnv,
        reject: false,
        stripFinalNewline: false,
      });
      if (step.run.background === true) {
        (ctx.background ?? []).push(
          child.catch(() => {
            /* background failures are surfaced only via later assertions */
          }),
        );
        continue;
      }
      const result = await child;
      if (result.exitCode !== 0 && step.run.allowFailure !== true) {
        throw new Error(
          `${ctx.label} setup[${index}] run step failed (exit ${result.exitCode}): ` +
            `${step.run.cmd.join(" ")}\n${result.stderr}`,
        );
      }
    } else {
      const from = path.join(ctx.caseDir, step.cp.from);
      const to = path.join(ctx.projectRoot, step.cp.to);
      await mkdir(path.dirname(to), { recursive: true });
      await cp(from, to, { recursive: true });
    }
  }
}

/**
 * The CLI entrypoint argv for a run mode. `fast` runs the source entrypoint
 * through `bun`; `contract` runs the built Node bundle. Task 15 owns the
 * contract-mode environment (real Worktrunk, isolated approval state); the
 * entrypoint selection is the seam that lets the same runner serve both.
 */
function entrypointArgv(mode: RunMode, repoRoot: string): string[] {
  if (mode === "contract") {
    return [process.execPath, path.resolve(repoRoot, "dist/index.js")];
  }
  return ["bun", path.resolve(repoRoot, "src/index.ts")];
}

/**
 * Options for a single case run. `extraEnv` is merged into the CLI subprocess
 * environment after the isolated `HOME` and before the case `env` (so a case can
 * still override it). Contract-mode runs use it to inject the pinned real
 * Worktrunk, real Git, the built `wtw`, and the fake Cursor (a prepended bin
 * directory plus the matching `WTW_*_BIN` overrides) resolved by the contract
 * suite — machine-dependent absolute paths a checked-in case.yml cannot name.
 */
export type RunCaseOptions = { extraEnv?: NodeJS.ProcessEnv };

export async function runCase(
  repoRoot: string,
  testCase: LoadedCase,
  mode: RunMode = "fast",
  options: RunCaseOptions = {},
): Promise<void> {
  const temp = await createTempDir();
  // A second temp dir is the per-case isolated HOME, so the CLI never reads the
  // developer's real home/config/approval state. It starts empty; a case that
  // needs seeded home content copies it in via a fixture/setup step.
  const homeTemp = await createTempDir();
  try {
    await copyCaseFixture(testCase.dirPath, temp.root);
    const projectRoot = await realpath(temp.root);
    const homeRoot = await realpath(homeTemp.root);

    // Resolve the case's declared substitutions, routing each to the side its
    // built-in name applies to. Fixture-side tokens are rewritten in the copied
    // files before the CLI runs; expected-side tokens are rewritten in the
    // expected output before comparison.
    const fixtureReplacements = new Map<string, string>();
    const expectedReplacements = new Map<string, string>();
    for (const [token, name] of Object.entries(testCase.manifest.substitute)) {
      const spec = SUBSTITUTIONS[name];
      const value = await spec.resolve({ projectRoot, repoRoot });
      for (const side of spec.sides) {
        (side === "fixture" ? fixtureReplacements : expectedReplacements).set(
          token,
          value,
        );
      }
    }
    if (fixtureReplacements.size > 0) {
      await expandFixturePlaceholders(projectRoot, fixtureReplacements);
    }

    const cwd = await resolveCwd(
      projectRoot,
      testCase.manifest.cwd,
      testCase.manifest,
    );
    const cli = entrypointArgv(mode, repoRoot);
    const [cliFile, ...cliArgs] = cli;
    // The CLI subprocess always sees an isolated HOME; a case's `env` map is
    // merged after it, so a case can add extra environment such as a fake
    // executable path. A fake shim's absolute path is machine-dependent, so a
    // case writes a sentinel (`__FAKE_WT_BIN__`, `__FAKE_CURSOR_BIN__`,
    // `__FAKE_GIT_BIN__`) and the runner resolves it to the checked-in shim.
    const env: NodeJS.ProcessEnv = {
      HOME: homeRoot,
      ...options.extraEnv,
      ...resolveEnv(testCase.manifest.env, repoRoot),
    };

    // Run any `setup` pre-steps (in order) after fixture/substitute expansion
    // and before the main command, sharing the same cwd and environment.
    const background: Promise<unknown>[] = [];
    await runSetupSteps(testCase.manifest.setup, {
      caseDir: testCase.dirPath,
      projectRoot,
      cwd,
      cli,
      env,
      label: `[${testCase.manifest.id}]`,
      repoRoot,
      background,
    });

    if (cliFile === undefined) {
      throw new Error(`${context(testCase.manifest, "cli")} is empty`);
    }
    const result = await execa(
      cliFile,
      [...cliArgs, ...testCase.manifest.command],
      {
        cwd,
        env,
        reject: false,
        stripFinalNewline: false,
      },
    );

    // Await any background setup processes (e.g. a second overlapping sync) so
    // every write has landed before assertions read the tree — keeping a
    // concurrency case deterministic.
    await Promise.allSettled(background);

    const stdout = await readExpectedText(
      testCase,
      testCase.manifest.expect.stdout,
      testCase.manifest.expect.stdoutFile,
    );
    const stderr = await readExpectedText(
      testCase,
      testCase.manifest.expect.stderr,
      testCase.manifest.expect.stderrFile,
    );

    expect(result.exitCode, context(testCase.manifest, "exitCode")).toBe(
      testCase.manifest.expect.exitCode,
    );
    if (
      testCase.manifest.expect.stdout !== undefined ||
      testCase.manifest.expect.stdoutFile !== undefined
    ) {
      expect(result.stdout, context(testCase.manifest, "stdout")).toBe(
        expandExpected(stdout, expectedReplacements),
      );
    }
    for (const substring of testCase.manifest.expect.stdoutContains ?? []) {
      expect(
        result.stdout.includes(expandExpected(substring, expectedReplacements)),
        context(testCase.manifest, `stdoutContains.${substring}`),
      ).toBe(true);
    }
    if (
      testCase.manifest.expect.stderr !== undefined ||
      testCase.manifest.expect.stderrFile !== undefined
    ) {
      expect(result.stderr, context(testCase.manifest, "stderr")).toBe(
        expandExpected(stderr, expectedReplacements),
      );
    }

    if (testCase.manifest.expect.files !== undefined) {
      for (const [actualPath, expectedPath] of Object.entries(
        testCase.manifest.expect.files,
      )) {
        const actual = await readFile(
          path.join(projectRoot, actualPath),
          "utf8",
        );
        const expected = await readFile(
          path.join(testCase.dirPath, expectedPath),
          "utf8",
        );
        expect(actual, context(testCase.manifest, `files.${actualPath}`)).toBe(
          expandExpected(expected, expectedReplacements),
        );
      }
    }

    if (testCase.manifest.expect.fileContains !== undefined) {
      for (const [actualPath, substrings] of Object.entries(
        testCase.manifest.expect.fileContains,
      )) {
        const actual = await readFile(
          path.join(projectRoot, actualPath),
          "utf8",
        );
        for (const substring of substrings) {
          expect(
            actual.includes(expandExpected(substring, expectedReplacements)),
            context(testCase.manifest, `fileContains.${actualPath}`),
          ).toBe(true);
        }
      }
    }

    if (testCase.manifest.expect.fileNotContains !== undefined) {
      for (const [actualPath, substrings] of Object.entries(
        testCase.manifest.expect.fileNotContains,
      )) {
        const actual = await readFile(
          path.join(projectRoot, actualPath),
          "utf8",
        );
        for (const substring of substrings) {
          expect(
            actual.includes(expandExpected(substring, expectedReplacements)),
            context(testCase.manifest, `fileNotContains.${actualPath}`),
          ).toBe(false);
        }
      }
    }
  } finally {
    await temp.cleanup();
    await homeTemp.cleanup();
  }
}
