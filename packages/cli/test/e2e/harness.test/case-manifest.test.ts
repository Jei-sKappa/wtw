import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadCases,
  type RawCaseManifest,
  validateCaseManifest,
} from "../harness/case-manifest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const validCase: RawCaseManifest = {
  id: "bare-invocation",
  covers: ["WTW-FR-0002.AC-0201"],
  title: "Bare invocation",
  description: "Runs the bare CLI.",
  cwd: "sub",
  command: ["--help"],
  substitute: {},
  env: {},
  setup: [],
  expect: {
    exitCode: 0,
    stdoutFile: "expected/stdout.txt",
    stderr: "",
  },
};

describe("validateCaseManifest", () => {
  it("accepts a valid e2e case manifest", () => {
    expect(
      validateCaseManifest(validCase, {
        filePath: "test/e2e/cases/bare-invocation/case.yml",
      }),
    ).toEqual(validCase);
  });

  it("defaults an omitted cwd to the project root", () => {
    const withoutCwd: Record<string, unknown> = { ...validCase };
    delete withoutCwd.cwd;

    const manifest = validateCaseManifest(withoutCwd, {
      filePath: "test/e2e/cases/bare-invocation/case.yml",
    });

    expect(manifest.cwd).toBe(".");
  });

  it("accepts a substitute map binding tokens to built-in values", () => {
    const manifest = validateCaseManifest(
      { ...validCase, substitute: { __VERSION__: "wtwCliVersion" } },
      { filePath: "test/e2e/cases/version-dev/case.yml" },
    );

    expect(manifest.substitute).toEqual({ __VERSION__: "wtwCliVersion" });
  });

  it("accepts projectRoot as a built-in substitute value", () => {
    const manifest = validateCaseManifest(
      { ...validCase, substitute: { __PROJECT_ROOT__: "projectRoot" } },
      { filePath: "test/e2e/cases/absolute-path/case.yml" },
    );

    expect(manifest.substitute).toEqual({ __PROJECT_ROOT__: "projectRoot" });
  });

  it("defaults an omitted substitute map to empty", () => {
    const withoutSubstitute: Record<string, unknown> = { ...validCase };
    delete withoutSubstitute.substitute;

    const manifest = validateCaseManifest(withoutSubstitute, {
      filePath: "test/e2e/cases/bare-invocation/case.yml",
    });

    expect(manifest.substitute).toEqual({});
  });

  it("rejects substitute values outside the built-in set", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, substitute: { __X__: "cwd" } },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(
      /substitute\["__X__"\] must be one of projectRoot, wtwCliVersion/,
    );
  });

  it("rejects non-string substitute values", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, substitute: { __X__: 1 } },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(
      /substitute\["__X__"\] must be one of projectRoot, wtwCliVersion/,
    );
  });

  it("accepts an env map of string values and defaults an omitted one to empty", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        env: { WTW_CURSOR_BIN: "__FAKE_CURSOR_BIN__", FAKE_CURSOR_FAIL: "1" },
      },
      { filePath: "test/e2e/cases/sync-open/case.yml" },
    );
    expect(manifest.env).toEqual({
      WTW_CURSOR_BIN: "__FAKE_CURSOR_BIN__",
      FAKE_CURSOR_FAIL: "1",
    });

    const withoutEnv: Record<string, unknown> = { ...validCase };
    delete withoutEnv.env;
    expect(
      validateCaseManifest(withoutEnv, {
        filePath: "test/e2e/cases/bare-invocation/case.yml",
      }).env,
    ).toEqual({});
  });

  it("rejects a non-string env value and a non-mapping env", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, env: { WTW_WT_BIN: 1 } },
        { filePath: "test/e2e/cases/sync/case.yml" },
      ),
    ).toThrow(/env\["WTW_WT_BIN"\] must be a string/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, env: ["WTW_WT_BIN"] },
        { filePath: "test/e2e/cases/sync/case.yml" },
      ),
    ).toThrow(/env must be a mapping/);
  });

  it("accepts setup cli and cp steps and defaults an omitted setup to empty", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        setup: [
          { cli: ["init"] },
          {
            cp: { from: "drift/wt.toml", to: ".config/wt.toml" },
          },
        ],
      },
      { filePath: "test/e2e/cases/sync-drift/case.yml" },
    );
    expect(manifest.setup).toEqual([
      { cli: ["init"] },
      { cp: { from: "drift/wt.toml", to: ".config/wt.toml" } },
    ]);

    const withoutSetup: Record<string, unknown> = { ...validCase };
    delete withoutSetup.setup;
    expect(
      validateCaseManifest(withoutSetup, {
        filePath: "test/e2e/cases/bare-invocation/case.yml",
      }).setup,
    ).toEqual([]);
  });

  it("accepts a run step and its optional flags/env", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        setup: [
          { run: { cmd: ["git", "init", "."] } },
          {
            run: {
              cmd: ["__WTW__", "sync"],
              background: true,
              allowFailure: true,
              env: { WTW_TEST_HOLD_UNTIL: ".release" },
            },
          },
        ],
      },
      { filePath: "test/e2e/cases/sync-concurrent/case.yml" },
    );
    expect(manifest.setup).toEqual([
      { run: { cmd: ["git", "init", "."] } },
      {
        run: {
          cmd: ["__WTW__", "sync"],
          background: true,
          allowFailure: true,
          env: { WTW_TEST_HOLD_UNTIL: ".release" },
        },
      },
    ]);
  });

  it("rejects a setup step that sets none or several of cli/cp/run", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{ run: ["init"] }] },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.run must be a mapping/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cli: ["init"], cp: { from: "a", to: "b" } }],
        },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\] must set exactly one of cli, cp, or run/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{}] },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\] must set exactly one of cli, cp, or run/);
  });

  it("rejects a malformed setup cli step", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{ cli: [] }] },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cli must be a non-empty string array/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{ cli: ["init", 1] }] },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cli\[1\] must be a string/);
  });

  it("rejects unsafe cp paths and unknown cp fields", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cp: { from: "../escape", to: ".config/wt.toml" } }],
        },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cp\.from must not contain \.\. path segments/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cp: { from: "ok", to: "/abs/dest" } }],
        },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cp\.to must not be absolute/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cp: { from: "ok", to: "dest", extra: "x" } }],
        },
        { filePath: "test/e2e/cases/sync-drift/case.yml" },
      ),
    ).toThrow(/unknown cp step field extra/);
  });

  it("rejects uppercase or requirement-shaped case ids", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, id: "WTW-FR-0002-bare" },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/invalid case id WTW-FR-0002-bare/);
  });

  it("rejects unknown case fields", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, render: { show: [] } },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/unknown case field render/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, hidden: true },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/unknown case field hidden/);
  });

  it("rejects unknown expect fields", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            ...validCase.expect,
            matcher: "contains",
          },
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/unknown expect field matcher/);
  });

  it("rejects duplicate covers and bare FR refs", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          covers: ["WTW-FR-0002.AC-0201", "WTW-FR-0002.AC-0201"],
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/duplicate ref WTW-FR-0002.AC-0201/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, covers: ["WTW-FR-0002"] },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/must be an acceptance criterion ref/);
  });

  it("rejects unsafe paths and backslashes", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, cwd: "../escape" },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/cwd must not contain \.\. path segments/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdoutFile: "expected\\stdout.txt",
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/expect.stdoutFile must use forward slashes/);
  });

  it("rejects invalid command and mutually exclusive stdout or stderr fields", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, command: ["init", 1] },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/command\[1\] must be a string/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdout: "",
            stdoutFile: "expected/stdout.txt",
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/must not set both stdout and stdoutFile/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdout: "",
            stderr: "",
            stderrFile: "expected/stderr.txt",
          },
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/must not set both stderr and stderrFile/);
  });

  it("accepts stdoutContains as a non-empty string array", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        expect: {
          exitCode: 0,
          stdoutContains: ["Usage: wtw", "Commands:"],
          stderr: "",
        },
      },
      { filePath: "test/e2e/cases/help-root/case.yml" },
    );

    expect(manifest.expect.stdoutContains).toEqual(["Usage: wtw", "Commands:"]);
  });

  it("rejects an empty or non-string stdoutContains array", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: { exitCode: 0, stdoutContains: [], stderr: "" },
        },
        { filePath: "test/e2e/cases/help-root/case.yml" },
      ),
    ).toThrow(/stdoutContains must be a non-empty string array/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: { exitCode: 0, stdoutContains: [1], stderr: "" },
        },
        { filePath: "test/e2e/cases/help-root/case.yml" },
      ),
    ).toThrow(/stdoutContains must contain only strings/);
  });

  it("requires stdout, stdoutFile, or stdoutContains and a stderr expectation", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/expect requires stdout, stdoutFile, or stdoutContains/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdout: "",
          },
        },
        { filePath: "test/e2e/cases/bare-invocation/case.yml" },
      ),
    ).toThrow(/expect requires stderr or stderrFile/);
  });
});

