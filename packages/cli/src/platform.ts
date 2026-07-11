// Platform support resolution for `@wtw/cli`. The spec's "Compatibility and
// safety constraints" fix three tiers: macOS is verified (the suites run
// there), Linux is allowed but explicitly unverified/best-effort (it becomes
// supported only after the same suites pass there), and Windows and every other
// platform are unsupported. This is a read-only classification — resolving an
// unsupported platform is a deterministic, non-mutating error/finding — so it
// lives in the CLI but performs no effects beyond reading the platform value.

/**
 * Support tier of the host platform:
 * - `verified`: suites run and pass here (macOS);
 * - `unverified`: execution allowed, best-effort, no suite evidence (Linux);
 * - `unsupported`: not supported (Windows and everything else).
 */
export type PlatformSupportStatus = "verified" | "unverified" | "unsupported";

/** Resolved platform-support classification consumed by the resolver and `check`. */
export interface PlatformSupport {
  /** The Node platform identifier that was classified. */
  readonly platform: NodeJS.Platform;
  /** The support tier for that platform. */
  readonly status: PlatformSupportStatus;
  /** Human-readable rationale, never claiming suite evidence for `unverified`. */
  readonly reason: string;
}

/**
 * Classify a platform (defaulting to the current host) into its support tier.
 * The explicit `platform` parameter is the test seam that lets unit tests
 * simulate Linux (unverified) and Windows/other (unsupported) without mutating
 * `process.platform`.
 */
export function resolvePlatformSupport(
  platform: NodeJS.Platform = process.platform,
): PlatformSupport {
  if (platform === "darwin") {
    return {
      platform,
      status: "verified",
      reason: "macOS is a verified platform.",
    };
  }
  if (platform === "linux") {
    return {
      platform,
      status: "unverified",
      reason:
        "Linux is allowed but unverified/best-effort; the wtw suites have not been run there.",
    };
  }
  return {
    platform,
    status: "unsupported",
    reason: `Platform "${platform}" is unsupported; wtw supports macOS (verified) and Linux (unverified/best-effort).`,
  };
}
