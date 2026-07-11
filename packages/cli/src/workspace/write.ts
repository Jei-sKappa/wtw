// Effectful Cursor-workspace read/reconcile/write wiring for `@wtw/cli`.
//
// `@wtw/core` owns the pure decisions — `computeManagedFolders`,
// `applyFoldersEdit`, and `minimalWorkspaceScaffold`. This module owns the
// effects that surround them: naming the primary workspace file, reading it (an
// absent file is a first-class outcome, not an error), and atomically writing
// the reconciled text. Invalid JSONC or a non-object top level is surfaced as a
// `workspace_invalid` `WtwError` so the caller writes nothing.

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  applyFoldersEdit,
  type FolderEntry,
  minimalWorkspaceScaffold,
  WtwError,
} from "@wtw/core";
import { atomicWriteFile } from "../fs/atomic-write";

/** How the workspace file was reconciled during a sync. */
export type WorkspaceAction = "created" | "updated" | "unchanged";

/** Outcome of {@link reconcileWorkspace}. */
export interface WorkspaceReconcileResult {
  /** Absolute path of the primary workspace file. */
  readonly workspacePath: string;
  /** Whether the file was created, rewritten, or already byte-correct. */
  readonly action: WorkspaceAction;
}

/**
 * The primary workspace file name: `<primary-directory-name>.code-workspace`,
 * living only in the primary worktree (it is never selected by
 * `.worktreeinclude`).
 */
export function workspaceFileName(primaryPath: string): string {
  return `${path.basename(primaryPath)}.code-workspace`;
}

/** Absolute path of the primary workspace file. */
export function workspacePathFor(primaryPath: string): string {
  return path.join(primaryPath, workspaceFileName(primaryPath));
}

/** Read the workspace text, returning `null` when the file is absent. */
async function readWorkspaceText(
  workspacePath: string,
): Promise<string | null> {
  try {
    return await readFile(workspacePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Reconcile the primary workspace file's top-level `folders` to `folders`,
 * atomically, while preserving everything else.
 *
 * - Absent file → recreate the minimal scaffold carrying `folders`.
 * - Valid JSONC with a top-level object → edit only `folders`, preserving
 *   comments, formatting, property order, and every unrelated property.
 * - Invalid JSONC or a non-object top level → throw `workspace_invalid` WITHOUT
 *   writing, so the file is never corrupted.
 *
 * The write is skipped when the reconciled text is byte-identical to what is
 * already on disk, keeping repeated syncs idempotent and quiet.
 */
export async function reconcileWorkspace(
  primaryPath: string,
  folders: FolderEntry[],
): Promise<WorkspaceReconcileResult> {
  const workspacePath = workspacePathFor(primaryPath);
  const existing = await readWorkspaceText(workspacePath);

  if (existing === null) {
    const text = minimalWorkspaceScaffold(folders);
    await atomicWriteFile(workspacePath, text);
    return { workspacePath, action: "created" };
  }

  const edit = applyFoldersEdit(existing, folders);
  if (!edit.ok) {
    // A deterministic, path-free message (the file always lives in the primary,
    // so its basename is enough) keeps the failure envelope reproducible; the
    // structured `edit.message` with parse offsets is kept in the details.
    const name = workspaceFileName(primaryPath);
    const detail =
      edit.reason === "non_object_root"
        ? `The Cursor workspace ${name} must have a top-level JSON object; no changes were made.`
        : `The Cursor workspace ${name} is not valid JSONC; no changes were made.`;
    throw new WtwError("workspace_invalid", detail, {
      workspacePath,
      reason: edit.reason,
      parseDetail: edit.message,
    });
  }

  if (edit.text === existing) {
    return { workspacePath, action: "unchanged" };
  }

  await atomicWriteFile(workspacePath, edit.text);
  return { workspacePath, action: "updated" };
}
