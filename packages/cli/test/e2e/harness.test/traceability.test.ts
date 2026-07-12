import { describe, expect, it } from "vitest";
import type { CaseManifest, Checkpoint } from "../harness/case-manifest";
import type {
  AcceptanceCriterion,
  Requirement,
  VerifiedBy,
} from "../harness/requirements";
import {
  type TraceabilityContext,
  validateTraceability,
} from "../harness/traceability";

// This suite is the persistent single-authority proof: every rule
// is exercised by feeding a violating IN-MEMORY fixture to the one shared
// `validateTraceability` function the E2E suite and the living-doc generator
// both call. No rule is checked anywhere but inside that function.

const UNIT_FILE = "packages/core/test/dependency-boundary.test.ts";

function context(
  overrides: Partial<TraceabilityContext> = {},
): TraceabilityContext {
  return {
    repoFileExists: (repoRelativePath) => repoRelativePath === UNIT_FILE,
    checklistContent: "## `cursor-open`\n",
    ...overrides,
  };
}

function ac(
  id: string,
  verifiedBy: VerifiedBy,
  extra: Partial<AcceptanceCriterion> = {},
): AcceptanceCriterion {
  return { id, statement: "does the thing.", verifiedBy, ...extra };
}

function requirement(
  acceptance: AcceptanceCriterion[],
  overrides: Partial<Requirement> = {},
): Requirement {
  return {
    id: "DEMO-FR-0001",
    title: "Demo requirement",
    status: "active",
    description: "Demonstrates traceability enforcement.",
    acceptance,
    ...overrides,
  };
}

function caseManifest(overrides: Partial<CaseManifest> = {}): CaseManifest {
  return {
    id: "demo-case",
    covers: "DEMO-FR-0001.AC-0001",
    title: "Demo case",
    description: "Covers the demo criterion.",
    cwd: ".",
    command: ["--help"],
    substitute: {},
    env: {},
    setup: [],
    expect: { exitCode: 0, stdout: "ok\n", stderr: "" },
    ...overrides,
  };
}

function checkpoint(id: string, covers: string): Checkpoint {
  return { id, title: "Checkpoint", description: "Asserts something.", covers };
}

function scenarioCase(id: string, checkpoints: Checkpoint[]): CaseManifest {
  return {
    id,
    checkpoints,
    title: "Demo scenario",
    description: "Declares checkpoints.",
    mode: "scenario",
    cwd: ".",
    command: ["init"],
    substitute: {},
    env: {},
    setup: [],
    expect: { exitCode: 0, stdout: "ok\n", stderr: "" },
  };
}

describe("validateTraceability — happy path", () => {
  it("accepts a fixture proving all four kinds correctly", () => {
    const requirements: Requirement[] = [
      requirement([
        ac("AC-0001", "case"),
        ac("AC-0002", "checkpoint"),
        ac("AC-0003", "unit", { unitTest: UNIT_FILE }),
        ac("AC-0004", "manual", { manualStep: "cursor-open" }),
        ac("AC-0005", "case", {
          status: "retired",
          retiredReason: "Superseded.",
        }),
      ]),
      requirement([ac("AC-0001", "case")], {
        id: "WTA-FR-0001",
        title: "Worktrunk assumption",
        caseMode: "contract",
      }),
    ];
    const cases: CaseManifest[] = [
      caseManifest({ id: "cover-case", covers: "DEMO-FR-0001.AC-0001" }),
      caseManifest({
        id: "cover-wta",
        mode: "contract",
        covers: "WTA-FR-0001.AC-0001",
      }),
      scenarioCase("demo-scenario", [
        checkpoint("cp-b", "DEMO-FR-0001.AC-0002"),
      ]),
    ];
    expect(() =>
      validateTraceability(requirements, cases, context()),
    ).not.toThrow();
  });

  it("does not require coverage for a retired acceptance criterion", () => {
    const requirements = [
      requirement([
        ac("AC-0001", "case"),
        ac("AC-0002", "case", { status: "retired", retiredReason: "Gone." }),
      ]),
    ];
    const cases = [caseManifest({ covers: "DEMO-FR-0001.AC-0001" })];
    expect(() =>
      validateTraceability(requirements, cases, context()),
    ).not.toThrow();
  });
});

