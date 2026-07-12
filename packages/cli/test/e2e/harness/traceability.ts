import type { CaseManifest } from "./case-manifest";
import {
  type AcceptanceCriterion,
  acceptanceRef,
  type Requirement,
} from "./requirements";

/**
 * The disk-derived evidence-resolution context the two callers (the E2E suite
 * and the living-doc generator) supply so `unit` and `manual` evidence can be
 * resolved without the authority itself touching the filesystem. The rules that
 * consume it live here — never in a caller.
 */
export type TraceabilityContext = {
  /** Whether a repo-root-relative path exists on disk (`unit` evidence). */
  repoFileExists: (repoRelativePath: string) => boolean;
  /** The full text of `packages/cli/docs/RELEASE-CHECKLIST.md` (`manual`). */
  checklistContent: string;
};

type AcEntry = {
  requirement: Requirement;
  ac: AcceptanceCriterion;
  ref: string;
};

function splitRef(ref: string): {
  requirementId: string;
  acceptanceId: string;
} {
  const [requirementId, acceptanceId] = ref.split(".");
  if (
    requirementId === undefined ||
    acceptanceId === undefined ||
    acceptanceId.length === 0
  ) {
    throw new Error(`invalid acceptance criterion ref ${ref}`);
  }
  return { requirementId, acceptanceId };
}

/** The literal heading marker a `manual` step resolves to in the checklist. */
function manualStepMarker(step: string): string {
  return `## \`${step}\``;
}

/**
 * Resolve a `covers` ref to an active acceptance criterion, or throw with the
 * offending `label` prefix. Missing/retired requirements and missing/retired
 * acceptance criteria all fail (as the old `removed` handling did). Shared by
 * both the declarative-case and checkpoint paths.
 */
function resolveActiveRef(
  ref: string,
  label: string,
  requirementsById: Map<string, Requirement>,
  acceptanceByRef: Map<string, AcEntry>,
): AcEntry {
  const { requirementId } = splitRef(ref);
  const requirement = requirementsById.get(requirementId);
  if (requirement === undefined) {
    throw new Error(`${label}: covers missing requirement ${requirementId}`);
  }
  if (requirement.status === "retired") {
    throw new Error(`${label}: covers retired requirement ${requirementId}`);
  }
  const entry = acceptanceByRef.get(ref);
  if (entry === undefined) {
    throw new Error(`${label}: covers missing acceptance criterion ${ref}`);
  }
  if (entry.ac.status === "retired") {
    throw new Error(`${label}: covers retired acceptance criterion ${ref}`);
  }
  return entry;
}

/**
 * Cross-check requirement/case/checkpoint traceability under the per-kind 1:1
 * rules of spec §2–4. This single function is the sole traceability authority —
 * the E2E suite and the living-doc generator both call it with a disk-derived
 * {@link TraceabilityContext}, so the gate and the document can never disagree,
 * and no mapping rule ever lives only in a caller. It enforces:
 *
 * - declarative (`fast`/`contract`) cases each cover exactly one active
 *   `verifiedBy: case` AC, and each such AC is covered by exactly one case
 *   (zero and duplicate both fail);
 * - mode alignment: a `caseMode: contract` FR's `verifiedBy: case` ACs demand a
 *   contract-mode covering case (a fast cover fails);
 * - scenario checkpoints each cover exactly one active `verifiedBy: checkpoint`
 *   AC, and each such AC is covered by exactly one checkpoint;
 * - `unit` ACs reference an existing repo file; `manual` ACs reference a
 *   resolving checklist step.
 *
 * Retired FRs/ACs carry no coverage obligation, but covering a retired or
 * missing ref still fails.
 */
