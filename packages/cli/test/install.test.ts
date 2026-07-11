import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

// Proves the documented local-install flow (spec AC-15.4): a direct symlink from
// a PATH dir to the built bundle exposes `wtw`, a rebuild changes the reported
// embedded SHA through the same symlink with no reinstall, and removing the
// symlink removes the command. Runs the bundle under plain Node with no Bun on
// PATH (spec AC-15.3). Writes only to throwaway temp dirs.

const cliDir = path.resolve(import.meta.dirname, "..");
const nodeDir = path.dirname(process.execPath);

async function readCliVersion(): Promise<string> {
  const pkg = JSON.parse(
    await readFile(path.join(cliDir, "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}

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
  await writeFile(
    path.join(outDir, "package.json"),
    `${JSON.stringify({ type: "module", private: true }, null, 2)}\n`,
  );
  return path.join(outDir, "index.js");
}

describe("symlink install", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  it("exposes `wtw` on PATH, tracks rebuilds through the symlink, and uninstalls", async () => {
    const version = await readCliVersion();
    const distDir = await tempDir("wtw-install-dist-");
    const binDir = await tempDir("wtw-install-bin-");

    const bundle = await buildWithSha("1111aaa", distDir);
    const link = path.join(binDir, "wtw");
    await symlink(bundle, link);

    // PATH can find `wtw` (binDir), `env`/`sh` (/usr/bin, /bin), and `node`
    // (nodeDir) — but not Bun. `sh -c` resolves `wtw` purely through PATH.
    const installedPath = [binDir, nodeDir, "/usr/bin", "/bin"].join(
      path.delimiter,
    );
    expect(installedPath).not.toContain(".bun");

    const runViaPath = () =>
      execa("sh", ["-c", "wtw --version"], {
        env: { PATH: installedPath },
        extendEnv: false,
        reject: false,
      });

    const first = await runViaPath();
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe(`${version} (1111aaa)`);

    // Rebuild in place with a different SHA; do NOT touch the symlink.
    await buildWithSha("2222bbb", distDir);
    const second = await runViaPath();
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe(`${version} (2222bbb)`);

    // Removing the symlink removes the command from PATH.
    await unlink(link);
    const removed = await runViaPath();
    expect(removed.exitCode).not.toBe(0);
    expect(removed.stdout).toBe("");
  }, 60000);
});
