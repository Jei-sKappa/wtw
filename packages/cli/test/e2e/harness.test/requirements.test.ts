import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadRequirements,
  type RawRequirement,
  validateRequirements,
} from "../harness/requirements";

const source = { filePath: "requirements/functional/02-cli-surface.yml" };

const validRequirement: RawRequirement = {
  id: "CLI-FR-0001",
  title: "CLI surface and error envelope",
  status: "active",
  description: "Defines the public command surface and error envelope.",
  acceptance: [
    {
      id: "AC-0001",
      statement: "Help paths exit with code 0.",
      verifiedBy: "case",
    },
    {
      id: "AC-0002",
      statement: "Excluded commands exit with code 1.",
      verifiedBy: "checkpoint",
    },
  ],
};

/** A requirement with an acceptance criterion of the given shape merged in. */
function withAcceptance(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...validRequirement,
    acceptance: [
      {
        id: "AC-0001",
        statement: "Help paths exit with code 0.",
        verifiedBy: "case",
      },
      { id: "AC-0002", statement: "A second criterion.", ...overrides },
    ],
  };
}

describe("validateRequirements", () => {
  it("accepts a valid manifest carrying all four verifiedBy kinds", () => {
    const allKinds: RawRequirement = {
      id: "CLI-FR-0002",
      title: "Evidence kinds",
      status: "active",
      description: "Exercises every evidence kind.",
      acceptance: [
        {
          id: "AC-0001",
          statement: "A declarative outcome holds.",
          verifiedBy: "case",
        },
        {
          id: "AC-0002",
          statement: "A scenario step is asserted.",
          verifiedBy: "checkpoint",
        },
        {
          id: "AC-0003",
          statement: "An architecture invariant holds.",
          verifiedBy: "unit",
          unitTest: "packages/core/test/dependency-boundary.test.ts",
        },
        {
          id: "AC-0004",
          statement: "A real editor opens on the workspace.",
          verifiedBy: "manual",
          manualStep: "open-cursor-workspace",
        },
      ],
    };
    expect(validateRequirements([allKinds], source)).toEqual([allKinds]);
  });

  it("rejects unknown requirement and acceptance fields", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, owner: "docs" }], source),
    ).toThrow(/unknown requirement field owner/);

    expect(() =>
      validateRequirements(
        [withAcceptance({ verifiedBy: "case", testCase: "help-root" })],
        source,
      ),
    ).toThrow(/unknown acceptance field testCase/);
  });

  it("rejects malformed requirement ids", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, id: "FR-CLI-02" }], source),
    ).toThrow(/invalid requirement id FR-CLI-02/);
  });

  it("rejects duplicate requirement ids", () => {
    expect(() =>
      validateRequirements([validRequirement, validRequirement], source),
    ).toThrow(/duplicate requirement id CLI-FR-0001/);
  });

  it("rejects invalid requirement statuses", () => {
    expect(() =>
      validateRequirements(
        [{ ...validRequirement, status: "done" as "active" }],
        source,
      ),
    ).toThrow(/invalid requirement status CLI-FR-0001: done/);
  });

  it("requires retired requirements to explain retirement", () => {
    expect(() =>
      validateRequirements(
        [{ ...validRequirement, status: "retired" }],
        source,
      ),
    ).toThrow(/retired requirement requires retiredReason/);
  });

  it("requires deferred requirements to explain coverage", () => {
    expect(() =>
      validateRequirements(
        [{ ...validRequirement, status: "deferred" }],
        source,
      ),
    ).toThrow(/deferred requirement requires coverage/);
  });

  it("rejects a notes field carrying task references", () => {
    expect(() =>
      validateRequirements(
        [{ ...validRequirement, notes: "Deferred to Task 3." }],
        source,
      ),
    ).toThrow(/notes must not carry task references/);
  });

  it("rejects an unknown caseMode", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, caseMode: "fast" }], source),
    ).toThrow(/invalid caseMode CLI-FR-0001: fast/);
  });

  it("accepts the contract caseMode", () => {
    const [requirement] = validateRequirements(
      [{ ...validRequirement, caseMode: "contract" }],
      source,
    );
    expect(requirement?.caseMode).toBe("contract");
  });

  it("rejects invalid and duplicate acceptance criterion ids", () => {
    expect(() =>
      validateRequirements(
        [withAcceptance({ id: "AC-2", verifiedBy: "case" })],
        {
          filePath: source.filePath,
        },
      ),
    ).toThrow(/invalid acceptance criterion id CLI-FR-0001.AC-2/);

    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              { id: "AC-0001", statement: "One.", verifiedBy: "case" },
              { id: "AC-0001", statement: "Two.", verifiedBy: "case" },
            ],
          },
        ],
        source,
      ),
    ).toThrow(/duplicate acceptance criterion id CLI-FR-0001.AC-0001/);
  });

  it("rejects a missing verifiedBy", () => {
    expect(() => validateRequirements([withAcceptance({})], source)).toThrow(
      /verifiedBy must be a non-empty string/,
    );
  });

  it("rejects an unknown verifiedBy value", () => {
    expect(() =>
      validateRequirements([withAcceptance({ verifiedBy: "smoke" })], source),
    ).toThrow(/invalid verifiedBy CLI-FR-0001.AC-0002: smoke/);
  });

  it.each([
    "FR-",
    "AC-",
    "(spec",
  ])("rejects a statement containing the banned substring %s", (substring) => {
    expect(() =>
      validateRequirements(
        [
          withAcceptance({
            statement: `A guarantee about ${substring}0001 holds.`,
            verifiedBy: "case",
          }),
        ],
        source,
      ),
    ).toThrow(
      new RegExp(
        `must not contain the substring ${substring.replace("(", "\\(")}`,
      ),
    );
  });

  it("requires unitTest on a unit criterion", () => {
    expect(() =>
      validateRequirements([withAcceptance({ verifiedBy: "unit" })], source),
    ).toThrow(/verifiedBy unit requires unitTest/);
  });

  it("forbids unitTest on a non-unit criterion", () => {
    expect(() =>
      validateRequirements(
        [
          withAcceptance({
            verifiedBy: "case",
            unitTest: "packages/core/test/x.test.ts",
          }),
        ],
        source,
      ),
    ).toThrow(/unitTest is only allowed when verifiedBy is unit/);
  });

  it("rejects an unsafe unitTest path", () => {
    expect(() =>
      validateRequirements(
        [withAcceptance({ verifiedBy: "unit", unitTest: "../escape.test.ts" })],
        source,
      ),
    ).toThrow(/unitTest must not contain \.\. path segments/);
  });

  it("requires manualStep on a manual criterion", () => {
    expect(() =>
      validateRequirements([withAcceptance({ verifiedBy: "manual" })], source),
    ).toThrow(/verifiedBy manual requires manualStep/);
  });

  it("forbids manualStep on a non-manual criterion", () => {
    expect(() =>
      validateRequirements(
        [withAcceptance({ verifiedBy: "case", manualStep: "open-cursor" })],
        source,
      ),
    ).toThrow(/manualStep is only allowed when verifiedBy is manual/);
  });

  it("rejects a malformed manualStep", () => {
    expect(() =>
      validateRequirements(
        [withAcceptance({ verifiedBy: "manual", manualStep: "Open Cursor" })],
        source,
      ),
    ).toThrow(/invalid manualStep CLI-FR-0001.AC-0002: Open Cursor/);
  });

  it("requires retired acceptance criteria to explain retirement", () => {
    expect(() =>
      validateRequirements(
        [withAcceptance({ verifiedBy: "case", status: "retired" })],
        source,
      ),
    ).toThrow(/retired acceptance criterion requires retiredReason/);
  });

  it("keeps a retired acceptance criterion and its id, and still rejects id re-use", () => {
    const retired: RawRequirement = {
      ...validRequirement,
      acceptance: [
        { id: "AC-0001", statement: "Active outcome.", verifiedBy: "case" },
        {
          id: "AC-0002",
          statement: "Withdrawn outcome.",
          verifiedBy: "case",
          status: "retired",
          retiredReason: "Superseded by a narrower criterion.",
        },
      ],
    };
    const [requirement] = validateRequirements([retired], source);
    expect(requirement?.acceptance[1]).toEqual({
      id: "AC-0002",
      statement: "Withdrawn outcome.",
      verifiedBy: "case",
      status: "retired",
      retiredReason: "Superseded by a narrower criterion.",
    });

    expect(() =>
      validateRequirements(
        [
          {
            ...retired,
            acceptance: [
              ...retired.acceptance,
              { id: "AC-0002", statement: "Reused id.", verifiedBy: "case" },
            ],
          },
        ],
        source,
      ),
    ).toThrow(/duplicate acceptance criterion id CLI-FR-0001.AC-0002/);
  });
});