describe("loadCases", () => {
  it("rejects duplicate case ids across case directories", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "wtw-cases-"));
    const casesDir = path.join(tempRoot, "test/e2e/cases");
    const firstDir = path.join(casesDir, "first");
    const secondDir = path.join(casesDir, "second");
    const caseManifest = [
      "id: duplicate-case",
      "covers:",
      "  - WTW-FR-0002.AC-0201",
      "title: Duplicate case",
      "description: Uses the same case id in two directories.",
      'command: ["--help"]',
      "expect:",
      "  exitCode: 0",
      '  stdout: ""',
      '  stderr: ""',
      "",
    ].join("\n");

    try {
      await mkdir(firstDir, { recursive: true });
      await mkdir(secondDir, { recursive: true });
      await writeFile(path.join(firstDir, "case.yml"), caseManifest);
      await writeFile(path.join(secondDir, "case.yml"), caseManifest);

      await expect(loadCases(tempRoot)).rejects.toThrow(
        /duplicate case id duplicate-case/,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("loads the real e2e cases", async () => {
    const cases = await loadCases(repoRoot);
    expect(cases.map((entry) => entry.manifest.id)).toContain(
      "bare-invocation",
    );
    expect(cases.map((entry) => entry.manifest.id)).toContain("version-dev");
    expect(cases.length).toBeGreaterThanOrEqual(11);
  });
});
