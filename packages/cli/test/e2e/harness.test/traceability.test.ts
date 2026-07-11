import path from "node:path";
import { describe, expect, it } from "vitest";
import { type CaseManifest, loadCases } from "../harness/case-manifest";
import { loadRequirements, type Requirement } from "../harness/requirements";
import { validateTraceability } from "../harness/traceability";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const baseRequirement: Requirement = {
  id: "WTW-FR-0002",
  title: "CLI surface",
  status: "active",
  description: "Defines the CLI surface.",
  acceptance: [
    { id: "AC-0201", statement: "Help exits 0." },
    { id: "AC-0202", statement: "Excluded commands exit 1." },
  ],
};

const requirements: Requirement[] = [baseRequirement];

const baseCase: CaseManifest = {
  id: "bare-invocation",
  covers: ["WTW-FR-0002.AC-0201", "WTW-FR-0002.AC-0202"],
  title: "Bare invocation",
  description: "Runs the bare CLI.",
  cwd: ".",
  command: ["--help"],
  substitute: {},
  env: {},
  setup: [],
  expect: { exitCode: 0, stdout: "ok\n", stderr: "" },
};

const cases: CaseManifest[] = [baseCase];

describe("validateTraceability", () => {
  it("accepts cases that cover every active acceptance criterion", () => {
    expect(() => validateTraceability(requirements, cases)).not.toThrow();
  });

  it("rejects uncovered active acceptance criteria", () => {
    expect(() =>
      validateTraceability(requirements, [
        { ...baseCase, covers: ["WTW-FR-0002.AC-0201"] },
      ]),
    ).toThrow(/uncovered acceptance criterion WTW-FR-0002.AC-0202/);
  });

  it("rejects missing requirement and missing acceptance references", () => {
    expect(() =>
      validateTraceability(requirements, [
        { ...baseCase, covers: ["WTW-FR-0099.AC-0201"] },
      ]),
    ).toThrow(/covers missing requirement WTW-FR-0099/);

    expect(() =>
      validateTraceability(requirements, [
        { ...baseCase, covers: ["WTW-FR-0002.AC-9999"] },
      ]),
    ).toThrow(/covers missing acceptance criterion WTW-FR-0002.AC-9999/);
  });

  it("rejects removed requirement and removed acceptance references", () => {
    expect(() =>
      validateTraceability(
        [{ ...baseRequirement, status: "removed", removedReason: "Retired." }],
        cases,
      ),
    ).toThrow(/covers removed requirement WTW-FR-0002/);

    expect(() =>
      validateTraceability(
        [
          {
            ...baseRequirement,
            acceptance: [
              {
                id: "AC-0201",
                statement: "Old.",
                status: "removed",
                removedReason: "Retired.",
              },
              { id: "AC-0202", statement: "Excluded commands exit 1." },
            ],
          },
        ],
        cases,
      ),
    ).toThrow(/covers removed acceptance criterion WTW-FR-0002.AC-0201/);
  });
});

describe("real tree traceability", () => {
  it("covers every active acceptance criterion", async () => {
    const requirements = await loadRequirements(repoRoot);
    const cases = (await loadCases(repoRoot)).map((entry) => entry.manifest);
    expect(() => validateTraceability(requirements, cases)).not.toThrow();
  });
});
