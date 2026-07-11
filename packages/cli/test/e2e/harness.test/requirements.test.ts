import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadRequirements,
  type RawRequirement,
  validateRequirements,
} from "../harness/requirements";

const validRequirement: RawRequirement = {
  id: "WTW-FR-0002",
  title: "CLI surface and error envelope",
  status: "active",
  description: "Defines the public command surface and error envelope.",
  acceptance: [
    { id: "AC-0201", statement: "Help paths exit 0." },
    { id: "AC-0202", statement: "Excluded commands exit 1." },
  ],
};

describe("validateRequirements", () => {
  it("accepts a valid active requirement with acceptance criteria", () => {
    expect(
      validateRequirements([validRequirement], {
        filePath: "requirements/functional/02-cli-surface.yml",
      }),
    ).toEqual([validRequirement]);
  });

  it("rejects unknown requirement and acceptance fields", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, owner: "docs" }], {
        filePath: "requirements/functional/02-cli-surface.yml",
      }),
    ).toThrow(/unknown requirement field owner/);

    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              {
                id: "AC-0201",
                statement: "Help paths exit 0.",
                testCase: "help-root",
              },
            ],
          },
        ],
        { filePath: "requirements/functional/02-cli-surface.yml" },
      ),
    ).toThrow(/unknown acceptance field testCase/);
  });

  it("rejects invalid requirement ids", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, id: "FR-CLI-02" }], {
        filePath: "requirements/functional/02-cli-surface.yml",
      }),
    ).toThrow(/invalid requirement id FR-CLI-02/);
  });

  it("rejects duplicate requirement ids", () => {
    expect(() =>
      validateRequirements([validRequirement, validRequirement], {
        filePath: "requirements/functional/02-cli-surface.yml",
      }),
    ).toThrow(/duplicate requirement id WTW-FR-0002/);
  });

  it("rejects invalid requirement statuses", () => {
    expect(() =>
      validateRequirements(
        [{ ...validRequirement, status: "done" as "active" }],
        { filePath: "requirements/functional/02-cli-surface.yml" },
      ),
    ).toThrow(/invalid requirement status WTW-FR-0002: done/);
  });

  it("requires removed requirements to explain removal", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, status: "removed" }], {
        filePath: "requirements/functional/02-cli-surface.yml",
      }),
    ).toThrow(/removed requirement requires removedReason/);
  });

  it("requires deferred requirements to explain coverage", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, status: "deferred" }], {
        filePath: "requirements/functional/02-cli-surface.yml",
      }),
    ).toThrow(/deferred requirement requires coverage/);
  });

  it("rejects invalid and duplicate acceptance criterion ids", () => {
    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [{ id: "AC-2", statement: "Bad id." }],
          },
        ],
        { filePath: "requirements/functional/02-cli-surface.yml" },
      ),
    ).toThrow(/invalid acceptance criterion id WTW-FR-0002.AC-2/);

    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              { id: "AC-0201", statement: "One." },
              { id: "AC-0201", statement: "Two." },
            ],
          },
        ],
        { filePath: "requirements/functional/02-cli-surface.yml" },
      ),
    ).toThrow(/duplicate acceptance criterion id WTW-FR-0002.AC-0201/);
  });

  it("requires removed acceptance criteria to explain removal", () => {
    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              {
                id: "AC-0201",
                statement: "Old behavior.",
                status: "removed",
              },
            ],
          },
        ],
        { filePath: "requirements/functional/02-cli-surface.yml" },
      ),
    ).toThrow(/removed acceptance criterion requires removedReason/);
  });
});

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("loadRequirements", () => {
  it("loads split functional requirement files in path order", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "wtw-requirements-"));
    const requirementsDir = path.join(tempRoot, "requirements/functional");

    try {
      await mkdir(requirementsDir, { recursive: true });
      await writeFile(
        path.join(requirementsDir, "15-version.yml"),
        [
          "- id: WTW-FR-0015",
          "  title: Version",
          "  status: active",
          "  description: Prints version.",
          "  acceptance:",
          "    - id: AC-1501",
          "      statement: Exits with code 0.",
          "",
        ].join("\n"),
      );
      await writeFile(
        path.join(requirementsDir, "02-cli-surface.yml"),
        [
          "- id: WTW-FR-0002",
          "  title: CLI surface",
          "  status: active",
          "  description: Defines the surface.",
          "  acceptance:",
          "    - id: AC-0201",
          "      statement: Exits with code 0.",
          "",
        ].join("\n"),
      );

      const requirements = await loadRequirements(tempRoot);

      expect(requirements.map((entry) => entry.id)).toEqual([
        "WTW-FR-0002",
        "WTW-FR-0015",
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("loads the real requirements registry", async () => {
    const requirements = await loadRequirements(repoRoot);
    expect(requirements.map((entry) => entry.id)).toContain("WTW-FR-0002");
    expect(requirements.map((entry) => entry.id)).toContain("WTW-FR-0015");
  });
});
