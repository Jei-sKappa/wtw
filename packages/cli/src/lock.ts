// One repository-wide, cross-process synchronization lock for `@wtw/cli`.
//
// The spec's "`wtw sync`" section requires a single lock held under the Git
// common directory (shared by the primary and every linked worktree, so it is
// genuinely repository-wide regardless of the invocation location), a documented
// short wait, an established library's stale-lock policy, writing nothing on a
// timeout, and always releasing on both success and error paths.
//
// The chosen library is `proper-lockfile`: its mutex is an atomically created
// `<lockfilePath>` directory, and it owns liveness (an mtime it refreshes while
// held) and the stale-lock recovery policy. We point its `lockfilePath` at
// `<git-common-dir>/wtw-sync.lock` and translate a timed-out acquisition
// (`ELOCKED`) into a predictable, non-mutating `WtwError` so the command exits 1
// without writing anything.

import path from "node:path";
import { WtwError } from "@wtw/core";
import lockfile from "proper-lockfile";

/** The mutex file name created under the Git common directory. */
export const LOCK_FILE_NAME = "wtw-sync.lock";

/** Env var overriding the acquisition wait budget (ms). */
export const LOCK_TIMEOUT_ENV = "WTW_LOCK_TIMEOUT_MS";
/** Env var overriding the stale-lock threshold (ms). */
export const LOCK_STALE_ENV = "WTW_LOCK_STALE_MS";

/**
 * Default wait budget before a busy lock is surfaced as a timeout. A short,
 * documented value: long enough to let a sibling `sync` finish its brief
 * critical section, short enough that a genuinely stuck holder fails fast.
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 5000;
/** Fixed retry cadence: proper-lockfile re-probes the mutex this often. */
export const LOCK_RETRY_INTERVAL_MS = 100;
/**
 * Default stale threshold. A lock whose mtime is older than this is considered
 * abandoned (the holder died without releasing) and is recovered by the library
 * per its documented compromised-lock policy.
 */
export const DEFAULT_LOCK_STALE_MS = 10000;

/** Read a positive-integer millisecond env override, or fall back to `fallback`. */
function readMsEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Acquire the repository-wide lock, run `fn` while holding it, and always
 * release it afterwards (success and error paths alike, via `finally`).
 *
 * Acquisition waits up to `WTW_LOCK_TIMEOUT_MS` (default
 * {@link DEFAULT_LOCK_TIMEOUT_MS}), re-probing every
 * {@link LOCK_RETRY_INTERVAL_MS}. On timeout it throws `lock_unavailable` and
 * runs `fn` not at all, so a contended sync writes nothing. A lock older than
 * `WTW_LOCK_STALE_MS` (default {@link DEFAULT_LOCK_STALE_MS}) is treated as
 * stale and recovered.
 */
export async function withRepositoryLock<T>(
  gitCommonDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const timeoutMs = readMsEnv(LOCK_TIMEOUT_ENV, DEFAULT_LOCK_TIMEOUT_MS);
  const staleMs = readMsEnv(LOCK_STALE_ENV, DEFAULT_LOCK_STALE_MS);
  const retries = Math.max(1, Math.ceil(timeoutMs / LOCK_RETRY_INTERVAL_MS));
  const lockfilePath = path.join(gitCommonDir, LOCK_FILE_NAME);

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(gitCommonDir, {
      lockfilePath,
      stale: staleMs,
      retries: {
        retries,
        factor: 1,
        minTimeout: LOCK_RETRY_INTERVAL_MS,
        maxTimeout: LOCK_RETRY_INTERVAL_MS,
      },
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOCKED") {
      throw new WtwError(
        "lock_unavailable",
        `Another wtw sync is holding the repository lock; timed out after ${timeoutMs}ms. No changes were made.`,
        { lockfilePath, timeoutMs },
      );
    }
    throw new WtwError(
      "lock_unavailable",
      `Failed to acquire the repository lock: ${(error as Error).message}`,
      { lockfilePath },
    );
  }

  try {
    return await fn();
  } finally {
    // Always release, on both the success and error paths. A release failure is
    // swallowed: the operation's own outcome (or error) is what the caller must
    // see, and a stale lock left behind is recovered on the next run.
    await release().catch(() => {});
  }
}
