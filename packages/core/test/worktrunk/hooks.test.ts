import { describe, expect, it } from "vitest";
import { checkReservedHooks, WT_TOML_SCAFFOLD } from "../../src/index";

// AC-06.2 / AC-06.3: an all-hooks-present TOML is compatible (callers preserve it
// byte-for-byte); a missing or conflicting reserved hook yields the exact manual
// additions the user must make before rerunning `init`.

describe("checkReservedHooks", () => {
  it("reports the canonical scaffold compatible", () => {
    const result = checkReservedHooks(WT_TOML_SCAFFOLD);
    expect(result.compatible).toBe(true);
    expect(result.parseError).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.manualAdditions).toBe("");
  });

  it("is compatible when all reserved hooks are present alongside custom hooks, comments, and reordered tables", () => {
    const toml = [
      "# project worktrunk config",
      "[post-remove]",
      'wtw-sync = "wtw sync"',
      'cleanup = "rm -rf .cache"',
      "",
      "[post-start]",
      'wtw-sync = "wtw sync --open"',
      'notify = "say done"',
      "",
      "# copy step",
      "[pre-start]",
      'wtw-copy = "wt step copy-ignored --require-include"',
      "",
      "[aliases]",
      'co = "checkout"',
      "",
    ].join("\n");
    const result = checkReservedHooks(toml);
    expect(result.compatible).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.manualAdditions).toBe("");
  });

  it("returns the exact manual additions when a reserved hook is missing", () => {
    // Missing the entire [pre-start] table.
    const toml = [
      "[post-start]",
      'wtw-sync = "wtw sync --open"',
      "",
      "[post-remove]",
      'wtw-sync = "wtw sync"',
      "",
    ].join("\n");
    const result = checkReservedHooks(toml);
    expect(result.compatible).toBe(false);
    expect(result.parseError).toBe(false);
    expect(result.conflicts).toEqual([
      {
        table: "pre-start",
        key: "wtw-copy",
        kind: "missing",
        expectedCommand: "wt step copy-ignored --require-include",
        actualCommand: null,
      },
    ]);
    expect(result.manualAdditions).toBe(
      '[pre-start]\nwtw-copy = "wt step copy-ignored --require-include"\n',
    );
  });

  it("returns the exact manual additions when a reserved hook conflicts", () => {
    const toml = [
      "[pre-start]",
      'wtw-copy = "wt step copy-ignored --require-include"',
      "",
      "[post-start]",
      'wtw-sync = "wtw sync"', // wrong command: missing --open
      "",
      "[post-remove]",
      'wtw-sync = "wtw sync"',
      "",
    ].join("\n");
    const result = checkReservedHooks(toml);
    expect(result.compatible).toBe(false);
    expect(result.conflicts).toEqual([
      {
        table: "post-start",
        key: "wtw-sync",
        kind: "conflicting",
        expectedCommand: "wtw sync --open",
        actualCommand: "wtw sync",
      },
    ]);
    expect(result.manualAdditions).toBe(
      '[post-start]\nwtw-sync = "wtw sync --open"\n',
    );
  });

  it("flags all reserved hooks and reports a parse error on unparseable TOML", () => {
    const result = checkReservedHooks("this is = = not valid toml [[[");
    expect(result.compatible).toBe(false);
    expect(result.parseError).toBe(true);
    expect(result.conflicts.map((c) => c.kind)).toEqual([
      "missing",
      "missing",
      "missing",
    ]);
    expect(result.manualAdditions).toBe(WT_TOML_SCAFFOLD);
  });
});
