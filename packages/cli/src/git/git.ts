// Structured Git subprocess wrappers for `@wtw/cli`. Every Git invocation here
// uses `execa` with an explicit argument array — never a shell string — so
// repository and worktree paths containing spaces or other unusual characters
// survive verbatim (spec "Compatibility and safety constraints"). Git is
// resolved through `PATH` by default; an optional `WTW_GIT_BIN` override lets
// tests and hermetic harness runs point the wrapper at a fake `git` executable
// without touching `PATH`. Tasks 10/11 reuse the same env-override seam for the
// `wt` and `cursor` executables via `WTW_WT_BIN` / `WTW_CURSOR_BIN`.

import { WtwError } from "@wtw/core";
import { execa } from "execa";

/** Env var that overrides the `git` executable the wrapper spawns. */
export const GIT_BIN_ENV = "WTW_GIT_BIN";

/**
 * Resolve the `git` executable to spawn: the `WTW_GIT_BIN` override when set to
 * a non-empty value, otherwise the bare name `git` resolved through `PATH`.
 */
export function resolveGitBinary(): string {
  const override = process.env[GIT_BIN_ENV];
  return override !== undefined && override.length > 0 ? override : "git";
}

/**
 * Run `git <args>` from `cwd`, capturing stdout. A non-zero exit or a spawn
 * failure surfaces as a `git_command_failed` `WtwError` — an ordinary command
 * failure, not a support-boundary verdict. The returned stdout has its single
 * trailing newline stripped so callers can compare plain path/flag output.
 */
async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execa(resolveGitBinary(), [...args], {
    cwd,
    reject: false,
    stripFinalNewline: true,
  });

  if (result.failed || result.exitCode !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr.trim() : "";
    const detail = stderr.length > 0 ? `: ${stderr}` : "";
    throw new WtwError(
      "git_command_failed",
      `git ${args.join(" ")} failed (exit ${result.exitCode ?? "unknown"})${detail}`,
      {
        command: `git ${args.join(" ")}`,
        cwd,
        exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
      },
    );
  }

  return typeof result.stdout === "string" ? result.stdout : "";
}

/**
 * Run `git worktree list --porcelain` from `cwd` and return the raw porcelain
 * block text for `parseWorktreePorcelain` to consume.
 */
export function worktreeListPorcelain(cwd: string): Promise<string> {
  return runGit(cwd, ["worktree", "list", "--porcelain"]);
}

/**
 * Run `git rev-parse <args>` from `cwd`, returning the trimmed stdout. Used for
 * `--git-common-dir`, `--is-bare-repository`, and `--show-toplevel`.
 */
export function revParse(cwd: string, ...args: string[]): Promise<string> {
  return runGit(cwd, ["rev-parse", ...args]);
}

/**
 * Resolve the worktree root (`git rev-parse --show-toplevel`) as seen from a
 * given path. Run from the primary path, this yields the repository-root
 * discovery the support predicate's final conjunct compares against.
 */
export function worktreeRoot(cwd: string): Promise<string> {
  return revParse(cwd, "--show-toplevel");
}