export function validateTraceability(
  requirements: Requirement[],
  cases: CaseManifest[],
  context: TraceabilityContext,
): void {
  const requirementsById = new Map(requirements.map((item) => [item.id, item]));
  const acceptanceByRef = new Map<string, AcEntry>();
  for (const requirement of requirements) {
    for (const ac of requirement.acceptance) {
      const ref = acceptanceRef(requirement.id, ac.id);
      acceptanceByRef.set(ref, { requirement, ac, ref });
    }
  }

  // Declarative (fast/contract) cases: one active `verifiedBy: case` cover each,
  // kind- and mode-checked. Scenario cases carry no case-level cover.
  const caseCoverage = new Map<string, string[]>();
  for (const testCase of cases) {
    const effectiveMode = testCase.mode ?? "fast";
    if (effectiveMode === "scenario") continue;
    if (testCase.covers === undefined) {
      throw new Error(`${testCase.id}: declarative case must declare covers`);
    }
    const entry = resolveActiveRef(
      testCase.covers,
      testCase.id,
      requirementsById,
      acceptanceByRef,
    );
    if (entry.ac.verifiedBy !== "case") {
      throw new Error(
        `${testCase.id}: covers ${entry.ref} which is verifiedBy ${entry.ac.verifiedBy}, not case`,
      );
    }
    if (
      entry.requirement.caseMode === "contract" &&
      effectiveMode !== "contract"
    ) {
      throw new Error(
        `${testCase.id}: covers ${entry.ref} requires contract-mode coverage but case mode is ${effectiveMode}`,
      );
    }
    const seen = caseCoverage.get(entry.ref) ?? [];
    seen.push(testCase.id);
    caseCoverage.set(entry.ref, seen);
  }

  // Scenario checkpoints: one active `verifiedBy: checkpoint` cover each.
  const checkpointCoverage = new Map<string, string[]>();
  for (const testCase of cases) {
    for (const checkpoint of testCase.checkpoints ?? []) {
      const entry = resolveActiveRef(
        checkpoint.covers,
        checkpoint.id,
        requirementsById,
        acceptanceByRef,
      );
      if (entry.ac.verifiedBy !== "checkpoint") {
        throw new Error(
          `${checkpoint.id}: covers ${entry.ref} which is verifiedBy ${entry.ac.verifiedBy}, not checkpoint`,
        );
      }
      const seen = checkpointCoverage.get(entry.ref) ?? [];
      seen.push(checkpoint.id);
      checkpointCoverage.set(entry.ref, seen);
    }
  }

  // Coverage obligations and evidence references for every active AC.
  for (const requirement of requirements) {
    if (requirement.status !== "active") continue;
    for (const ac of requirement.acceptance) {
      if (ac.status === "retired") continue;
      const ref = acceptanceRef(requirement.id, ac.id);
      switch (ac.verifiedBy) {
        case "case": {
          const ids = caseCoverage.get(ref) ?? [];
          if (ids.length === 0) {
            throw new Error(`uncovered acceptance criterion ${ref}`);
          }
          if (ids.length > 1) {
            throw new Error(
              `acceptance criterion ${ref} is covered by multiple cases: ${ids.join(", ")}`,
            );
          }
          break;
        }
        case "checkpoint": {
          const ids = checkpointCoverage.get(ref) ?? [];
          if (ids.length === 0) {
            throw new Error(`uncovered acceptance criterion ${ref}`);
          }
          if (ids.length > 1) {
            throw new Error(
              `acceptance criterion ${ref} is covered by multiple checkpoints: ${ids.join(", ")}`,
            );
          }
          break;
        }
        case "unit": {
          const unitTest = ac.unitTest as string;
          if (!context.repoFileExists(unitTest)) {
            throw new Error(
              `acceptance criterion ${ref} unit test file ${unitTest} does not exist`,
            );
          }
          break;
        }
        case "manual": {
          const manualStep = ac.manualStep as string;
          if (
            !context.checklistContent.includes(manualStepMarker(manualStep))
          ) {
            throw new Error(
              `acceptance criterion ${ref} manual step ${manualStep} is not found in the release checklist`,
            );
          }
          break;
        }
      }
    }
  }
}
