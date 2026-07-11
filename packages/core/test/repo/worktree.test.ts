import { describe, expect, it } from "vitest";
import {
  compareWorktreesForWorkspace,
  isSupportedPrimary,
  normalizeWorktreePath,
  type PrimarySupportInput,
  parseWorktreePorcelain,
  type RepositoryContext,
  type WorktreeRecord,
  worktreeDisplayName,
} from "../../src/index";

// A multi-record porcelain sample covering: a primary/main worktree, a linked
// worktree whose path contains spaces, a detached worktree, and a prunable +
// locked worktree.
const PORCELAIN_SAMPLE = [
  "worktree /Users/me/proj",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree /Users/me/My Worktrees/feature x",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/feature/x",
  "",
  "worktree /Users/me/detached one",
  "HEAD 3333333333333333333333333333333333333333",
  "detached",
  "",
  "worktree /Users/me/gone",
  "HEAD 4444444444444444444444444444444444444444",
  "branch refs/heads/gone",
  "locked on removable media",
  "prunable gitdir file points to non-existent location",
  "",
].join("\n");

function makeRecord(overrides: Partial<WorktreeRecord> = {}): WorktreeRecord {
  return {
    path: "/Users/me/proj",
    branch: "refs/heads/main",
    head: "1111111111111111111111111111111111111111",
    bare: false,
    detached: false,
    prunable: false,
    locked: false,
    primary: false,
    ...overrides,
  };
}

function supportedInput(
  overrides: Partial<PrimarySupportInput> = {},
): PrimarySupportInput {
  const primary = makeRecord({ primary: true });
  const context: RepositoryContext = {
    primaryPath: "/Users/me/proj",
    gitCommonDir: "/Users/me/proj/.git",
    worktrees: [primary],
  };
  return {
    context,
    isBareRepository: false,
    primaryPathExists: true,
    resolvedRootPath: "/Users/me/proj",
    ...overrides,
  };
}

describe("parseWorktreePorcelain", () => {
  const records = parseWorktreePorcelain(PORCELAIN_SAMPLE);

  it("parses every record in the block-format sample", () => {
    expect(records).toHaveLength(4);
  });

  it("marks only the first non-bare record as primary", () => {
    expect(records[0]?.primary).toBe(true);
    expect(records.slice(1).every((r) => r.primary === false)).toBe(true);
    expect(records[0]?.branch).toBe("refs/heads/main");
  });

  it("preserves a path containing spaces without shell-splitting", () => {
    expect(records[1]?.path).toBe("/Users/me/My Worktrees/feature x");
    expect(records[1]?.branch).toBe("refs/heads/feature/x");
  });

  it("captures a detached worktree with no branch", () => {
    expect(records[2]?.detached).toBe(true);
    expect(records[2]?.branch).toBeUndefined();
    expect(records[2]?.head).toBe("3333333333333333333333333333333333333333");
  });

  it("captures prunable and locked flags with trailing reasons", () => {
    expect(records[3]?.prunable).toBe(true);
    expect(records[3]?.locked).toBe(true);
  });

  it("normalizes duplicate and trailing separators in paths", () => {
    const parsed = parseWorktreePorcelain(
      "worktree /Users/me//proj/\nbranch refs/heads/main\n",
    );
    expect(parsed[0]?.path).toBe("/Users/me/proj");
  });

  it("recognizes a bare repository entry with no primary", () => {
    const parsed = parseWorktreePorcelain(
      "worktree /Users/me/bare.git\nbare\n",
    );
    expect(parsed[0]?.bare).toBe(true);
    expect(parsed[0]?.primary).toBe(false);
  });
});

describe("worktreeDisplayName", () => {
  it("uses the full branch name with the refs/heads/ prefix stripped", () => {
    expect(worktreeDisplayName(makeRecord({ branch: "refs/heads/main" }))).toBe(
      "main",
    );
    expect(
      worktreeDisplayName(makeRecord({ branch: "refs/heads/feature/x" })),
    ).toBe("feature/x");
  });

  it("labels a detached worktree as detached@<short-sha>", () => {
    const label = worktreeDisplayName(
      makeRecord({
        detached: true,
        branch: undefined,
        head: "3333333333333333333333333333333333333333",
      }),
    );
    expect(label).toBe("detached@3333333");
  });
});

