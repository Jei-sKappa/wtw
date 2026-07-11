import { describe, expect, it } from "vitest";
import { RESERVED_HOOKS, WT_TOML_SCAFFOLD } from "../../src/index";

// AC-06.1: the scaffold carries exactly the three reserved commands with their
// exact key names and command strings. Any drift in a key or command must fail.

describe("WT_TOML_SCAFFOLD", () => {
  it("is exactly the three reserved hook blocks verbatim", () => {
    expect(WT_TOML_SCAFFOLD).toBe(
      [
        "[pre-start]",
        'wtw-copy = "wt step copy-ignored --require-include"',
        "",
        "[post-start]",
        'wtw-sync = "wtw sync --open"',
        "",
        "[post-remove]",
        'wtw-sync = "wtw sync"',
        "",
      ].join("\n"),
    );
  });

  it("contains each reserved key/command pair verbatim", () => {
    expect(WT_TOML_SCAFFOLD).toContain(
      '[pre-start]\nwtw-copy = "wt step copy-ignored --require-include"',
    );
    expect(WT_TOML_SCAFFOLD).toContain(
      '[post-start]\nwtw-sync = "wtw sync --open"',
    );
    expect(WT_TOML_SCAFFOLD).toContain('[post-remove]\nwtw-sync = "wtw sync"');
  });

  it("pins the reserved-hook contract records", () => {
    expect(RESERVED_HOOKS).toEqual([
      {
        table: "pre-start",
        key: "wtw-copy",
        command: "wt step copy-ignored --require-include",
      },
      { table: "post-start", key: "wtw-sync", command: "wtw sync --open" },
      { table: "post-remove", key: "wtw-sync", command: "wtw sync" },
    ]);
  });
});
