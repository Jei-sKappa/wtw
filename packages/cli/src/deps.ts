// Required-executable presence resolution for `@wtw/cli`.
//
// `wtw init`'s preflight verifies that every executable the product and its
// Worktrunk hooks depend on — Git, Worktrunk (`wt`), Cursor, the Node runtime,
// and the `wtw` executable the hooks invoke — is resolvable through `PATH`
// (spec's "`wtw init`" and "Compatibility and safety constraints"). Resolution
// is a read-only `PATH` lookup: it locates the executable file WITHOUT spawning
// it, so probing Cursor never opens a GUI and probing Worktrunk never triggers
// approval (AC-06.4, AC-10.1). Each executable name honours the same
// env-override seam the Git/Cursor wrappers use, so hermetic E2E runs point the
// probe at checked-in fakes without touching the real `PATH`.

import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { CURSOR_BIN_ENV } from "./cursor/launch";
import { GIT_BIN_ENV } from "./git/git";

/** Env var overriding the Worktrunk (`wt`) executable the probe resolves. */
export const WT_BIN_ENV = "WTW_WT_BIN";
/** Env var overriding the Node runtime executable the probe resolves. */
export const NODE_BIN_ENV = "WTW_NODE_BIN";
/** Env var overriding the `wtw` executable the Worktrunk hooks invoke. */
export const WTW_BIN_ENV = "WTW_WTW_BIN";

/** One required executable, its resolved binary name, and whether it resolves. */
export interface DependencyStatus {
  /** Human label used in preflight reports (e.g. `Worktrunk`). */
  readonly label: string;
  /** The binary name or override path the probe resolved (e.g. `wt`). */
  readonly binary: string;
  /** Whether the binary was found on `PATH` (or at the override path). */
  readonly found: boolean;
}

/** Resolve a binary name via an env override (non-empty) or a default name. */
function resolveBinary(envVar: string, fallback: string): string {
  const override = process.env[envVar];
  return override !== undefined && override.length > 0 ? override : fallback;
}

/** Whether `candidate` exists as a regular file with the executable bit set. */
async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    const stats = await stat(candidate);
    if (!stats.isFile()) {
      return false;
    }
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate `binary` the way a shell would, WITHOUT executing it.
 *
 * - A name containing a path separator (an override path) is checked in place.
 * - A bare name is searched across every `PATH` directory, in order.
 *
 * Returns the absolute-ish resolved path, or `null` when nothing executable
 * matches. No subprocess is ever spawned, so probing Cursor/Worktrunk has no
 * side effects.
 */
export async function resolveOnPath(binary: string): Promise<string | null> {
  if (binary.includes(path.sep) || binary.includes("/")) {
    return (await isExecutableFile(binary)) ? binary : null;
  }
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (dir.length === 0) {
      continue;
    }
    const candidate = path.join(dir, binary);
    if (await isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The five executables `init` requires, each with its resolved binary name. */
export function requiredExecutables(): { label: string; binary: string }[] {
  return [
    { label: "Git", binary: resolveBinary(GIT_BIN_ENV, "git") },
    { label: "Worktrunk", binary: resolveBinary(WT_BIN_ENV, "wt") },
    { label: "Cursor", binary: resolveBinary(CURSOR_BIN_ENV, "cursor") },
    { label: "Node runtime", binary: resolveBinary(NODE_BIN_ENV, "node") },
    {
      label: "wtw (hook executable)",
      binary: resolveBinary(WTW_BIN_ENV, "wtw"),
    },
  ];
}

/**
 * Probe every required executable's presence on `PATH` (read-only). Returns one
 * {@link DependencyStatus} per executable so the preflight can report every
 * missing one at once, and always without spawning any of them.
 */
export async function checkRequiredExecutables(): Promise<DependencyStatus[]> {
  return Promise.all(
    requiredExecutables().map(async ({ label, binary }) => ({
      label,
      binary,
      found: (await resolveOnPath(binary)) !== null,
    })),
  );
}
