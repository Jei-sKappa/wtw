// Scaffold and managed-region writers for `@wtw/cli`.
//
// `@wtw/core` owns the canonical scaffold TEXT (`WT_TOML_SCAFFOLD`,
// `WORKTREEINCLUDE_SCAFFOLD`) and the pure `reconcileExcludeBlock` transform;
// this module owns the surrounding effects `init` performs: creating a scaffold
// file only when it is absent (an existing compatible file is preserved
// byte-for-byte), and reconciling the managed `info/exclude` block over the
// canonical private paths. Every write goes through the Task-10 atomic-write
// utility so a partially written file is never observable. These functions only
// run after `init`'s preflight has fully passed, so they never write on a
// predictable conflict.

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { reconcileExcludeBlock } from "@wtw/core";
import { atomicWriteFile } from "../fs/atomic-write";

/** How a scaffold artifact was handled during initialization. */
export type ScaffoldAction = "created" | "preserved";

/** How the managed `info/exclude` block was handled during initialization. */
export type ExcludeAction = "reconciled" | "unchanged";

/** Read a file's UTF-8 bytes, or `null` when it does not exist. */
async function readMaybe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Create `content` at `absolutePath` only when the file is absent. An existing
 * file is left byte-for-byte untouched (returns `"preserved"`); a created file
 * is written atomically after ensuring its parent directory exists.
 */
export async function scaffoldIfAbsent(
  absolutePath: string,
  content: string,
): Promise<ScaffoldAction> {
  const existing = await readMaybe(absolutePath);
  if (existing !== null) {
    return "preserved";
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await atomicWriteFile(absolutePath, content);
  return "created";
}

/**
 * Reconcile the `wtw`-managed block inside the shared `info/exclude` file so it
 * contains exactly `managedPaths`.
 *
 * The pure `reconcileExcludeBlock` transform is byte-stable, so when the
 * reconciled text equals what is already on disk no write happens and the action
 * is `"unchanged"` — keeping a healthy `init` rerun a true no-op. An absent file
 * is treated as empty content and a fresh block is created.
 */
export async function reconcileManagedExclude(
  excludePath: string,
  managedPaths: string[],
): Promise<ExcludeAction> {
  const existing = (await readMaybe(excludePath)) ?? "";
  const reconciled = reconcileExcludeBlock(existing, managedPaths);
  if (reconciled === existing) {
    return "unchanged";
  }
  await mkdir(path.dirname(excludePath), { recursive: true });
  await atomicWriteFile(excludePath, reconciled);
  return "reconciled";
}
