import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateLivingDocs } from "../scripts/generate-living-docs";
import {
  type Area,
  buildFileTree,
  caseEvidence,
  loadAreas,
  loadRenderCases,
  type RenderCase,
  renderDocument,
} from "../scripts/living-docs";
import { loadCases } from "./e2e/harness/case-manifest";
import { loadRequirements } from "./e2e/harness/requirements";
import { validateTraceability } from "./e2e/harness/traceability";

const packageRoot = path.resolve(import.meta.dirname, "..");
const docPath = path.join(packageRoot, "docs/BEHAVIOR.md");

function makeCase(overrides: Partial<RenderCase> = {}): RenderCase {
  return {
    id: "demo-case",
    title: "Demo case",
    description: "Demonstrates the demo behavior.",
    mode: "fast",
    evidence: { git: "real", worktrunk: "simulated", cursor: "simulated" },
    cwd: ".",
    command: ["check"],
    covers: ["WTW-FR-0001.AC-0001"],
    setupSteps: [],
    exitCode: 0,
    stdout: "ok\n",
    stdoutContains: [],
    stderr: "",
    inputFiles: [{ path: ".gitignore", content: "secret.env\n" }],
    outputFiles: [],
    fileContains: [],
    fileNotContains: [],
    ...overrides,
  };
}

function activeArea(): Area {
  return {
    title: "Demo",
    requirements: [
      {
        id: "WTW-FR-0001",
        title: "Demo renders",
        status: "active",
        description: "The demo renders output.",
        acceptance: [
          { id: "AC-0001", statement: "It renders.", verifiedBy: "case" },
        ],
      },
    ],
  };
}

describe("caseEvidence", () => {
  it("labels contract cases real Git + real Worktrunk + simulated Cursor", () => {
    expect(caseEvidence({ mode: "contract", env: {}, setup: [] })).toEqual({
      git: "real",
      worktrunk: "real",
      cursor: "simulated",
    });
  });

  it("labels scenario cases the same as contract cases", () => {
    expect(caseEvidence({ mode: "scenario", env: {}, setup: [] })).toEqual({
      git: "real",
      worktrunk: "real",
      cursor: "simulated",
    });
  });

  it("derives fast-mode evidence from fake-binary sentinels and git setup", () => {
    expect(
      caseEvidence({
        mode: "fast",
        env: {
          WTW_WT_BIN: "__FAKE_WT_BIN__",
          WTW_CURSOR_BIN: "__FAKE_CURSOR_BIN__",
        },
        setup: [{ run: { cmd: ["git", "init", "."] } }],
      }),
    ).toEqual({ git: "real", worktrunk: "simulated", cursor: "simulated" });
  });

  it("wires Git to real for a product-pipeline case with no git setup step", () => {
    // A `check`/`repo` case that stubs Worktrunk/Cursor drives the real product
    // pipeline against the real (unfaked) git binary, even with no git fixture.
    expect(
      caseEvidence({
        mode: "fast",
        env: {
          WTW_WT_BIN: "__FAKE_WT_BIN__",
          WTW_CURSOR_BIN: "__FAKE_CURSOR_BIN__",
        },
        setup: [],
      }),
    ).toEqual({ git: "real", worktrunk: "simulated", cursor: "simulated" });
  });

  it("labels a faked WTW_GIT_BIN as simulated Git", () => {
    expect(
      caseEvidence({
        mode: "fast",
        env: { WTW_GIT_BIN: "__FAKE_GIT_BIN__" },
        setup: [],
      }),
    ).toEqual({
      git: "simulated",
      worktrunk: "not-exercised",
      cursor: "not-exercised",
    });
  });

  it("marks a tool not exercised when neither faked nor invoked", () => {
    expect(caseEvidence({ mode: "fast", env: {}, setup: [] })).toEqual({
      git: "not-exercised",
      worktrunk: "not-exercised",
      cursor: "not-exercised",
    });
  });

  it("treats an omitted mode as fast", () => {
    expect(caseEvidence({ env: {}, setup: [] }).worktrunk).toBe(
      "not-exercised",
    );
  });
});

