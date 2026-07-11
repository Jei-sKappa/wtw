import * as fsp from "node:fs/promises";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AtomicWriteFs, atomicWriteFile } from "../../src/fs/atomic-write";

/** Real fs ops with individual operations overridable for failure injection. */
function fsWith(overrides: Partial<AtomicWriteFs>): AtomicWriteFs {
  return {
    writeFile: fsp.writeFile,
    rename: fsp.rename,
    unlink: fsp.unlink,
    ...overrides,
  };
}

describe("atomicWriteFile", () => {
  const dirs: string[] = [];

  async function makeDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "wtw-atomic-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("writes the full payload to the destination", async () => {
    const dir = await makeDir();
    const dest = path.join(dir, "file with space.txt");
    await atomicWriteFile(dest, "hello\n");
    await expect(readFile(dest, "utf8")).resolves.toBe("hello\n");
  });

  it("overwrites an existing destination with the new bytes", async () => {
    const dir = await makeDir();
    const dest = path.join(dir, "wt.toml");
    await writeFile(dest, "old\n");
    await atomicWriteFile(dest, "new\n");
    await expect(readFile(dest, "utf8")).resolves.toBe("new\n");
  });

  it("leaves the destination untouched and no partial file when the write fails mid-way", async () => {
    const dir = await makeDir();
    const dest = path.join(dir, "wt.toml");
    await writeFile(dest, "original\n");

    // Simulate a mid-write failure: the temp write throws before the rename, so
    // the destination must never be touched and no temp artifact may survive.
    const failingWrite = vi
      .fn<AtomicWriteFs["writeFile"]>()
      .mockRejectedValue(new Error("disk full (simulated)"));

    await expect(
      atomicWriteFile(
        dest,
        "replacement\n",
        fsWith({ writeFile: failingWrite }),
      ),
    ).rejects.toThrow(/disk full/);
    expect(failingWrite).toHaveBeenCalledOnce();

    // Destination preserved exactly; the directory holds only the original file.
    await expect(readFile(dest, "utf8")).resolves.toBe("original\n");
    expect(await readdir(dir)).toEqual(["wt.toml"]);
  });

  it("leaves no temp file behind when the rename fails", async () => {
    const dir = await makeDir();
    const dest = path.join(dir, "wt.toml");

    // The temp write really happens (a real partial artifact appears), then the
    // rename fails: cleanup must remove the temp so no `.wtw-tmp` file leaks and
    // the destination is never created.
    const rename = vi
      .fn<AtomicWriteFs["rename"]>()
      .mockRejectedValue(new Error("rename failed (simulated)"));

    await expect(
      atomicWriteFile(dest, "body\n", fsWith({ rename })),
    ).rejects.toThrow(/rename failed/);

    expect(await readdir(dir)).toEqual([]);
  });
});
