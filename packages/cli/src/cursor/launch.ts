// Structured Cursor launch for `@wtw/cli`. Launching the editor is an effect, so
// it lives in the CLI package; `@wtw/core` stays pure. The invocation uses
// `execa` with an explicit argument array — never a shell string — so a
// workspace path containing spaces or other unusual characters survives verbatim
// (spec "Compatibility and safety constraints"). `cursor` is resolved through
// `PATH` by default; the `WTW_CURSOR_BIN` override lets tests and hermetic
// harness runs point the wrapper at a fake `cursor` executable without touching
// `PATH` — the same env-override seam `git.ts` uses via `WTW_GIT_BIN`.

import { WtwError } from "@wtw/core";
import { execa } from "execa";

/** Env var that overrides the `cursor` executable the launcher spawns. */
export const CURSOR_BIN_ENV = "WTW_CURSOR_BIN";

/**
 * Resolve the `cursor` executable to spawn: the `WTW_CURSOR_BIN` override when
 * set to a non-empty value, otherwise the bare name `cursor` resolved via
 * `PATH`.
 */
export function resolveCursorBinary(): string {
  const override = process.env[CURSOR_BIN_ENV];
  return override !== undefined && override.length > 0 ? override : "cursor";
}

/**
 * Launch Cursor on the single, exact, absolute `workspacePath`. Resolves once
 * the child process completes. A non-zero exit or a spawn failure surfaces as a
 * `cursor_launch_failed` `WtwError` carrying the launch error, so the caller can
 * propagate it and exit 1 while leaving the already-synchronized files in place.
 */
export async function launchCursor(workspacePath: string): Promise<void> {
  const binary = resolveCursorBinary();

  const result = await execa(binary, [workspacePath], {
    reject: false,
    stripFinalNewline: true,
  });

  if (result.failed || result.exitCode !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr.trim() : "";
    const spawnDetail =
      typeof result.exitCode === "number"
        ? ` (exit ${result.exitCode})`
        : `: ${result.shortMessage ?? "spawn failed"}`;
    const streamDetail = stderr.length > 0 ? `: ${stderr}` : "";
    throw new WtwError(
      "cursor_launch_failed",
      `Failed to launch Cursor for workspace ${workspacePath}${spawnDetail}${streamDetail}`,
      {
        workspacePath,
        exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
      },
    );
  }
}
