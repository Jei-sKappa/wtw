import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WtwError } from "@wtw/core";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePlatformSupport } from "../../src/platform";
import { resolveRepositoryContext } from "../../src/repo/resolve";

// These unit tests drive the real resolver against a *simulated* `git` chosen
// through the same executable-resolution seam the e2e harness uses: the
// `WTW_GIT_BIN` env var (the harness rewrites the `__FAKE_GIT_BIN__` sentinel
// into it). Unlike the single-stdout checked-in e2e shim, each scenario writes
// a tiny fake `git` that dispatches on argv, because one resolution issues
// several distinct Git queries (`--git-common-dir`, `worktree list`,
// `--is-bare-repository`, `--show-toplevel`) that must each answer differently.
// No real repository is touched.

/** Deterministic per-subcommand behavior for the simulated `git`. */
interface FakeGitSpec {
  commonDir?: string;
  isBare?: string;
  topLevel?: string;
  porcelain?: string;
  /** argv tokens that, when present, make the fake exit non-zero. */
  failOn?: string[];
  failStderr?: string;
}

const createdDirs: string[] = [];
let savedGitBin: string | undefined;
let gitBinSaved = false;

afterEach(async () => {
  if (gitBinSaved) {
    if (savedGitBin === undefined) {
      delete process.env.WTW_GIT_BIN;
    } else {
      process.env.WTW_GIT_BIN = savedGitBin;
    }
    gitBinSaved = false;
    savedGitBin = undefined;
  }
  await Promise.all(
    createdDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `wtw-resolve-${prefix}-`));
  createdDirs.push(dir);
  return dir;
}

/** Write an executable fake `git` dispatching on argv, baking `spec` inline. */
async function writeFakeGit(spec: FakeGitSpec): Promise<string> {
  const dir = await makeDir("git");
  const bin = path.join(dir, "git");
  const script = `#!/usr/bin/env node
"use strict";
const spec = ${JSON.stringify(spec)};
const argv = process.argv.slice(2);
function out(value) {
  const text = String(value);
  process.stdout.write(text.endsWith("\\n") ? text : text + "\\n");
  process.exit(0);
}
function fail(message) {
  process.stderr.write((message || "fatal: fake-git failure") + "\\n");
  process.exit(128);
}
if (argv.includes("--version")) out("git version 2.40.0 (unit-fake)");
if (Array.isArray(spec.failOn) && spec.failOn.some((t) => argv.includes(t))) {
  fail(spec.failStderr);
}
if (argv[0] === "rev-parse") {
  if (argv.includes("--git-common-dir")) out(spec.commonDir || "");
  if (argv.includes("--is-bare-repository")) out(spec.isBare || "false");
  if (argv.includes("--show-toplevel")) out(spec.topLevel || "");
  fail("fatal: unknown rev-parse invocation: " + argv.join(" "));
}
if (argv[0] === "worktree" && argv[1] === "list") out(spec.porcelain || "");
fail("fatal: unknown git invocation: " + argv.join(" "));
`;
  await writeFile(bin, script, "utf8");
  await chmod(bin, 0o755);
  return bin;
}

/** Point the resolver's git wrapper at a scenario's simulated `git`. */
async function useFakeGit(spec: FakeGitSpec): Promise<void> {
  if (!gitBinSaved) {
    savedGitBin = process.env.WTW_GIT_BIN;
    gitBinSaved = true;
  }
  process.env.WTW_GIT_BIN = await writeFakeGit(spec);
}

function porcelainBlock(entries: readonly string[]): string {
  return `${entries.join("\n\n")}\n`;
}

/** Capture a thrown `WtwError` from an async call. */
async function catchWtwError(promise: Promise<unknown>): Promise<WtwError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(WtwError);
    return error as WtwError;
  }
  throw new Error("expected the resolver to throw a WtwError");
}

