import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateLivingDocs } from "../scripts/generate-living-docs";
import {
  type Area,
  buildFileTree,
  caseEvidence,
  type RenderCase,
  renderDocument,
} from "../scripts/living-docs";
import type { Checkpoint } from "./e2e/harness/case-manifest";

function makeCase(overrides: Partial<RenderCase> = {}): RenderCase {
  return {
    id: "demo-case",
    title: "Demo case",
    description: "Demonstrates the demo behavior.",
    mode: "fast",
    evidence: { git: "real", worktrunk: "simulated", cursor: "simulated" },
    cwd: ".",
    command: ["check"],
    covers: "DEMO-FR-0001.AC-0001",
    checkpoints: [],
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

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: "hooks-fire",
    title: "Hooks fire at the documented moment",
    description: "The post-start hook runs after the worktree is ready.",
    covers: "DEMO-FR-0001.AC-0001",
    ...overrides,
  };
}

/** An area with one active FR carrying one `verifiedBy: case` AC. */
function activeArea(): Area {
  return {
    title: "Demo",
    requirements: [
      {
        id: "DEMO-FR-0001",
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

  it("renders each active AC once with its ref, verifiedBy label, and statement", () => {
    const doc = renderDocument([activeArea()], [makeCase()]);

    expect(doc).toContain("### DEMO-FR-0001 — Demo renders");
    expect(doc).toContain("#### DEMO-FR-0001.AC-0001 — verified by `case`");
    expect(doc).toContain("It renders.");
  });

  it("renders per-case dependency mode and real/simulated evidence", () => {
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

  it("renders a `case` AC's dedicated case evidence collapsible", () => {
    const doc = renderDocument([activeArea()], [makeCase()]);

    expect(doc).toContain("Proven by case `demo-case`");
    expect(doc).toContain("**Command**");
    expect(doc).toContain("$ wtw check");
    expect(doc).toContain("**CLI output** — exit 0");
    expect(doc).toContain(
      "<summary>Evidence, input, command & output</summary>",
    );
  });

  it("renders a `checkpoint` AC with its scenario identity and step", () => {
    const scenario = makeCase({
      id: "lifecycle-scenario",
      description: "Drives the full worktree lifecycle once.",
      mode: "scenario",
      evidence: { git: "real", worktrunk: "real", cursor: "simulated" },
      covers: undefined,
      checkpoints: [makeCheckpoint()],
    });
    const area: Area = {
      title: "Demo",
      requirements: [
        {
          id: "DEMO-FR-0001",
          title: "Demo renders",
          status: "active",
          description: "The demo renders output.",
          acceptance: [
            {
              id: "AC-0001",
              statement: "The hook fires.",
              verifiedBy: "checkpoint",
            },
          ],
        },
      ],
    };
    const doc = renderDocument([area], [scenario]);

    expect(doc).toContain(
      "#### DEMO-FR-0001.AC-0001 — verified by `checkpoint`",
    );
    expect(doc).toContain(
      "Proven by checkpoint `hooks-fire` of scenario `lifecycle-scenario`",
    );
    expect(doc).toContain(
      "**Scenario** — `lifecycle-scenario`: Drives the full worktree lifecycle once.",
    );
    expect(doc).toContain(
      "**Checkpoint `hooks-fire`** — Hooks fire at the documented moment",
    );
    expect(doc).toContain(
      "The post-start hook runs after the worktree is ready.",
    );
    // Dependency labeling is retained on checkpoint evidence.
    expect(doc).toContain("- Worktrunk: Real");
  });

  it("renders a `unit` AC as its named repo-relative test file", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "DEMO-FR-0001",
              title: "Boundary holds",
              status: "active",
              description: "The dependency boundary is enforced.",
              acceptance: [
                {
                  id: "AC-0001",
                  statement: "The pure package imports no effects.",
                  verifiedBy: "unit",
                  unitTest: "packages/core/test/dependency-boundary.test.ts",
                },
              ],
            },
          ],
        },
      ],
      [],
    );

    expect(doc).toContain("verified by `unit`");
    expect(doc).toContain(
      "Proven by unit test `packages/core/test/dependency-boundary.test.ts`.",
    );
  });

  it("renders a `manual` AC as its named checklist step", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "DEMO-FR-0001",
              title: "Cursor opens",
              status: "active",
              description: "A real Cursor opens and focuses the workspace.",
              acceptance: [
                {
                  id: "AC-0001",
                  statement: "The editor focuses the workspace.",
                  verifiedBy: "manual",
                  manualStep: "cursor-open",
                },
              ],
            },
          ],
        },
      ],
      [],
    );

    expect(doc).toContain("verified by `manual`");
    expect(doc).toContain(
      "Proven by manual checklist step `cursor-open` in `packages/cli/docs/RELEASE-CHECKLIST.md`.",
    );
  });

  it("notes a `case` AC with no covering case without inventing evidence", () => {
    const doc = renderDocument([activeArea()], []);
    expect(doc).toContain("_No covering case found._");
  });

  it("gives every active AC its own evidence body — no two ACs share one", () => {
    const area: Area = {
      title: "Demo",
      requirements: [
        {
          id: "DEMO-FR-0001",
          title: "Two behaviors",
          status: "active",
          description: "Two distinct behaviors.",
          acceptance: [
            { id: "AC-0001", statement: "First.", verifiedBy: "case" },
            { id: "AC-0002", statement: "Second.", verifiedBy: "case" },
          ],
        },
      ],
    };
    const doc = renderDocument(
      [area],
      [
        makeCase({ id: "case-a", covers: "DEMO-FR-0001.AC-0001" }),
        makeCase({ id: "case-b", covers: "DEMO-FR-0001.AC-0002" }),
      ],
    );

    // Each case's evidence body renders under exactly one AC section.
    expect((doc.match(/Proven by case `case-a`/g) ?? []).length).toBe(1);
    expect((doc.match(/Proven by case `case-b`/g) ?? []).length).toBe(1);
    // The two bodies live under different AC sections, in order.
    expect(doc.indexOf("DEMO-FR-0001.AC-0001")).toBeLessThan(
      doc.indexOf("Proven by case `case-a`"),
    );
    expect(doc.indexOf("Proven by case `case-a`")).toBeLessThan(
      doc.indexOf("DEMO-FR-0001.AC-0002"),
    );
  });

  it("throws rather than silently dedup when two cases cover one AC", () => {
    expect(() =>
      renderDocument(
        [activeArea()],
        [makeCase({ id: "case-a" }), makeCase({ id: "case-b" })],
      ),
    ).toThrow(/covered by more than one case/);
  });

  it("throws when two checkpoints cover one AC", () => {
    const scenario = makeCase({
      id: "lifecycle-scenario",
      mode: "scenario",
      covers: undefined,
      checkpoints: [
        makeCheckpoint({ id: "cp-a" }),
        makeCheckpoint({ id: "cp-b" }),
      ],
    });
    expect(() => renderDocument([activeArea()], [scenario])).toThrow(
      /covered by more than one checkpoint/,
    );
  });

  it("badges deferred requirements and notes their coverage rationale", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "DEMO-FR-0002",
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

    expect(doc).toContain("### DEMO-FR-0002 — Deferred behavior _(deferred)_");
    expect(doc).toContain("> Deferred: Tracked for a later milestone.");
  });

  it("renders a retired requirement as a tombstone with no evidence", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "DEMO-FR-0003",
              title: "Retired behavior",
              status: "retired",
              description: "Gone.",
              acceptance: [
                { id: "AC-0001", statement: "Obsolete.", verifiedBy: "case" },
              ],
              retiredReason: "Superseded by the new sync path.",
            },
          ],
        },
      ],
      [],
    );

    expect(doc).toContain("### DEMO-FR-0003 — Retired behavior _(retired)_");
    expect(doc).toContain("> Retired: Superseded by the new sync path.");
    // No description body and no evidence for a tombstone.
    expect(doc).not.toContain("Gone.");
    expect(doc).not.toContain("Obsolete.");
  });

  it("renders a retired AC as a tombstone within an active FR", () => {
    const doc = renderDocument(
      [
        {
          title: "Demo",
          requirements: [
            {
              id: "DEMO-FR-0004",
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
                  retiredReason: "Dropped in the rework.",
                },
              ],
            },
          ],
        },
      ],
      [makeCase({ covers: "DEMO-FR-0004.AC-0001" })],
    );

    expect(doc).toContain("#### DEMO-FR-0004.AC-0001 — verified by `case`");
    expect(doc).toContain("#### DEMO-FR-0004.AC-0002 — retired");
    expect(doc).toContain("> Retired: Dropped in the rework.");
    // The retired AC shows no evidence block.
    expect(doc).not.toContain("_No covering case found._");
  });

  it("counts requirements, criteria, cases, and checkpoints", () => {
    const scenario = makeCase({
      id: "lifecycle-scenario",
      mode: "scenario",
      covers: undefined,
      checkpoints: [makeCheckpoint({ covers: "DEMO-FR-0002.AC-0001" })],
    });
    const area: Area = {
      title: "Demo",
      requirements: [
        activeArea().requirements[0] as Area["requirements"][number],
        {
          id: "DEMO-FR-0002",
          title: "Checkpoint behavior",
          status: "active",
          description: "Proven by a checkpoint.",
          acceptance: [
            { id: "AC-0001", statement: "It fires.", verifiedBy: "checkpoint" },
          ],
        },
      ],
    };
    const doc = renderDocument([area], [makeCase(), scenario]);

    expect(doc).toContain(
      "**2** requirements · **2** acceptance criteria · **2** end-to-end cases · **1** scenario checkpoints.",
    );
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

describe("generateLivingDocs (drift-check mechanism)", () => {
  const MANIFEST = `- id: DEMO-FR-0001
  title: Demo requirement
  status: active
  description: The demo behavior.
  acceptance:
    - id: AC-0001
      statement: it prints ok on standard output and exits zero.
      verifiedBy: case
`;
  const CASE = `id: demo-check
covers: DEMO-FR-0001.AC-0001
title: Demo check
description: Runs check and prints ok.
command:
  - check
expect:
  exitCode: 0
  stdout: "ok\\n"
  stderr: ""
`;

  async function scaffoldRoot(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "wtw-living-"));
    await mkdir(path.join(root, "requirements/functional"), {
      recursive: true,
    });
    await mkdir(path.join(root, "test/e2e/cases/demo-check"), {
      recursive: true,
    });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(
      path.join(root, "requirements/functional/01-demo.yml"),
      MANIFEST,
      "utf8",
    );
    await writeFile(
      path.join(root, "test/e2e/cases/demo-check/case.yml"),
      CASE,
      "utf8",
    );
    await writeFile(
      path.join(root, "docs/RELEASE-CHECKLIST.md"),
      "# Manual release checklist\n",
      "utf8",
    );
    return root;
  }

  it("writes, then --check passes; a byte edit fails and writes nothing", async () => {
    // Exercise the exact `--check` byte-comparison path (the same function the
    // `docs:living:check` script runs) against a synthetic package root, so the
    // drift/writes-nothing contract is proven without touching the (red-window)
    // real tree.
    const root = await scaffoldRoot();
    const docFile = path.join(root, "docs/BEHAVIOR.md");
    try {
      const wrote = await generateLivingDocs({ root, check: false });
      expect(wrote.checked).toBe(false);

      await expect(
        generateLivingDocs({ root, check: true }),
      ).resolves.toMatchObject({ checked: true });

      const generated = await readFile(docFile, "utf8");
      const drifted = `${generated}<!-- injected drift -->\n`;
      await writeFile(docFile, drifted, "utf8");

      await expect(generateLivingDocs({ root, check: true })).rejects.toThrow(
        /out of date/,
      );
      // Writes nothing on drift: the on-disk (drifted) bytes are untouched.
      expect(await readFile(docFile, "utf8")).toBe(drifted);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