const yamlRequirement = (id: string, prefix?: string): string =>
  [
    `- id: ${id}`,
    `  title: ${prefix ?? "Requirement"} ${id}`,
    "  status: active",
    "  description: A narrow behavior theme.",
    "  acceptance:",
    "    - id: AC-0001",
    "      statement: Exits with code 0.",
    "      verifiedBy: case",
    "",
  ].join("\n");

async function withTempRequirements(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "wtw-requirements-"));
  const dir = path.join(tempRoot, "requirements/functional");
  try {
    await mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(dir, name), content);
    }
    await run(tempRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

describe("loadRequirements", () => {
  it("loads split functional requirement files in path order", async () => {
    await withTempRequirements(
      {
        "15-version.yml": yamlRequirement("VER-FR-0001"),
        "02-cli-surface.yml": yamlRequirement("CLI-FR-0001"),
      },
      async (root) => {
        const requirements = await loadRequirements(root);
        expect(requirements.map((entry) => entry.id)).toEqual([
          "CLI-FR-0001",
          "VER-FR-0001",
        ]);
      },
    );
  });

  it("rejects a file mixing two domain prefixes", async () => {
    await withTempRequirements(
      {
        "02-cli-surface.yml": `${yamlRequirement("CLI-FR-0001")}${yamlRequirement("VER-FR-0001")}`,
      },
      async (root) => {
        await expect(loadRequirements(root)).rejects.toThrow(
          /file mixes domain prefixes CLI and VER/,
        );
      },
    );
  });

  it("rejects two files sharing a domain prefix", async () => {
    await withTempRequirements(
      {
        "02-cli-surface.yml": yamlRequirement("CLI-FR-0001"),
        "03-cli-extra.yml": yamlRequirement("CLI-FR-0002"),
      },
      async (root) => {
        await expect(loadRequirements(root)).rejects.toThrow(
          /domain prefix CLI already used by/,
        );
      },
    );
  });
});
