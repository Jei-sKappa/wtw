import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyCaseFixture,
  expandFixturePlaceholders,
  FAKE_CURSOR_BIN_TOKEN,
  FAKE_GIT_BIN_TOKEN,
  FAKE_WT_BIN_TOKEN,
  resolveEnv,
  runSetupSteps,
} from "../harness/case-runner";

const HARNESS = path.resolve(import.meta.dirname, "../harness");
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const FAKE_GIT = path.join(HARNESS, "fake-git/git");
const FAKE_WT = path.join(HARNESS, "fake-worktrunk/wt");
const FAKE_CURSOR = path.join(HARNESS, "fake-cursor/cursor");

describe("copyCaseFixture", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "wtw-harness-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("copies the case fixture into the temp workspace", async () => {
    const caseDir = await makeTempDir();
    const fixtureDir = path.join(caseDir, "fixture", ".config");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(path.join(fixtureDir, "wt.toml"), "hi\n");
    const tempRoot = await makeTempDir();

    await copyCaseFixture(caseDir, tempRoot);

    const copied = await readdir(path.join(tempRoot, ".config"));
    expect(copied).toEqual(["wt.toml"]);
  });

  it("expands substitution tokens in copied fixture text files without following symlinks", async () => {
    const tempRoot = await makeTempDir();
    const outsideRoot = await makeTempDir();
    const fixtureDir = path.join(tempRoot, ".config");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(
      path.join(fixtureDir, "wt.toml"),
      "root = __PROJECT_ROOT__\n",
    );
    await writeFile(
      path.join(outsideRoot, "outside.txt"),
      "__PROJECT_ROOT__\n",
    );
    await symlink(
      path.join(outsideRoot, "outside.txt"),
      path.join(fixtureDir, "leak.txt"),
    );

    await expandFixturePlaceholders(
      tempRoot,
      new Map([["__PROJECT_ROOT__", tempRoot]]),
    );

    await expect(
      readFile(path.join(fixtureDir, "wt.toml"), "utf8"),
    ).resolves.toBe(`root = ${tempRoot}\n`);
    await expect(
      readFile(path.join(fixtureDir, "leak.txt"), "utf8"),
    ).resolves.toBe("__PROJECT_ROOT__\n");
  });

  it("treats an absent fixture/ folder as an empty workspace", async () => {
    const caseDir = await makeTempDir(); // intentionally no fixture/ subdir
    const tempRoot = await makeTempDir();

    await expect(copyCaseFixture(caseDir, tempRoot)).resolves.toBeUndefined();
    expect(await readdir(tempRoot)).toEqual([]);
  });
});

describe("resolveEnv", () => {
  it("rewrites fake-executable sentinels to their absolute shim paths", () => {
    const resolved = resolveEnv(
      {
        WTW_GIT_BIN: FAKE_GIT_BIN_TOKEN,
        WTW_WT_BIN: FAKE_WT_BIN_TOKEN,
        WTW_CURSOR_BIN: FAKE_CURSOR_BIN_TOKEN,
        PLAIN: "left-as-is",
      },
      REPO_ROOT,
    );

    expect(resolved.WTW_GIT_BIN).toBe(FAKE_GIT);
    expect(resolved.WTW_WT_BIN).toBe(FAKE_WT);
    expect(resolved.WTW_CURSOR_BIN).toBe(FAKE_CURSOR);
    expect(resolved.PLAIN).toBe("left-as-is");
  });
});

