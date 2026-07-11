import { describe, expect, it } from "vitest";
import {
  findManagedBlock,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  reconcileExcludeBlock,
} from "../../src/index";

// The canonical private paths wtw manages inside `info/exclude` (spec's
// "Canonical local artifacts" section). Supplied intentionally out of order and
// with a duplicate to exercise dedup + deterministic ordering.
const MANAGED_PATHS = [
  ".worktreeinclude",
  "repo.code-workspace",
  ".config/wt.toml",
  ".config/wt.toml",
];

// The deduplicated, sorted order the transform must produce.
const SORTED_ENTRIES = [
  ".config/wt.toml",
  ".worktreeinclude",
  "repo.code-workspace",
];

function expectedBlock(): string {
  return [MANAGED_BLOCK_BEGIN, ...SORTED_ENTRIES, MANAGED_BLOCK_END].join("\n");
}

describe("reconcileExcludeBlock", () => {
  it("creates a block in empty text with exactly the canonical paths", () => {
    const result = reconcileExcludeBlock("", MANAGED_PATHS);
    expect(result).toBe(`${expectedBlock()}\n`);

    const scan = findManagedBlock(result);
    expect(scan.present).toBe(true);
    expect(scan.entries).toEqual(SORTED_ENTRIES);
  });

  it("appends a block after unrelated content, preserving those bytes", () => {
    const preamble = "*.log\nnode_modules/\n.env\n";
    const result = reconcileExcludeBlock(preamble, MANAGED_PATHS);
    expect(result).toBe(`${preamble}${expectedBlock()}\n`);
    expect(result.startsWith(preamble)).toBe(true);
  });

  it("inserts a separating newline when the preamble lacks a trailing one", () => {
    const preamble = "*.log\nnode_modules/";
    const result = reconcileExcludeBlock(preamble, MANAGED_PATHS);
    expect(result).toBe(`${preamble}\n${expectedBlock()}\n`);
  });

  it("reconciles an existing valid block idempotently without duplicating", () => {
    const before = "keep-me\n";
    const after = "trailing-line\n";
    const original = `${before}${expectedBlock()}\n${after}`;

    const result = reconcileExcludeBlock(original, MANAGED_PATHS);
    // Already canonical: byte-identical, no duplicate entries.
    expect(result).toBe(original);
    expect(findManagedBlock(result).entries).toEqual(SORTED_ENTRIES);
  });

  it("repairs a modified interior while preserving surrounding bytes", () => {
    const before = "*.log\n# user note\n";
    const after = "# tail comment\nbuild/\n";
    const tampered = `${before}${MANAGED_BLOCK_BEGIN}\nstale-entry\nSOMETHING-WRONG\n${MANAGED_BLOCK_END}\n${after}`;

    const result = reconcileExcludeBlock(tampered, MANAGED_PATHS);
    expect(result).toBe(`${before}${expectedBlock()}\n${after}`);
    // Surrounding content is byte-identical.
    expect(result.startsWith(before)).toBe(true);
    expect(result.endsWith(after)).toBe(true);
    expect(findManagedBlock(result).entries).toEqual(SORTED_ENTRIES);
  });

  it("is byte-stable when applied twice (idempotence)", () => {
    const original = "*.log\nnode_modules/\n";
    const once = reconcileExcludeBlock(original, MANAGED_PATHS);
    const twice = reconcileExcludeBlock(once, MANAGED_PATHS);
    expect(twice).toBe(once);
  });

  it("preserves the absence of a trailing newline when the block ends the file", () => {
    // A block whose end marker is the final line with no trailing newline.
    const original = `head\n${expectedBlock()}`;
    const result = reconcileExcludeBlock(original, MANAGED_PATHS);
    expect(result).toBe(original);
    expect(result.endsWith(MANAGED_BLOCK_END)).toBe(true);
  });
});

