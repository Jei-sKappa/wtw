// Worktrunk version-compatibility evaluation.
//
// This module is part of `@wtw/core` and must stay effect-free: it derives a
// structured finding purely from a supplied version string. It never spawns
// Worktrunk, reads the environment, or formats terminal output — the CLI resolves
// the version and renders the finding.
//
// The rule is fixed by decision-log P20 and the spec's "Compatibility and safety
// constraints" section: the verified range is `>=0.62.0 <0.63.0`. A version in
// range passes; a lower or unparseable/absent version fails; `0.63.0` and newer
// warn as unverified but are not blocked. A small pure comparator is used rather
// than a semver dependency — the rule only needs two fixed boundary comparisons.

/** Severity of a version finding, mapped to `check` outcome classes. */
export type VersionSeverity = "pass" | "warn" | "fail";

/** Structured finding for a resolved (or unresolved) Worktrunk version. */
export interface VersionFinding {
  /** Whether the version passes, warns as unverified, or fails. */
  readonly severity: VersionSeverity;
  /** Human-readable explanation for the `check` command. */
  readonly message: string;
  /** The evaluated version string, or `null` when it could not be resolved. */
  readonly version: string | null;
}

/** The verified range boundaries (inclusive min, exclusive next). */
const VERIFIED_MIN = "0.62.0";
const VERIFIED_NEXT = "0.63.0";

type SemverTriple = readonly [number, number, number];

/**
 * Parse a `major.minor.patch` core version, tolerating a leading `v` and any
 * `-prerelease`/`+build` suffix. Returns `null` when no numeric triple is found.
 */
function parseVersion(version: string): SemverTriple | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (match === null) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compare two semver triples; negative when `a < b`, positive when `a > b`. */
function compareTriples(a: SemverTriple, b: SemverTriple): number {
  const [aMajor, aMinor, aPatch] = a;
  const [bMajor, bMinor, bPatch] = b;
  if (aMajor !== bMajor) {
    return aMajor - bMajor;
  }
  if (aMinor !== bMinor) {
    return aMinor - bMinor;
  }
  return aPatch - bPatch;
}

// The boundary triples are known-good literals, so parsing never returns null.
const MIN_TRIPLE = parseVersion(VERIFIED_MIN) as SemverTriple;
const NEXT_TRIPLE = parseVersion(VERIFIED_NEXT) as SemverTriple;

/**
 * Evaluate a resolved Worktrunk version against the verified range.
 *
 * - `>=0.62.0` and `<0.63.0` → `pass`;
 * - below `0.62.0` → `fail`;
 * - `0.63.0` and newer → `warn` (unverified, not blocked);
 * - unparseable or `null` → `fail`.
 */
export function evaluateWorktrunkVersion(
  version: string | null,
): VersionFinding {
  if (version === null) {
    return {
      severity: "fail",
      message:
        "Worktrunk version could not be determined; wtw requires a parseable version >=0.62.0 <0.63.0.",
      version: null,
    };
  }

  const triple = parseVersion(version);
  if (triple === null) {
    return {
      severity: "fail",
      message: `Worktrunk version "${version}" is not a parseable semantic version; wtw requires >=0.62.0 <0.63.0.`,
      version,
    };
  }

  if (compareTriples(triple, MIN_TRIPLE) < 0) {
    return {
      severity: "fail",
      message: `Worktrunk ${version} is below the minimum verified version ${VERIFIED_MIN}; wtw requires >=0.62.0 <0.63.0.`,
      version,
    };
  }

  if (compareTriples(triple, NEXT_TRIPLE) >= 0) {
    return {
      severity: "warn",
      message: `Worktrunk ${version} is newer than the verified range (>=0.62.0 <0.63.0); treated as unverified but not blocked.`,
      version,
    };
  }

  return {
    severity: "pass",
    message: `Worktrunk ${version} is within the verified range >=0.62.0 <0.63.0.`,
    version,
  };
}
