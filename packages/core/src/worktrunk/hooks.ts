// Reserved-hook compatibility check for an existing `.config/wt.toml`.
//
// This module is part of `@wtw/core` and must stay effect-free: it parses the
// supplied TOML text and compares its reserved hooks against the fixed contract.
// It never reads or writes the filesystem and NEVER rewrites the input — callers
// preserve a compatible file byte-for-byte. On a missing or conflicting reserved
// hook it returns the exact manual TOML additions the user must make before
// rerunning `init` (spec's "`.config/wt.toml`" section; decision logs P7, P18).

import { parse } from "smol-toml";
import {
  RESERVED_HOOKS,
  type ReservedHook,
  renderReservedHooks,
} from "./scaffold";

/** Why a single reserved hook is not compatible. */
export type HookConflictKind = "missing" | "conflicting";

/** A reserved hook that is absent or carries a different command string. */
export interface HookConflict {
  /** The Worktrunk hook table (e.g. `pre-start`). */
  readonly table: string;
  /** The reserved hook key (e.g. `wtw-copy`). */
  readonly key: string;
  /** Whether the hook is entirely absent or present with a different command. */
  readonly kind: HookConflictKind;
  /** The exact command string the hook must carry. */
  readonly expectedCommand: string;
  /** The conflicting command string found, or `null` when the hook is missing. */
  readonly actualCommand: string | null;
}

/** Structured outcome of checking an existing TOML's reserved hooks. */
export interface HookCompatResult {
  /** Whether every reserved hook is present with its exact command string. */
  readonly compatible: boolean;
  /** Whether the supplied text failed to parse as TOML. */
  readonly parseError: boolean;
  /** Every reserved hook that is missing or conflicting, in contract order. */
  readonly conflicts: readonly HookConflict[];
  /**
   * The exact TOML additions the user must make (reserved-hook blocks for the
   * conflicting hooks only), or an empty string when compatible. This is a
   * suggestion for the preflight failure message — it does NOT rewrite the file.
   */
  readonly manualAdditions: string;
}

/** Read a `table.key` string value from parsed TOML, or `null` when absent/non-string. */
function readHookCommand(
  parsed: Record<string, unknown>,
  hook: ReservedHook,
): string | null {
  const table = parsed[hook.table];
  if (typeof table !== "object" || table === null) {
    return null;
  }
  const value = (table as Record<string, unknown>)[hook.key];
  return typeof value === "string" ? value : null;
}

/**
 * Check the supplied `.config/wt.toml` text for reserved-hook compatibility.
 *
 * Verifies the `wtw-copy` key in `[pre-start]` and the `wtw-sync` key in both
 * `[post-start]` and `[post-remove]` exist with exactly their contract command
 * strings. A file carrying all three (alongside any custom hooks, comments, or
 * ordering) is reported compatible so callers preserve it byte-for-byte. Any
 * missing or conflicting reserved hook yields a non-compatible result whose
 * `manualAdditions` carries the exact TOML the user must add. Unparseable text is
 * treated as fully non-compatible with all reserved hooks flagged missing.
 */
export function checkReservedHooks(tomlText: string): HookCompatResult {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = parse(tomlText) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const conflicts: HookConflict[] = [];
  for (const hook of RESERVED_HOOKS) {
    const actualCommand =
      parsed === null ? null : readHookCommand(parsed, hook);
    if (actualCommand === hook.command) {
      continue;
    }
    conflicts.push({
      table: hook.table,
      key: hook.key,
      kind: actualCommand === null ? "missing" : "conflicting",
      expectedCommand: hook.command,
      actualCommand,
    });
  }

  if (conflicts.length === 0) {
    return {
      compatible: true,
      parseError: false,
      conflicts: [],
      manualAdditions: "",
    };
  }

  const missingHooks = conflicts.map((conflict) => ({
    table: conflict.table,
    key: conflict.key,
    command: conflict.expectedCommand,
  }));

  return {
    compatible: false,
    parseError: parsed === null,
    conflicts,
    manualAdditions: `${renderReservedHooks(missingHooks)}\n`,
  };
}
