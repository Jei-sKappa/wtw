import { describe, expect, it } from "vitest";
import {
  checkIncludeEntries,
  parseIncludeEntries,
  REQUIRED_INCLUDE_ENTRIES,
  WORKTREEINCLUDE_SCAFFOLD,
} from "../../src/index";

// AC-07.2: checkIncludeEntries fails when either required control entry is
// absent and warns (never fails) for a user entry matching no ignored content.

const REQUIRED = REQUIRED_INCLUDE_ENTRIES;

describe("parseIncludeEntries", () => {
  it("drops blank lines and full-line comments, trims whitespace", () => {
    const text = "  .config/wt.toml \n\n# a comment\n.env\r\n";
    expect(parseIncludeEntries(text)).toEqual([".config/wt.toml", ".env"]);
  });

  it("treats an inline # as a literal path character", () => {
    expect(parseIncludeEntries("weird#name\n")).toEqual(["weird#name"]);
  });
});

describe("checkIncludeEntries", () => {
  it("returns no finding when both required entries and matching optionals are present", () => {
    const text = `${WORKTREEINCLUDE_SCAFFOLD}.env\n.secrets/\n`;
    const result = checkIncludeEntries(text, REQUIRED, [
      ".env",
      ".secrets/token",
    ]);
    expect(result.findings).toEqual([]);
  });

  it("fails when the .config/wt.toml control entry is absent", () => {
    const text = ".worktreeinclude\n";
    const result = checkIncludeEntries(text, REQUIRED, []);
    const missing = result.findings.filter(
      (f) => f.kind === "missing-required",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.severity).toBe("fail");
    expect(missing[0]?.entry).toBe(".config/wt.toml");
  });

  it("fails when the .worktreeinclude control entry is absent", () => {
    const text = ".config/wt.toml\n";
    const result = checkIncludeEntries(text, REQUIRED, []);
    const missing = result.findings.filter(
      (f) => f.kind === "missing-required",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.severity).toBe("fail");
    expect(missing[0]?.entry).toBe(".worktreeinclude");
  });

  it("fails for both required entries when both are absent", () => {
    const result = checkIncludeEntries("node_modules\n", REQUIRED, []);
    const fails = result.findings.filter((f) => f.severity === "fail");
    expect(fails.map((f) => f.entry)).toEqual([
      ".config/wt.toml",
      ".worktreeinclude",
    ]);
  });

  it("warns (never fails) for a user entry matching no ignored candidate", () => {
    const text = `${WORKTREEINCLUDE_SCAFFOLD}.env\n`;
    const result = checkIncludeEntries(text, REQUIRED, ["build/out.js"]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warn");
    expect(result.findings[0]?.kind).toBe("unmatched-entry");
    expect(result.findings[0]?.entry).toBe(".env");
  });

  it("does not warn when a directory entry matches a nested candidate", () => {
    const text = `${WORKTREEINCLUDE_SCAFFOLD}.secrets/\n`;
    const result = checkIncludeEntries(text, REQUIRED, [".secrets/token.txt"]);
    expect(result.findings).toEqual([]);
  });

  it("does not warn on a required entry even if it matches no candidate", () => {
    // Required entries are checked only for presence, never for a match.
    const result = checkIncludeEntries(WORKTREEINCLUDE_SCAFFOLD, REQUIRED, []);
    expect(result.findings).toEqual([]);
  });

  it("supports glob wildcards when matching candidates", () => {
    const text = `${WORKTREEINCLUDE_SCAFFOLD}*.log\n`;
    const matched = checkIncludeEntries(text, REQUIRED, ["error.log"]);
    expect(matched.findings).toEqual([]);
    const unmatched = checkIncludeEntries(text, REQUIRED, ["error.txt"]);
    expect(unmatched.findings).toHaveLength(1);
    expect(unmatched.findings[0]?.severity).toBe("warn");
  });
});