describe("reconcileExcludeBlock — malformed inputs never lose user bytes", () => {
  it("heals an unpaired begin marker in place, preserving following user lines", () => {
    // A hand-deleted end marker leaves a begin marker followed by user content.
    const preamble = "*.log\n";
    const userTail = "foo-user-line\nbar-user-line\n";
    const malformed = `${preamble}${MANAGED_BLOCK_BEGIN}\n${userTail}`;

    const result = reconcileExcludeBlock(malformed, MANAGED_PATHS);

    // Exactly one matched block, closed right after the orphan begin line.
    expect(result).toBe(`${preamble}${expectedBlock()}\n${userTail}`);
    // Exactly one begin and one end marker.
    expect(result.split(MANAGED_BLOCK_BEGIN).length - 1).toBe(1);
    expect(result.split(MANAGED_BLOCK_END).length - 1).toBe(1);
    // No user line is lost, ever.
    expect(result).toContain("foo-user-line");
    expect(result).toContain("bar-user-line");
    expect(result.startsWith(preamble)).toBe(true);
    expect(result.endsWith(userTail)).toBe(true);
  });

  it("is byte-stable when applied twice to an unpaired begin marker", () => {
    const malformed = `*.log\n${MANAGED_BLOCK_BEGIN}\nfoo-user-line\n`;
    const once = reconcileExcludeBlock(malformed, MANAGED_PATHS);
    const twice = reconcileExcludeBlock(once, MANAGED_PATHS);
    expect(twice).toBe(once);
    // The user line survives both applications.
    expect(twice).toContain("foo-user-line");
  });

  it("heals an unpaired begin marker that ends the file (no trailing newline)", () => {
    const malformed = `head\n${MANAGED_BLOCK_BEGIN}`;
    const once = reconcileExcludeBlock(malformed, MANAGED_PATHS);
    expect(once).toBe(`head\n${expectedBlock()}`);
    // Idempotent even without a trailing newline.
    const twice = reconcileExcludeBlock(once, MANAGED_PATHS);
    expect(twice).toBe(once);
  });

  it("does not treat an unpaired end marker as a block (appends, stays idempotent)", () => {
    // A lone end marker with no begin is not a wtw block; a fresh block appends.
    const malformed = `*.log\n${MANAGED_BLOCK_END}\ntail\n`;
    const once = reconcileExcludeBlock(malformed, MANAGED_PATHS);
    expect(once).toBe(`${malformed}${expectedBlock()}\n`);
    // The orphan end and user content are preserved, and reconcile is stable.
    expect(once).toContain(`${MANAGED_BLOCK_END}\ntail\n`);
    const twice = reconcileExcludeBlock(once, MANAGED_PATHS);
    expect(twice).toBe(once);
  });

  it("collapses doubled begin markers into a single matched block, stably", () => {
    // begin ... begin ... end: the first begin pairs with the end; the interior
    // (including the second begin) is rewritten. Result has one matched pair.
    const malformed = `${MANAGED_BLOCK_BEGIN}\n${MANAGED_BLOCK_BEGIN}\nx\n${MANAGED_BLOCK_END}\n`;
    const once = reconcileExcludeBlock(malformed, MANAGED_PATHS);
    expect(once.split(MANAGED_BLOCK_BEGIN).length - 1).toBe(1);
    expect(once.split(MANAGED_BLOCK_END).length - 1).toBe(1);
    const twice = reconcileExcludeBlock(once, MANAGED_PATHS);
    expect(twice).toBe(once);
  });
});

describe("findManagedBlock", () => {
  it("reports absent (not malformed) when no marker pair exists", () => {
    const scan = findManagedBlock("*.log\nnode_modules/\n");
    expect(scan.present).toBe(false);
    expect(scan.malformed).toBe(false);
    expect(scan.entries).toEqual([]);
  });

  it("reports malformed when only the begin marker is present", () => {
    const scan = findManagedBlock(`${MANAGED_BLOCK_BEGIN}\n.config/wt.toml\n`);
    expect(scan.present).toBe(false);
    expect(scan.malformed).toBe(true);
    expect(scan.entries).toEqual([]);
  });

  it("reports absent (not malformed) for a lone end marker", () => {
    const scan = findManagedBlock(`${MANAGED_BLOCK_END}\ntail\n`);
    expect(scan.present).toBe(false);
    expect(scan.malformed).toBe(false);
    expect(scan.entries).toEqual([]);
  });

  it("returns interior entries in file order", () => {
    const text = `${MANAGED_BLOCK_BEGIN}\nb\na\n${MANAGED_BLOCK_END}\n`;
    const scan = findManagedBlock(text);
    expect(scan.present).toBe(true);
    expect(scan.malformed).toBe(false);
    expect(scan.entries).toEqual(["b", "a"]);
  });
});
