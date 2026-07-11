// Pure evaluation of an existing `.worktreeinclude`'s entries.
//
// This module is part of `@wtw/core` and must stay effect-free: it derives
// findings purely from the supplied include text, the required control paths,
// and a SUPPLIED set of already-ignored candidate paths. It never reads the
// filesystem, globs the real working tree, spawns Git, or formats terminal
// output — the CLI resolves the ignored candidate set and renders the findings.
//
// Two rules, fixed by the spec's "`.worktreeinclude`" section and decision log
// P5/P16/P24:
//   - a required control entry (`.config/wt.toml`, `.worktreeinclude`) that is
//     absent is a FAIL (native Worktrunk config must stay discoverable);
//   - a user entry that matches NO supplied ignored candidate is a WARN, never a
//     FAIL (the entry may be aspirational or point at not-yet-created content).
// `wtw` never adds or guesses entries — this only reports on what the user wrote.

/** Severity of an include finding, mapped to `check` outcome classes. */
export type IncludeSeverity = "warn" | "fail";

/** Kind of an include finding. */
export type IncludeFindingKind = "missing-required" | "unmatched-entry";

/** One structured finding about a `.worktreeinclude`'s entries. */
export interface IncludeFinding {
  /** Whether the finding fails `check` or only warns. */
  readonly severity: IncludeSeverity;
  /** Which rule produced the finding. */
  readonly kind: IncludeFindingKind;
  /** The entry the finding concerns (a required control path, or a user entry). */
  readonly entry: string;
  /** Human-readable explanation for the `check` command. */
  readonly message: string;
}

/** The full set of findings for a `.worktreeinclude`, in report order. */
export interface IncludeFindings {
  /**
   * Missing-required (FAIL) findings first — in the supplied `requiredPaths`
   * order — then unmatched-entry (WARN) findings in include-file order.
   */
  readonly findings: readonly IncludeFinding[];
}

/**
 * Parse `.worktreeinclude` text into its meaningful entries, in file order.
 *
 * Each line is stripped of a trailing `\r` and surrounding whitespace; blank
 * lines and full-line comments (a line whose first non-whitespace character is
 * `#`) are dropped. Inline `#` is NOT treated as a comment — a `#` inside an
 * entry is a literal path character, matching `.gitignore` semantics.
 */
export function parseIncludeEntries(includeText: string): string[] {
  return includeText
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line).trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Escape a run of literal (non-wildcard) pattern text for use in a RegExp. */
function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a `.worktreeinclude` entry to an anchored RegExp for matching against
 * a candidate path.
 *
 * Matching semantics (a documented, deterministic simplification of full
 * `.gitignore`): patterns are matched anchored at the repository root. A leading
 * or trailing `/` is stripped. Wildcards translate as `**` → any run including
 * `/`, `*` → any run excluding `/`, `?` → a single non-`/` character; every
 * other character is literal. The pattern matches a candidate when it matches
 * the whole candidate OR matches a leading directory of it (so a directory entry
 * like `.config` matches `.config/wt.toml`). Unanchored basename matching at
 * arbitrary depth is intentionally NOT supported.
 */
function compileEntry(entry: string): RegExp {
  let pattern = entry;
  if (pattern.startsWith("/")) {
    pattern = pattern.slice(1);
  }
  if (pattern.endsWith("/")) {
    pattern = pattern.slice(0, -1);
  }

  let body = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        body += ".*";
        i += 1;
      } else {
        body += "[^/]*";
      }
    } else if (char === "?") {
      body += "[^/]";
    } else {
      body += escapeLiteral(char as string);
    }
  }

  // Match the whole candidate, or a leading directory of it (`(?:/.*)?`).
  return new RegExp(`^${body}(?:/.*)?$`);
}

/** Whether `entry` matches at least one path in the supplied candidate set. */
function entryMatchesAny(
  entry: string,
  ignoredCandidates: readonly string[],
): boolean {
  const regex = compileEntry(entry);
  return ignoredCandidates.some((candidate) => regex.test(candidate));
}

/**
 * Evaluate an existing `.worktreeinclude`.
 *
 * @param includeText - the current `.worktreeinclude` file contents.
 * @param requiredPaths - the required control entries (e.g.
 *   `.config/wt.toml`, `.worktreeinclude`); each absent one is a FAIL.
 * @param ignoredCandidates - the SUPPLIED set of paths currently ignored by the
 *   repository; a user entry matching none of them is a WARN.
 *
 * Required-path comparison is exact (after parsing), matching how the entries
 * are written verbatim in the scaffold. Returns findings only — it never
 * mutates the include text or adds entries.
 */
export function checkIncludeEntries(
  includeText: string,
  requiredPaths: readonly string[],
  ignoredCandidates: readonly string[],
): IncludeFindings {
  const entries = parseIncludeEntries(includeText);
  const present = new Set(entries);
  const required = new Set(requiredPaths);
  const findings: IncludeFinding[] = [];

  for (const requiredPath of requiredPaths) {
    if (!present.has(requiredPath)) {
      findings.push({
        severity: "fail",
        kind: "missing-required",
        entry: requiredPath,
        message: `Required control entry "${requiredPath}" is missing from .worktreeinclude; native Worktrunk configuration must stay discoverable in linked worktrees.`,
      });
    }
  }

  for (const entry of entries) {
    if (required.has(entry)) {
      continue;
    }
    if (!entryMatchesAny(entry, ignoredCandidates)) {
      findings.push({
        severity: "warn",
        kind: "unmatched-entry",
        entry,
        message: `.worktreeinclude entry "${entry}" matches no currently ignored path; it will copy nothing until matching content exists.`,
      });
    }
  }

  return { findings };
}