describe("resolvePlatformSupport", () => {
  it("classifies macOS as verified", () => {
    const support = resolvePlatformSupport("darwin");
    expect(support.status).toBe("verified");
    expect(support.platform).toBe("darwin");
  });

  it("classifies Linux as allowed but unverified/best-effort", () => {
    const support = resolvePlatformSupport("linux");
    expect(support.status).toBe("unverified");
    // The reason must not claim suite evidence.
    expect(support.reason.toLowerCase()).toContain("unverified");
  });

  it("classifies Windows and other platforms as unsupported", () => {
    expect(resolvePlatformSupport("win32").status).toBe("unsupported");
    expect(resolvePlatformSupport("aix").status).toBe("unsupported");
  });
});

describe("resolveRepositoryContext — location independence (AC-03.1)", () => {
  it("resolves the same primary/common context from all four locations", async () => {
    const primary = await makeDir("primary");
    const linked = await makeDir("linked");
    const nestedPrimary = path.join(primary, "src", "deep");
    const nestedLinked = path.join(linked, "pkg", "inner");
    await mkdir(nestedPrimary, { recursive: true });
    await mkdir(nestedLinked, { recursive: true });
    const commonDir = path.join(primary, ".git");

    await useFakeGit({
      commonDir,
      isBare: "false",
      topLevel: primary,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main`,
        `worktree ${linked}\nHEAD 2222222222222222222222222222222222222222\nbranch refs/heads/feature`,
      ]),
    });

    const fromPrimary = await resolveRepositoryContext(primary);
    const fromNestedPrimary = await resolveRepositoryContext(nestedPrimary);
    const fromLinked = await resolveRepositoryContext(linked);
    const fromNestedLinked = await resolveRepositoryContext(nestedLinked);

    expect(fromPrimary.primaryPath).toBe(primary);
    expect(fromPrimary.gitCommonDir).toBe(commonDir);
    expect(fromPrimary.worktrees).toHaveLength(2);
    expect(fromPrimary.worktrees[0]?.primary).toBe(true);
    expect(fromPrimary.worktrees[1]?.branch).toBe("refs/heads/feature");

    // Every invocation location resolves the identical context.
    expect(fromNestedPrimary).toEqual(fromPrimary);
    expect(fromLinked).toEqual(fromPrimary);
    expect(fromNestedLinked).toEqual(fromPrimary);
  });
});

describe("resolveRepositoryContext — paths with spaces (AC-03.2)", () => {
  it("resolves a repository path containing spaces without splitting", async () => {
    const base = await makeDir("spaced");
    const primary = path.join(base, "my repo name");
    await mkdir(primary, { recursive: true });
    const commonDir = path.join(primary, ".git");

    await useFakeGit({
      commonDir,
      isBare: "false",
      topLevel: primary,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 3333333333333333333333333333333333333333\nbranch refs/heads/main`,
      ]),
    });

    const context = await resolveRepositoryContext(primary);
    expect(context.primaryPath).toBe(primary);
    expect(context.primaryPath).toContain("my repo name");
    expect(context.worktrees[0]?.path).toBe(primary);
  });
});

