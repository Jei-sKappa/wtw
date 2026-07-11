// `wtw check` — read-only aggregate diagnostics.
//
// The command resolves nothing that mutates: it runs `runDiagnostics` (which
// stats, reads files, resolves executables, and spawns `git`/`wt --version`
// only) and renders the findings under the seven stable categories, in order,
// with `PASS`/`WARN`/`FAIL` severities (and `SKIPPED` for a dependent check a
// missing prerequisite made unrunnable). It ends with deterministic counts,
// exits 0 when no failure exists (warnings included), and exits 1 on any
// failure. It acquires NO lock, performs NO write, and NEVER launches Cursor.

import { Command } from "@commander-js/extra-typings";
import {
  type CategoryReport,
  type DiagnosticsReport,
  type Outcome,
  runDiagnostics,
} from "../diagnostics/categories";

/** The fixed-width severity label rendered before each finding message. */
const OUTCOME_LABEL: Record<Outcome, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  skip: "SKIPPED",
};

/** Render one category block: its name then each finding, indented. */
function formatCategory(category: CategoryReport): string {
  const lines = [category.name];
  for (const finding of category.findings) {
    lines.push(`  ${OUTCOME_LABEL[finding.outcome]}  ${finding.message}`);
  }
  return lines.join("\n");
}

/** Deterministic, human-readable diagnostics report ending with the counts. */
export function formatDiagnostics(report: DiagnosticsReport): string {
  const blocks = report.categories.map(formatCategory);
  const { pass, warn, fail, skip } = report.counts;
  const summary = `Summary: ${pass} pass, ${warn} warn, ${fail} fail, ${skip} skipped.`;
  return `${blocks.join("\n")}\n\n${summary}`;
}

/**
 * `wtw check` — aggregate read-only diagnostics. Prints the report to stdout,
 * sets exit code 1 when any finding failed (and 0 otherwise, warnings
 * included), and makes no changes to repository, Worktrunk, approval, lock, or
 * Cursor state.
 */
export function makeCheckCommand() {
  return new Command("check")
    .description("Diagnose wtw configuration drift without making changes")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async () => {
      const report = await runDiagnostics(process.cwd());
      process.stdout.write(`${formatDiagnostics(report)}\n`);
      if (report.hasFailure) {
        process.exitCode = 1;
      }
    });
}
