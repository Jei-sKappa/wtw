import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

// These tests genuinely run `bun build` to produce the Node-targeted bundle and
// then execute it under Node (never Bun), so they establish spec AC-15.2/AC-15.3
// and AC-01.4 — the criteria that cannot be observed from the source-run fast
// E2E harness. They write only to throwaway temp dirs and clean up afterwards.

const cliDir = path.resolve(import.meta.dirname, "..");
const nodeDir = path.dirname(process.execPath);
// A PATH that can launch Node and resolve `env`, but deliberately excludes the
// Bun install dir — proving the bundle runs on plain Node with no Bun present.
const nodeOnlyPath = [nodeDir, "/usr/bin", "/bin"].join(path.delimiter);

async function readCliVersion(): Promise<string> {
  const pkg = JSON.parse(
    await readFile(path.join(cliDir, "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}

// Build the CLI into `outDir` with `sha` injected as `WTW_GIT_SHA`, mirroring the
// package.json `build` script's `bun build … --define` mechanism. The literal
// double quotes around the value make Bun treat it as a JS string literal.
async function buildWithSha(sha: string, outDir: string): Promise<string> {
  await execa(
    "bun",
    [
      "build",
      "src/index.ts",
      "--target=node",
      `--outdir=${outDir}`,
      "--banner=#!/usr/bin/env node",
      "--define",
      `WTW_GIT_SHA="${sha}"`,
    ],
    { cwd: cliDir },
  );
  // Node picks the module format from the nearest package.json; the bundle is
  // ESM, matching the real install context (packages/cli/package.json is a
  // module). The symlink target in production resolves to that same context.
  await writeFile(
    path.join(outDir, "package.json"),
    `${JSON.stringify({ type: "module", private: true }, null, 2)}\n`,
  );
  return path.join(outDir, "index.js");
}

describe("cli build", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "wtw-build-"));
    dirs.push(dir);
    return dir;
  }

  it("injects a known SHA and the bundle prints `<version> (<sha>)` under Node without Bun", async () => {
    const sha = "abc1234";
    const outDir = await tempDir();
    const bundle = await buildWithSha(sha, outDir);
    const version = await readCliVersion();

    const source = await readFile(bundle, "utf8");
    expect(source.split("\n")[0]).toBe("#!/usr/bin/env node");
    // Self-contained (spec AC-01.4): no unresolved `@wtw/core` runtime import and
    // no dangling relative `require("./…")` left by a partially bundled dep.
    expect(source).not.toMatch(
      /(?:import[^;]*from\s*|require\(\s*)["']@wtw\/core["']/,
    );
    expect(source).not.toMatch(/require\(\s*["']\.\//);

    const result = await execa(process.execPath, [bundle, "--version"], {
      cwd: outDir,
      env: { PATH: nodeOnlyPath },
      extendEnv: false,
    });
    expect(nodeOnlyPath).not.toContain(".bun");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${version} (${sha})`);
  }, 60000);

  it("fails clearly when the build cannot resolve a Git SHA", async () => {
    // Drive the real package.json `build` script with a `git` shim that always
    // fails, so the SHA cannot resolve. The script must abort before `bun build`
    // rather than embed an empty or `dev` SHA.
    const fakeBin = await tempDir();
    await writeFile(
      path.join(fakeBin, "git"),
      "#!/bin/sh\necho 'wtw-fake-git: no repository here' >&2\nexit 128\n",
    );
    await execa("chmod", ["+x", path.join(fakeBin, "git")]);

    const result = await execa("bun", ["run", "build"], {
      cwd: cliDir,
      env: { PATH: [fakeBin, process.env.PATH].join(path.delimiter) },
      reject: false,
    });

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("wtw-fake-git");
  }, 60000);
});
