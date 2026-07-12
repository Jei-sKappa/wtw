import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Contract-mode environment wiring (Task 15). The external-contract suite runs
// the BUILT `wtw` artifact against real Git, the fake Cursor, and a PINNED real
// Worktrunk v0.67.0 binary in isolated home/config/approval state. This module
// owns two machine-dependent concerns a checked-in case.yml cannot encode:
//
//   1. Resolving and version-pinning the real `wt` binary (so the suite SKIPS
//      cleanly where the pinned binary is absent, but runs on the macOS gate).
//   2. Building a bin directory of the real/built/fake executables and the
//      matching `WTW_*_BIN` overrides, so both wtw's own resolution AND the
//      shell strings Worktrunk runs for its hooks (`wt step copy-ignored`,
//      `wtw sync --open`) resolve to exactly these executables.

/** The exact Worktrunk version the contract suite is pinned to (spec AC-12.2). */
export const PINNED_WORKTRUNK_VERSION = "0.67.0";

/** The fake Cursor shim, relative to the CLI package root (`repoRoot`). */
const FAKE_CURSOR_REL = "test/e2e/harness/fake-cursor/cursor";

/** The built artifact the contract suite exercises, relative to `repoRoot`. */
const BUILT_WTW_REL = "dist/index.js";

/** Extract the first `major.minor.patch` token from a version line, or `null`. */
function extractSemver(output: string): string | null {
  const match = /\d+\.\d+\.\d+/.exec(output);
  return match === null ? null : match[0];
}

/** Locate an executable named `name` on `PATH`, or `null` when not found. */
function findOnPath(name: string): string | null {
  const entries = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of entries) {
    if (dir.length === 0) continue;
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the real `wt` binary: the `WORKTRUNK_BIN` override when set, then the
 * Homebrew install path, then `wt` on `PATH`. The interactive shell's `wt` is a
 * function wrapper unavailable to subprocesses, so only a real file is accepted.
 */
export function resolveWorktrunkBinary(): string | null {
  const override = process.env.WORKTRUNK_BIN;
  if (override !== undefined && override.length > 0 && existsSync(override)) {
    return override;
  }
  const homebrew = "/opt/homebrew/bin/wt";
  if (existsSync(homebrew)) return homebrew;
  return findOnPath("wt");
}

/** The resolved, pinned real Worktrunk, or a reason the suite must skip. */
export type WorktrunkResolution =
  | { readonly ok: true; readonly bin: string; readonly version: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve the real `wt` binary and confirm it reports the pinned v0.67.0. Any
 * failure (absent binary, non-zero exit, unparseable or non-pinned version)
 * yields a skip reason instead of throwing, so the suite is portable.
 */
export function resolvePinnedWorktrunk(): WorktrunkResolution {
  const bin = resolveWorktrunkBinary();
  if (bin === null) {
    return {
      ok: false,
      reason:
        "real Worktrunk binary not found (set WORKTRUNK_BIN, install to /opt/homebrew/bin/wt, or put wt on PATH)",
    };
  }
  let raw: string;
  try {
    raw = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
  } catch (error) {
    return {
      ok: false,
      reason: `\`${bin} --version\` failed: ${String(error)}`,
    };
  }
  const version = extractSemver(raw);
  if (version === null) {
    return {
      ok: false,
      reason: `\`${bin} --version\` printed no version: ${raw}`,
    };
  }
  if (version !== PINNED_WORKTRUNK_VERSION) {
    return {
      ok: false,
      reason: `Worktrunk ${version} is not the pinned v${PINNED_WORKTRUNK_VERSION} (from: ${raw})`,
    };
  }
  return { ok: true, bin, version };
}

/** Whether the built `wtw` artifact exists under `repoRoot`. */
export function builtWtwExists(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, BUILT_WTW_REL));
}

/** A bin directory of the contract executables plus the env overrides. */
export interface ContractEnvironment {
  /** The temp bin dir prepended to `PATH` (holds wtw/wt/cursor/git/node). */
  readonly binDir: string;
  /** Env additions for a contract subprocess (PATH + all `WTW_*_BIN`). */
  readonly env: NodeJS.ProcessEnv;
  /** Absolute path of the fake Cursor shim (for assertions/logging setup). */
  readonly cursorBin: string;
}

/**
 * Build a bin directory containing the built `wtw`, the real `wt`, the real
 * `git`, this process's `node`, and the fake Cursor, and return the `PATH`
 * (bin dir prepended) plus the `WTW_*_BIN` overrides. Both are needed: the
 * overrides steer wtw's own resolution, while the on-`PATH` names let the shell
 * strings Worktrunk executes for its hooks resolve `wt` and `wtw` by name.
 */
export function buildContractEnvironment(
  repoRoot: string,
  wtBin: string,
): ContractEnvironment {
  const binDir = mkdtempSync(path.join(tmpdir(), "wtw-contract-bin-"));
  const wtwBin = path.join(binDir, "wtw");
  const cursorSrc = path.resolve(repoRoot, FAKE_CURSOR_REL);
  const gitBin = findOnPath("git") ?? "git";
  const nodeBin = process.execPath;

  symlinkSync(path.resolve(repoRoot, BUILT_WTW_REL), wtwBin);
  symlinkSync(wtBin, path.join(binDir, "wt"));
  symlinkSync(cursorSrc, path.join(binDir, "cursor"));
  if (existsSync(gitBin)) symlinkSync(gitBin, path.join(binDir, "git"));
  symlinkSync(nodeBin, path.join(binDir, "node"));

  const env: NodeJS.ProcessEnv = {
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    WTW_WT_BIN: wtBin,
    WTW_CURSOR_BIN: cursorSrc,
    WTW_GIT_BIN: gitBin,
    WTW_NODE_BIN: nodeBin,
    WTW_WTW_BIN: wtwBin,
  };
  return { binDir, env, cursorBin: cursorSrc };
}
