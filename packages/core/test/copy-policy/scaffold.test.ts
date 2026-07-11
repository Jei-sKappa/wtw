import { describe, expect, it } from "vitest";
import {
  INCLUDE_GUIDANCE_COMMENT,
  REQUIRED_INCLUDE_ENTRIES,
  WORKTREEINCLUDE_SCAFFOLD,
} from "../../src/index";

// AC-07.1: a scaffolded `.worktreeinclude` contains the two required control
// paths and explanatory user-editing guidance, with no guessed private entries.

describe("WORKTREEINCLUDE_SCAFFOLD", () => {
  it("exposes exactly the two required control entries", () => {
    expect(REQUIRED_INCLUDE_ENTRIES).toEqual([
      ".config/wt.toml",
      ".worktreeinclude",
    ]);
  });

  it("contains both required control entries as whole lines", () => {
    const lines = WORKTREEINCLUDE_SCAFFOLD.split("\n");
    for (const entry of REQUIRED_INCLUDE_ENTRIES) {
      expect(lines).toContain(entry);
    }
  });

  it("contains the user-editing guidance line", () => {
    const lines = WORKTREEINCLUDE_SCAFFOLD.split("\n");
    expect(lines).toContain(INCLUDE_GUIDANCE_COMMENT);
    expect(INCLUDE_GUIDANCE_COMMENT).toBe(
      "# Add other ignored files and directories below.",
    );
  });

  it("matches the spec's scaffold verbatim and ends with a newline", () => {
    expect(WORKTREEINCLUDE_SCAFFOLD).toBe(
      ".config/wt.toml\n.worktreeinclude\n\n# Add other ignored files and directories below.\n",
    );
  });

  it("guesses no private-data entries (only control paths and a comment)", () => {
    const meaningful = WORKTREEINCLUDE_SCAFFOLD.split("\n").filter(
      (line) => line.trim() !== "" && !line.startsWith("#"),
    );
    expect(meaningful).toEqual([".config/wt.toml", ".worktreeinclude"]);
  });
});