describe("renderDocument", () => {
  it("is deterministic: identical inputs yield byte-identical output", () => {
    const areas = [activeArea()];
    const cases = [makeCase()];
    expect(renderDocument(areas, cases)).toBe(renderDocument(areas, cases));
  });

  it("renders the per-case dependency mode and real/simulated evidence", () => {
    const doc = renderDocument(
      [activeArea()],
      [
        makeCase({
          mode: "contract",
          evidence: { git: "real", worktrunk: "real", cursor: "simulated" },
        }),
      ],
    );

    expect(doc).toContain("**Evidence** — dependency mode: external contract");
    expect(doc).toContain("- Git: Real");
    expect(doc).toContain("- Worktrunk: Real");
    expect(doc).toContain("- Cursor: Simulated");
  });

  it("labels a fast case's dependency mode and not-exercised tools", () => {
    const doc = renderDocument(
      [activeArea()],
      [
        makeCase({
          evidence: {
            git: "real",
            worktrunk: "not-exercised",
            cursor: "not-exercised",
          },
        }),
      ],
    );

    expect(doc).toContain("dependency mode: fast");
    expect(doc).toContain("- Worktrunk: Not exercised");
    expect(doc).toContain("- Cursor: Not exercised");
  });

  it("renders the acceptance table with coverage and an h4 case header", () => {
    const doc = renderDocument([activeArea()], [makeCase()]);

    expect(doc).toContain("### WTW-FR-0001 — Demo renders");
    expect(doc).toContain("| AC-0001 | It renders. | ✅ `demo-case` |");
    expect(doc).toContain("#### Case: Demo case");
    expect(doc).toContain("Covers: AC-0001");
    expect(doc).toContain("**Command**");
    expect(doc).toContain("$ wtw check");
    expect(doc).toContain("**CLI output** — exit 0");
    expect(doc).toContain(
      "<summary>Evidence, input, command & output</summary>",
    );
  });

  it("marks an active criterion with no covering case as uncovered", () => {
    const doc = renderDocument([activeArea()], []);
    expect(doc).toContain("| AC-0001 | It renders. | ❌ uncovered |");
  });

  it("badges deferred requirements and notes their coverage rationale", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "WTW-FR-0002",
              title: "Deferred behavior",
              status: "deferred",
              description: "Planned but not yet built.",
              acceptance: [
                {
                  id: "AC-0001",
                  statement: "It will render.",
                  verifiedBy: "case",
                },
              ],
              coverage: "Tracked for a later milestone.",
            },
          ],
        },
      ],
      [],
    );

    expect(doc).toContain("### WTW-FR-0002 — Deferred behavior _(deferred)_");
    expect(doc).toContain("> Deferred: Tracked for a later milestone.");
  });

  it("omits retired requirements and retired criteria entirely", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "WTW-FR-0003",
              title: "Retired behavior",
              status: "retired",
              description: "Gone.",
              acceptance: [
                { id: "AC-0001", statement: "Obsolete.", verifiedBy: "case" },
              ],
              retiredReason: "Superseded.",
            },
            {
              id: "WTW-FR-0004",
              title: "Partly trimmed",
              status: "active",
              description: "Has a retired criterion.",
              acceptance: [
                {
                  id: "AC-0001",
                  statement: "Still asserted.",
                  verifiedBy: "case",
                },
                {
                  id: "AC-0002",
                  statement: "No longer asserted.",
                  verifiedBy: "case",
                  status: "retired",
                  retiredReason: "Dropped.",
                },
              ],
            },
          ],
        },
      ],
      [makeCase({ covers: ["WTW-FR-0004.AC-0001"] })],
    );

    expect(doc).not.toContain("WTW-FR-0003");
    expect(doc).not.toContain("Retired behavior");
    expect(doc).toContain("| AC-0001 | Still asserted. |");
    expect(doc).not.toContain("No longer asserted.");
  });

  it("embeds the input tree, output files, and file constraints", () => {
    const doc = renderDocument(
      [activeArea()],
      [
        makeCase({
          command: ["sync"],
          setupSteps: ["Runs `git worktree add -b feature-a ../wt-a`"],
          outputFiles: [
            { path: "wt-a/.worktreeinclude", content: ".config/wt.toml\n" },
          ],
          fileContains: [
            { path: "repo/repo.code-workspace", substrings: ["feature-a"] },
          ],
        }),
      ],
    );

    expect(doc).toContain("**Local project** — ran from the project root");
    expect(doc).toContain("**Setup steps** — run before the command");
    expect(doc).toContain("1. Runs `git worktree add -b feature-a ../wt-a`");
    expect(doc).toContain("**Output files**");
    expect(doc).toContain("`wt-a/.worktreeinclude`");
    expect(doc).toContain("**Output file constraints**");
    expect(doc).toContain("- `repo/repo.code-workspace` contains `feature-a`");
  });

  it("states the workspace is empty when a case ships no fixture", () => {
    const doc = renderDocument([activeArea()], [makeCase({ inputFiles: [] })]);
    expect(doc).toContain("_Empty — no committed workspace files._");
  });

  it("renders required stdout substrings when no exact stream is asserted", () => {
    const doc = renderDocument(
      [activeArea()],
      [makeCase({ stdout: "", stdoutContains: ["Synchronized"] })],
    );

    expect(doc).toContain("Required stdout substrings");
    expect(doc).toContain("Synchronized");
    expect(doc).toContain("_No exact stdout or stderr asserted._");
  });
});