describe("validateTraceability — declarative case violations", () => {
  it("rejects an uncovered case acceptance criterion", () => {
    const requirements = [requirement([ac("AC-0001", "case")])];
    expect(() => validateTraceability(requirements, [], context())).toThrow(
      /uncovered acceptance criterion DEMO-FR-0001\.AC-0001/,
    );
  });

  it("rejects a doubly covered case acceptance criterion", () => {
    const requirements = [requirement([ac("AC-0001", "case")])];
    const cases = [
      caseManifest({ id: "cover-1", covers: "DEMO-FR-0001.AC-0001" }),
      caseManifest({ id: "cover-2", covers: "DEMO-FR-0001.AC-0001" }),
    ];
    expect(() => validateTraceability(requirements, cases, context())).toThrow(
      /covered by multiple cases: cover-1, cover-2/,
    );
  });

  const nonCaseKinds: {
    verifiedBy: VerifiedBy;
    extra: Partial<AcceptanceCriterion>;
  }[] = [
    { verifiedBy: "checkpoint", extra: {} },
    { verifiedBy: "unit", extra: { unitTest: UNIT_FILE } },
    { verifiedBy: "manual", extra: { manualStep: "cursor-open" } },
  ];
  it.each(
    nonCaseKinds,
  )("rejects a case covering a $verifiedBy acceptance criterion", ({
    verifiedBy,
    extra,
  }) => {
    const requirements = [requirement([ac("AC-0001", verifiedBy, extra)])];
    const cases = [caseManifest({ covers: "DEMO-FR-0001.AC-0001" })];
    expect(() => validateTraceability(requirements, cases, context())).toThrow(
      new RegExp(`verifiedBy ${verifiedBy}, not case`),
    );
  });

  it("rejects a fast case covering a contract-mode FR's acceptance criterion", () => {
    const requirements = [
      requirement([ac("AC-0001", "case")], {
        id: "WTA-FR-0001",
        title: "Worktrunk assumption",
        caseMode: "contract",
      }),
    ];
    const cases = [caseManifest({ covers: "WTA-FR-0001.AC-0001" })];
    expect(() => validateTraceability(requirements, cases, context())).toThrow(
      /requires contract-mode coverage but case mode is fast/,
    );
  });

  it("rejects a case covering a retired acceptance criterion", () => {
    const requirements = [
      requirement([
        ac("AC-0001", "case", { status: "retired", retiredReason: "Gone." }),
      ]),
    ];
    const cases = [caseManifest({ covers: "DEMO-FR-0001.AC-0001" })];
    expect(() => validateTraceability(requirements, cases, context())).toThrow(
      /covers retired acceptance criterion DEMO-FR-0001\.AC-0001/,
    );
  });
});

describe("validateTraceability — checkpoint violations", () => {
  it("rejects an uncovered checkpoint acceptance criterion", () => {
    const requirements = [requirement([ac("AC-0001", "checkpoint")])];
    expect(() => validateTraceability(requirements, [], context())).toThrow(
      /uncovered acceptance criterion DEMO-FR-0001\.AC-0001/,
    );
  });

  it("rejects a doubly covered checkpoint acceptance criterion", () => {
    const requirements = [requirement([ac("AC-0001", "checkpoint")])];
    const cases = [
      scenarioCase("demo-scenario", [
        checkpoint("cp-1", "DEMO-FR-0001.AC-0001"),
        checkpoint("cp-2", "DEMO-FR-0001.AC-0001"),
      ]),
    ];
    expect(() => validateTraceability(requirements, cases, context())).toThrow(
      /covered by multiple checkpoints: cp-1, cp-2/,
    );
  });

  it("rejects a checkpoint covering a case-kind acceptance criterion", () => {
    const requirements = [requirement([ac("AC-0001", "case")])];
    const cases = [
      scenarioCase("demo-scenario", [
        checkpoint("cp-1", "DEMO-FR-0001.AC-0001"),
      ]),
    ];
    expect(() => validateTraceability(requirements, cases, context())).toThrow(
      /verifiedBy case, not checkpoint/,
    );
  });
});

describe("validateTraceability — evidence-reference violations", () => {
  it("rejects a unit acceptance criterion whose file is missing", () => {
    const requirements = [
      requirement([
        ac("AC-0001", "unit", {
          unitTest: "packages/core/test/missing.test.ts",
        }),
      ]),
    ];
    expect(() => validateTraceability(requirements, [], context())).toThrow(
      /unit test file packages\/core\/test\/missing\.test\.ts does not exist/,
    );
  });

  it("rejects a manual acceptance criterion whose step is absent from the checklist", () => {
    const requirements = [
      requirement([ac("AC-0001", "manual", { manualStep: "no-such-step" })]),
    ];
    expect(() => validateTraceability(requirements, [], context())).toThrow(
      /manual step no-such-step is not found in the release checklist/,
    );
  });
});
