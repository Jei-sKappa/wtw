import { mkdir, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WtwError } from "@wtw/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LOCK_FILE_NAME,
  LOCK_STALE_ENV,
  LOCK_TIMEOUT_ENV,
  withRepositoryLock,
} from "../src/lock";

describe("withRepositoryLock", () => {
  const dirs: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv[LOCK_TIMEOUT_ENV] = process.env[LOCK_TIMEOUT_ENV];
    savedEnv[LOCK_STALE_ENV] = process.env[LOCK_STALE_ENV];
    // Keep unit runs fast: a short acquisition budget.
    process.env[LOCK_TIMEOUT_ENV] = "400";
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function makeCommonDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "wtw-lock-"));
    dirs.push(dir);
    return dir;
  }

  it("runs the critical section and releases the lock afterwards", async () => {
    const common = await makeCommonDir();
    const result = await withRepositoryLock(common, async () => "done");
    expect(result).toBe("done");
    // Mutex directory removed on release, so a second acquisition succeeds.
    const again = await withRepositoryLock(common, async () => "again");
    expect(again).toBe("again");
  });

  it("times out with lock_unavailable and never runs fn when the lock is held", async () => {
    const common = await makeCommonDir();
    // Simulate a live holder by pre-creating a fresh (non-stale) mutex dir.
    await mkdir(path.join(common, LOCK_FILE_NAME), { recursive: true });

    let ran = false;
    const error = await withRepositoryLock(common, async () => {
      ran = true;
      return "unreachable";
    }).catch((e: unknown) => e);

    expect(ran).toBe(false);
    expect(error).toBeInstanceOf(WtwError);
    expect((error as WtwError).code).toBe("lock_unavailable");
  });

  it("releases the lock even when the critical section throws", async () => {
    const common = await makeCommonDir();
    await expect(
      withRepositoryLock(common, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // The lock was released despite the throw: a fresh acquisition succeeds and
    // no mutex directory is left behind.
    const value = await withRepositoryLock(common, async () => "recovered");
    expect(value).toBe("recovered");
    const entries = await readdir(common);
    expect(entries).not.toContain(LOCK_FILE_NAME);
  });

  it("recovers a stale lock per the documented threshold", async () => {
    const common = await makeCommonDir();
    // A pre-existing mutex dir whose mtime is far older than the (minimum 2s)
    // stale threshold: the library recognizes it as abandoned and recovers it.
    process.env[LOCK_STALE_ENV] = "2000";
    const mutex = path.join(common, LOCK_FILE_NAME);
    await mkdir(mutex, { recursive: true });
    const longAgo = new Date(Date.now() - 60_000);
    await utimes(mutex, longAgo, longAgo);

    const value = await withRepositoryLock(common, async () => "acquired");
    expect(value).toBe("acquired");
  });
});