describe("runSetupSteps", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "wtw-setup-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  // A stand-in for the CLI entrypoint: a tiny script run via `bun`. It appends
  // its argv to `marker.log` in the cwd, then exits with the code named by its
  // first argument so a test can drive both success and failure.
  async function writeFakeCli(dir: string): Promise<string> {
    const cliPath = path.join(dir, "fake-cli.mjs");
    await writeFile(
      cliPath,
      [
        "import { appendFileSync } from 'node:fs';",
        "const argv = process.argv.slice(2);",
        "appendFileSync('marker.log', argv.join(' ') + '\\n');",
        "process.exit(Number(argv[0]) || 0);",
        "",
      ].join("\n"),
    );
    return cliPath;
  }

  it("runs cli and cp setup steps in order, sharing cwd and env", async () => {
    const projectRoot = await makeTempDir();
    const caseDir = await makeTempDir();
    const scriptDir = await makeTempDir();
    const cliPath = await writeFakeCli(scriptDir);

    await mkdir(path.join(caseDir, "drift"), { recursive: true });
    await writeFile(path.join(caseDir, "drift", "wt.toml"), "drift body\n");

    await runSetupSteps(
      [
        { cli: ["0", "init"] },
        { cp: { from: "drift/wt.toml", to: ".config/wt.toml" } },
      ],
      {
        caseDir,
        projectRoot,
        cwd: projectRoot,
        cli: ["bun", cliPath],
        env: { ...process.env },
        label: "[setup-ok]",
      },
    );

    await expect(
      readFile(path.join(projectRoot, "marker.log"), "utf8"),
    ).resolves.toBe("0 init\n");
    await expect(
      readFile(path.join(projectRoot, ".config", "wt.toml"), "utf8"),
    ).resolves.toBe("drift body\n");
  });

  it("fails loudly when a cli setup step exits non-zero", async () => {
    const projectRoot = await makeTempDir();
    const caseDir = await makeTempDir();
    const scriptDir = await makeTempDir();
    const cliPath = await writeFakeCli(scriptDir);

    await expect(
      runSetupSteps([{ cli: ["7", "boom"] }], {
        caseDir,
        projectRoot,
        cwd: projectRoot,
        cli: ["bun", cliPath],
        env: { ...process.env },
        label: "[setup-fail]",
      }),
    ).rejects.toThrow(/setup\[0\] cli step failed \(exit 7\)/);
  });

  it("does nothing for an empty setup list", async () => {
    const projectRoot = await makeTempDir();
    const caseDir = await makeTempDir();

    await expect(
      runSetupSteps([], {
        caseDir,
        projectRoot,
        cwd: projectRoot,
        cli: ["bun", path.join(caseDir, "unused.mjs")],
        env: { ...process.env },
        label: "[setup-empty]",
      }),
    ).resolves.toBeUndefined();
    expect(await readdir(projectRoot)).toEqual([]);
  });
});

describe("fake executables", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "wtw-fakes-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  function run(
    bin: string,
    args: string[],
    cwd: string,
    env: Record<string, string> = {},
  ) {
    return execa(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      reject: false,
      stripFinalNewline: false,
    });
  }

  it("fake git answers --version and records the invocation", async () => {
    const cwd = await makeTempDir();
    const result = await run(FAKE_GIT, ["--version"], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("git version");

    const log = await readFile(path.join(cwd, ".fake-git.log"), "utf8");
    expect(JSON.parse(log.trim())).toEqual({
      argv: ["--version"],
      cwd: await realpath(cwd),
    });
  });

  it("fake git injects failure via FAKE_GIT_FAIL", async () => {
    const cwd = await makeTempDir();
    const result = await run(FAKE_GIT, ["worktree", "list"], cwd, {
      FAKE_GIT_FAIL: "1",
      FAKE_GIT_STDERR: "fatal: simulated failure",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("fatal: simulated failure");
  });

  it("fake wt reports a Worktrunk version and injects failure", async () => {
    const cwd = await makeTempDir();
    const version = await run(FAKE_WT, ["--version"], cwd, {
      FAKE_WT_VERSION: "0.62.0",
    });
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe("0.62.0");

    const failed = await run(FAKE_WT, ["start", "feature"], cwd, {
      FAKE_WT_FAIL: "1",
      FAKE_WT_STDERR: "error: simulated worktrunk failure",
    });
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain("error: simulated worktrunk failure");
  });

  it("fake cursor records the workspace path and never opens a GUI", async () => {
    const cwd = await makeTempDir();
    const logPath = path.join(cwd, "cursor-invocations.log");
    const workspacePath = path.join(cwd, "repo.code-workspace");

    const result = await run(FAKE_CURSOR, [workspacePath], cwd, {
      FAKE_CURSOR_LOG: logPath,
    });

    expect(result.exitCode).toBe(0);
    // No GUI: the shim writes nothing to stdout/stderr and spawns no child.
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");

    const log = await readFile(logPath, "utf8");
    expect(JSON.parse(log.trim())).toEqual({
      argv: [workspacePath],
      cwd: await realpath(cwd),
    });
  });

  it("fake cursor injects a launch failure via FAKE_CURSOR_FAIL but still records", async () => {
    const cwd = await makeTempDir();
    const logPath = path.join(cwd, "cursor-invocations.log");
    const workspacePath = path.join(cwd, "repo.code-workspace");

    const result = await run(FAKE_CURSOR, [workspacePath], cwd, {
      FAKE_CURSOR_LOG: logPath,
      FAKE_CURSOR_FAIL: "1",
      FAKE_CURSOR_STDERR: "simulated launch failure",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("simulated launch failure");
    const log = await readFile(logPath, "utf8");
    expect(JSON.parse(log.trim())).toEqual({
      argv: [workspacePath],
      cwd: await realpath(cwd),
    });
  });
});