describe("resolveRepositoryContext — platform boundary (AC-03.3)", () => {
  it("proceeds on a simulated Linux host (unverified is still allowed)", async () => {
    const primary = await makeDir("linux-primary");
    await useFakeGit({
      commonDir: path.join(primary, ".git"),
      isBare: "false",
      topLevel: primary,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 4444444444444444444444444444444444444444\nbranch refs/heads/main`,
      ]),
    });

    const context = await resolveRepositoryContext(primary, {
      platform: "linux",
    });
    expect(context.primaryPath).toBe(primary);
  });

  it("rejects a Windows host deterministically before any discovery or write", async () => {
    const cwd = await makeDir("win-cwd");
    // No fake git configured: an unsupported platform must fail before any Git
    // call — deterministically, and without writing to the invocation dir.
    await useFakeGit({
      failOn: ["--git-common-dir"],
      failStderr: "unreachable",
    });

    const error = await catchWtwError(
      resolveRepositoryContext(cwd, { platform: "win32" }),
    );
    expect(error.code).toBe("unsupported_platform");
    expect(await readdir(cwd)).toHaveLength(0);
  });
});

describe("resolveRepositoryContext — unsupported shapes fail without writes (AC-03.3/AC-03.4)", () => {
  it("reports a bare repository (non_bare conjunct) without writes", async () => {
    const cwd = await makeDir("bare-cwd");
    const primary = await makeDir("bare-primary");
    await useFakeGit({
      commonDir: path.join(primary, ".git"),
      isBare: "true",
      topLevel: primary,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 5555555555555555555555555555555555555555\nbranch refs/heads/main`,
      ]),
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("unsupported_repository");
    expect(error.details?.conjunct).toBe("non_bare");
    expect(await readdir(cwd)).toHaveLength(0);
  });

  it("reports a missing-primary context (primary_record_present) without writes", async () => {
    const cwd = await makeDir("nomain-cwd");
    const bareEntry = await makeDir("bare-entry");
    await useFakeGit({
      commonDir: path.join(bareEntry, ".git"),
      isBare: "false",
      topLevel: bareEntry,
      porcelain: porcelainBlock([`worktree ${bareEntry}\nbare`]),
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("unsupported_repository");
    expect(error.details?.conjunct).toBe("primary_record_present");
    expect(await readdir(cwd)).toHaveLength(0);
  });

  it("reports a prunable primary (primary_not_prunable) without writes", async () => {
    const cwd = await makeDir("prunable-cwd");
    const primary = await makeDir("prunable-primary");
    await useFakeGit({
      commonDir: path.join(primary, ".git"),
      isBare: "false",
      topLevel: primary,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 6666666666666666666666666666666666666666\nbranch refs/heads/main\nprunable gitdir file points to non-existent location`,
      ]),
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("unsupported_repository");
    expect(error.details?.conjunct).toBe("primary_not_prunable");
    expect(await readdir(cwd)).toHaveLength(0);
  });

  it("reports a missing primary directory (primary_path_exists) without writes", async () => {
    const cwd = await makeDir("gone-cwd");
    const missing = path.join(await makeDir("gone-parent"), "gone-primary");
    await useFakeGit({
      commonDir: path.join(missing, ".git"),
      isBare: "false",
      topLevel: missing,
      porcelain: porcelainBlock([
        `worktree ${missing}\nHEAD 7777777777777777777777777777777777777777\nbranch refs/heads/main`,
      ]),
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("unsupported_repository");
    expect(error.details?.conjunct).toBe("primary_path_exists");
    expect(await readdir(cwd)).toHaveLength(0);
  });

  it("reports a root that does not resolve to the primary (root_resolves_to_primary) without writes", async () => {
    const cwd = await makeDir("root-cwd");
    const primary = await makeDir("root-primary");
    const elsewhere = await makeDir("root-elsewhere");
    await useFakeGit({
      commonDir: path.join(primary, ".git"),
      isBare: "false",
      topLevel: elsewhere,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 8888888888888888888888888888888888888888\nbranch refs/heads/main`,
      ]),
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("unsupported_repository");
    expect(error.details?.conjunct).toBe("root_resolves_to_primary");
    expect(await readdir(cwd)).toHaveLength(0);
  });

  it("treats a non-repository directory as an ordinary command failure without writes", async () => {
    const cwd = await makeDir("nonrepo-cwd");
    await useFakeGit({
      failOn: ["--git-common-dir"],
      failStderr:
        "fatal: not a git repository (or any of the parent directories): .git",
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("git_command_failed");
    expect(await readdir(cwd)).toHaveLength(0);
  });
});

describe("resolveRepositoryContext — post-discovery failures (AC-03.4)", () => {
  it("surfaces a post-discovery permission failure as an ordinary command failure", async () => {
    const cwd = await makeDir("perm-cwd");
    const primary = await makeDir("perm-primary");
    // Discovery (common-dir, worktree list, is-bare) all succeed; the later
    // repository-root query fails — an ordinary command failure, not a
    // support-boundary verdict.
    await useFakeGit({
      commonDir: path.join(primary, ".git"),
      isBare: "false",
      topLevel: primary,
      porcelain: porcelainBlock([
        `worktree ${primary}\nHEAD 9999999999999999999999999999999999999999\nbranch refs/heads/main`,
      ]),
      failOn: ["--show-toplevel"],
      failStderr: "fatal: could not read directory: Permission denied",
    });

    const error = await catchWtwError(resolveRepositoryContext(cwd));
    expect(error.code).toBe("git_command_failed");
    expect(await readdir(cwd)).toHaveLength(0);
  });
});