describe("buildFileTree", () => {
  it("renders nested paths as an ASCII tree rooted at ./", () => {
    expect(
      buildFileTree(["repo/.config/wt.toml", "repo/.worktreeinclude"]),
    ).toBe(
      [
        "./",
        "└─ repo/",
        "   ├─ .config/",
        "   │  └─ wt.toml",
        "   └─ .worktreeinclude",
      ].join("\n"),
    );
  });
});

describe("living document generation (integration)", () => {
  it("regenerates byte-identically from the real requirements and cases", async () => {
    const [areas, cases] = await Promise.all([
      loadAreas(packageRoot),
      loadRenderCases(packageRoot),
    ]);
    const rendered = renderDocument(areas, cases);
    const onDisk = await readFile(docPath, "utf8");
    expect(rendered).toBe(onDisk);
  });

  it("covers every active FR-02..FR-13 criterion (traceability holds)", async () => {
    const requirements = await loadRequirements(packageRoot);
    const cases = (await loadCases(packageRoot)).map((entry) => entry.manifest);
    expect(() => validateTraceability(requirements, cases)).not.toThrow();
  });

  it("--check fails on injected drift, writes nothing, and passes once reverted", async () => {
    // Exercise the exact `--check` code path in-process (the same function the
    // `docs:living:check` script runs) so the drift/writes-nothing contract is
    // proven without spawning a heavyweight subprocess.
    const original = await readFile(docPath, "utf8");
    try {
      const drifted = `${original}<!-- injected drift -->\n`;
      await writeFile(docPath, drifted, "utf8");

      await expect(
        generateLivingDocs({ root: packageRoot, check: true }),
      ).rejects.toThrow(/out of date/);
      // Writes nothing on drift: the on-disk (drifted) bytes are untouched.
      expect(await readFile(docPath, "utf8")).toBe(drifted);
    } finally {
      await writeFile(docPath, original, "utf8");
    }

    // Reverting to the generated bytes restores a passing check.
    await expect(
      generateLivingDocs({ root: packageRoot, check: true }),
    ).resolves.toMatchObject({ checked: true });
  });
});
