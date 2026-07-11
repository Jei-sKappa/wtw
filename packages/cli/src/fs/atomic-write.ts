// Atomic file replacement for `@wtw/cli`. The spec's "Compatibility and safety
// constraints" require that a partially written canonical, linked-control, or
// workspace file can never be observed: a reader either sees the previous bytes
// or the complete new bytes, never a truncated mix.
//
// The technique is the standard write-temp-then-rename: write the full payload
// to a uniquely named temporary file in the SAME directory as the destination
// (so the final `rename` stays on one filesystem and is therefore atomic), then
// `rename` the temp over the destination. A failure before the rename leaves the
// destination untouched; the half-written bytes only ever live in the temp file,
// which is best-effort removed on any error path.

import { randomBytes } from "node:crypto";
import * as fsp from "node:fs/promises";
import path from "node:path";

/** Build a collision-resistant temp filename beside `destPath` in its directory. */
function tempPathFor(destPath: string): string {
  const dir = path.dirname(destPath);
  const base = path.basename(destPath);
  const token = randomBytes(6).toString("hex");
  return path.join(dir, `.${base}.${token}.wtw-tmp`);
}

/**
 * The subset of filesystem operations {@link atomicWriteFile} performs. It is an
 * injectable seam (defaulting to `node:fs/promises`) so tests can deterministically
 * simulate a mid-write or mid-rename failure without touching a real disk fault —
 * ESM module namespaces are not spyable.
 */
export interface AtomicWriteFs {
  writeFile: (typeof fsp)["writeFile"];
  rename: (typeof fsp)["rename"];
  unlink: (typeof fsp)["unlink"];
}

const DEFAULT_FS: AtomicWriteFs = {
  writeFile: fsp.writeFile,
  rename: fsp.rename,
  unlink: fsp.unlink,
};

/**
 * Atomically write `data` to `destPath`.
 *
 * Writes to a temp file in the destination's own directory, then renames it over
 * the destination. If writing the temp file fails, the destination is left
 * exactly as it was and the temp file is removed (best effort); no partial
 * destination is ever produced. Paths containing spaces or other unusual
 * characters are handled verbatim — no shell is involved.
 */
export async function atomicWriteFile(
  destPath: string,
  data: string,
  deps: AtomicWriteFs = DEFAULT_FS,
): Promise<void> {
  const tempPath = tempPathFor(destPath);
  try {
    await deps.writeFile(tempPath, data, "utf8");
    await deps.rename(tempPath, destPath);
  } catch (error) {
    // Best-effort cleanup of the temp artifact so a failure never leaks a
    // partial sibling file next to the destination.
    await deps.unlink(tempPath).catch(() => {});
    throw error;
  }
}
