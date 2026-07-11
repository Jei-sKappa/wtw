import { describe, expect, it } from "vitest";
import {
  applyFoldersEdit,
  computeManagedFolders,
  type FolderEntry,
  type ManagedWorktreeInput,
  minimalWorkspaceScaffold,
  type WorktreeRecord,
} from "../../src/index";

// Build a worktree record with sensible defaults so each test states only the
// fields it cares about.
function record(overrides: Partial<WorktreeRecord>): WorktreeRecord {
  return {
    path: "/repo",
    bare: false,
    detached: false,
    prunable: false,
    locked: false,
    primary: false,
    ...overrides,
  };
}

function input(record: WorktreeRecord, exists: boolean): ManagedWorktreeInput {
  return { record, exists };
}

describe("computeManagedFolders", () => {
  it("puts the primary first and sorts the rest by display name then path", () => {
    const primary = record({
      path: "/repo",
      branch: "refs/heads/main",
      primary: true,
    });
    const zebra = record({ path: "/repo/zebra", branch: "refs/heads/zebra" });
    const alphaA = record({ path: "/repo/a1", branch: "refs/heads/alpha" });
    const alphaB = record({ path: "/repo/a2", branch: "refs/heads/alpha" });

    // Supplied out of order to prove the comparator drives the result.
    const folders = computeManagedFolders([
      input(zebra, true),
      input(alphaB, true),
      input(primary, true),
      input(alphaA, true),
    ]);

    expect(folders).toEqual<FolderEntry[]>([
      { path: "/repo" },
      { name: "alpha", path: "/repo/a1" },
      { name: "alpha", path: "/repo/a2" },
      { name: "zebra", path: "/repo/zebra" },
    ]);
  });

  it("labels detached worktrees with detached@<short-sha>", () => {
    const primary = record({
      path: "/repo",
      branch: "refs/heads/main",
      primary: true,
    });
    const detached = record({
      path: "/repo/det",
      detached: true,
      head: "0123456789abcdef",
    });

    const folders = computeManagedFolders([
      input(primary, true),
      input(detached, true),
    ]);

    expect(folders).toEqual<FolderEntry[]>([
      { path: "/repo" },
      { name: "detached@0123456", path: "/repo/det" },
    ]);
  });

  it("excludes missing, prunable, and bare registrations", () => {
    const primary = record({
      path: "/repo",
      branch: "refs/heads/main",
      primary: true,
    });
    const missing = record({
      path: "/repo/gone",
      branch: "refs/heads/gone",
    });
    const prunable = record({
      path: "/repo/pruned",
      branch: "refs/heads/pruned",
      prunable: true,
    });
    const bare = record({ path: "/repo/bare.git", bare: true });
    const kept = record({ path: "/repo/kept", branch: "refs/heads/kept" });

    const folders = computeManagedFolders([
      input(primary, true),
      input(missing, false), // directory does not exist -> excluded
      input(prunable, true), // git reports prunable -> excluded
      input(bare, true), // bare entry -> excluded
      input(kept, true),
    ]);

    expect(folders).toEqual<FolderEntry[]>([
      { path: "/repo" },
      { name: "kept", path: "/repo/kept" },
    ]);
  });
});

describe("applyFoldersEdit", () => {
  const FOLDERS: FolderEntry[] = [
    { path: "/repo" },
    { name: "feature/x", path: "/repo/wt-x" },
  ];

  it("changes only folders, preserving a comment and an unrelated property", () => {
    const original = [
      "{",
      "  // a user comment to preserve",
      '  "settings": { "editor.tabSize": 4 },',
      '  "folders": [ { "path": "/stale" } ]',
      "}",
      "",
    ].join("\n");

    const result = applyFoldersEdit(original, FOLDERS);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Comment and the unrelated property survive byte-for-byte outside the span.
    expect(result.text).toContain("// a user comment to preserve");
    expect(result.text).toContain('"settings": { "editor.tabSize": 4 }');
    // Only the managed folders were rewritten.
    expect(result.text).not.toContain("/stale");
    expect(result.text).toContain('"path": "/repo/wt-x"');
    expect(result.text).toContain('"name": "feature/x"');
  });

  it("creates the folders property when it is absent", () => {
    const original = '{\n  "settings": {}\n}\n';
    const result = applyFoldersEdit(original, FOLDERS);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.text).toContain('"folders"');
    expect(result.text).toContain('"settings": {}');
  });

  it("returns a structured error and no output for invalid JSONC", () => {
    const result = applyFoldersEdit("{ not valid", FOLDERS);
    expect(result).toEqual({
      ok: false,
      reason: "invalid_jsonc",
      message: expect.stringContaining("Invalid JSONC"),
    });
    expect("text" in result).toBe(false);
  });

  it("returns a structured error and no output for a non-object top level", () => {
    const result = applyFoldersEdit("[1, 2, 3]", FOLDERS);
    expect(result).toEqual({
      ok: false,
      reason: "non_object_root",
      message: expect.any(String),
    });
    expect("text" in result).toBe(false);
  });

  it("is byte-stable when editing already-correct JSONC (idempotent)", () => {
    const original = [
      "{",
      "  // keep this",
      '  "settings": { "editor.tabSize": 4 },',
      '  "folders": [ { "path": "/stale" } ]',
      "}",
      "",
    ].join("\n");

    const first = applyFoldersEdit(original, FOLDERS);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = applyFoldersEdit(first.text, FOLDERS);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.text).toBe(first.text);
  });
});

describe("minimalWorkspaceScaffold", () => {
  const FOLDERS: FolderEntry[] = [
    { path: "/repo" },
    { name: "feature/x", path: "/repo/wt-x" },
  ];

  it("produces a minimal valid workspace with the current folders", () => {
    const scaffold = minimalWorkspaceScaffold(FOLDERS);
    const parsed = JSON.parse(scaffold) as { folders: FolderEntry[] };
    expect(parsed.folders).toEqual(FOLDERS);
  });

  it("is byte-stable when re-edited with the same folders", () => {
    const scaffold = minimalWorkspaceScaffold(FOLDERS);
    const reedited = applyFoldersEdit(scaffold, FOLDERS);
    expect(reedited.ok).toBe(true);
    if (!reedited.ok) {
      return;
    }
    expect(reedited.text).toBe(scaffold);
  });
});
