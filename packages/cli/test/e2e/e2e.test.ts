import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases } from "./harness/case-manifest";
import { runCase } from "./harness/case-runner";
import { loadRequirements } from "./harness/requirements";
import {
  type TraceabilityContext,
  validateTraceability,
} from "./harness/traceability";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// Load the cases once at collection time so each becomes its own test. Each case
// spawns a cold `bun` CLI subprocess, so a single aggregate loop would put every
// case under one shared timeout — a slow full-suite run could starve those
// spawns and trip that one ceiling regardless of any individual case being fine.
// Per-case tests give each its own timeout and run isolated cases concurrently,
// and a failure now names the exact case instead of "the loop timed out".
const cases = await loadCases(repoRoot);

// Traceability spans EVERY case regardless of mode (contract and scenario cases
// count toward acceptance-criterion coverage), but the fast suite only EXECUTES
// fast cases through the generic runner: contract/scenario cases need the built
// artifact and a pinned real Worktrunk and are run by `contract.test.ts` under
// the separate `test:contract` gate. Filtering the run loop (not the coverage)
// keeps this fast gate green without demanding cases it cannot run here.
const fastCases = cases.filter(
  (entry) => (entry.manifest.mode ?? "fast") === "fast",
);

// Evidence resolution is disk-derived: `unit` refs are repo-root-relative
// (the git repo root is two levels above this package root), and `manual` refs
// resolve against the release checklist. The traceability authority owns the
// rules; the caller only supplies the context.
const gitRepoRoot = path.resolve(repoRoot, "../..");
const traceabilityContext: TraceabilityContext = {
  repoFileExists: (repoRelativePath) =>
    existsSync(path.join(gitRepoRoot, repoRelativePath)),
  checklistContent: await readFile(
    path.join(repoRoot, "docs/RELEASE-CHECKLIST.md"),
    "utf8",
  ),
};

describe("e2e case tree", () => {
  it("has valid requirement traceability", async () => {
    const requirements = await loadRequirements(repoRoot);
    expect(() =>
      validateTraceability(
        requirements,
        cases.map((entry) => entry.manifest),
        traceabilityContext,
      ),
    ).not.toThrow();
  });

  it.concurrent.each(
    fastCases,
  )("runs e2e case $manifest.id through the real CLI (fast mode)", async (testCase) => {
    await runCase(repoRoot, testCase, "fast");
  }, 30_000);
});