describe("compareWorktreesForWorkspace", () => {
  it("forces the primary first, then sorts by display name and path", () => {
    const records = parseWorktreePorcelain(PORCELAIN_SAMPLE).filter(
      (r) => !r.prunable,
    );
    const sorted = [...records].sort(compareWorktreesForWorkspace);
    expect(sorted.map(worktreeDisplayName)).toEqual([
      "main",
      "detached@3333333",
      "feature/x",
    ]);
  });

  it("keeps the primary first even when its display name sorts late", () => {
    const primary = makeRecord({
      primary: true,
      path: "/Users/me/proj",
      branch: "refs/heads/zzz-late",
    });
    const linked = makeRecord({
      path: "/Users/me/aaa",
      branch: "refs/heads/aaa",
    });
    const sorted = [linked, primary].sort(compareWorktreesForWorkspace);
    expect(sorted[0]).toBe(primary);
  });

  it("breaks display-name ties by normalized absolute path", () => {
    const a = makeRecord({ path: "/Users/me/b", branch: "refs/heads/same" });
    const b = makeRecord({ path: "/Users/me/a", branch: "refs/heads/same" });
    const sorted = [a, b].sort(compareWorktreesForWorkspace);
    expect(sorted.map((r) => r.path)).toEqual(["/Users/me/a", "/Users/me/b"]);
  });
});

describe("isSupportedPrimary", () => {
  it("reports supported when all five conjuncts hold", () => {
    const result = isSupportedPrimary(supportedInput());
    expect(result.supported).toBe(true);
    expect(result.failedConjunct).toBeUndefined();
  });

  it("tolerates a trailing separator in the resolved root path", () => {
    const result = isSupportedPrimary(
      supportedInput({ resolvedRootPath: "/Users/me/proj/" }),
    );
    expect(result.supported).toBe(true);
  });

  it("fails the non_bare conjunct for a bare repository", () => {
    const result = isSupportedPrimary(
      supportedInput({ isBareRepository: true }),
    );
    expect(result.supported).toBe(false);
    expect(result.failedConjunct).toBe("non_bare");
  });

  it("fails when no main/primary record exists", () => {
    const context: RepositoryContext = {
      primaryPath: "/Users/me/proj",
      gitCommonDir: "/Users/me/proj/.git",
      worktrees: parseWorktreePorcelain("worktree /Users/me/bare.git\nbare\n"),
    };
    const result = isSupportedPrimary(supportedInput({ context }));
    expect(result.supported).toBe(false);
    expect(result.failedConjunct).toBe("primary_record_present");
  });

  it("fails when the primary record is prunable", () => {
    const context: RepositoryContext = {
      primaryPath: "/Users/me/proj",
      gitCommonDir: "/Users/me/proj/.git",
      worktrees: [makeRecord({ primary: true, prunable: true })],
    };
    const result = isSupportedPrimary(supportedInput({ context }));
    expect(result.supported).toBe(false);
    expect(result.failedConjunct).toBe("primary_not_prunable");
  });

  it("fails when the primary path does not exist as a directory", () => {
    const result = isSupportedPrimary(
      supportedInput({ primaryPathExists: false }),
    );
    expect(result.supported).toBe(false);
    expect(result.failedConjunct).toBe("primary_path_exists");
  });

  it("fails when root discovery resolves to a different path", () => {
    const result = isSupportedPrimary(
      supportedInput({ resolvedRootPath: "/Users/me/elsewhere" }),
    );
    expect(result.supported).toBe(false);
    expect(result.failedConjunct).toBe("root_resolves_to_primary");
  });
});

describe("normalizeWorktreePath", () => {
  it("collapses repeated slashes and strips trailing slashes", () => {
    expect(normalizeWorktreePath("/a//b/c/")).toBe("/a/b/c");
    expect(normalizeWorktreePath("/")).toBe("/");
  });
});
