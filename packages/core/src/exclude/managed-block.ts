// Pure transform for the `wtw`-managed block inside a repository's
// `info/exclude` text.
//
// This module is part of `@wtw/core` and must stay effect-free: it takes the
// current exclude-file text plus the canonical private paths and returns the
// reconciled text. It never reads the filesystem, spawns Git, or writes
// anything — the CLI owns reading and writing `info/exclude`.
//
// The block is delimited by two whole-line markers. Reconciliation rewrites the
// block's interior to exactly the supplied paths (deduplicated, sorted for a
// deterministic order) and leaves every byte outside the block untouched, so
// applying it twice is a no-op.

/** Whole-line marker that opens the `wtw`-managed exclude block. */
export const MANAGED_BLOCK_BEGIN = "# >>> wtw managed >>>";

/** Whole-line marker that closes the `wtw`-managed exclude block. */
export const MANAGED_BLOCK_END = "# <<< wtw managed <<<";

/** Result of scanning exclude text for the managed block. */
export interface ManagedBlockScan {
  /** Whether a matched begin/end marker pair was found. */
  readonly present: boolean;
  /**
   * Whether a begin marker exists with no matching end marker — a malformed,
   * unpaired block (e.g. a hand-deleted end marker). When true, `present` is
   * false and `entries` is empty; the `check` command uses this to report an
   * invalid block that `reconcileExcludeBlock` will heal in place.
   */
  readonly malformed: boolean;
  /** The interior lines of the block (non-empty, `\r` stripped), in file order. */
  readonly entries: string[];
}

/** Deduplicate then sort lexicographically for a deterministic, stable order. */
function canonicalizeEntries(managedPaths: readonly string[]): string[] {
  return [...new Set(managedPaths)].sort((a, b) => {
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  });
}

/**
 * Find the byte offset of `marker` where it occupies a whole line (it starts at
 * the beginning of the file or just after a `\n`, and ends at end-of-file or at
 * a line terminator). Returns -1 when no such whole-line occurrence exists.
 */
function findWholeLine(
  text: string,
  marker: string,
  fromIndex: number,
): number {
  let idx = text.indexOf(marker, fromIndex);
  while (idx !== -1) {
    const atLineStart = idx === 0 || text[idx - 1] === "\n";
    const after = idx + marker.length;
    const atLineEnd =
      after === text.length || text[after] === "\n" || text[after] === "\r";
    if (atLineStart && atLineEnd) {
      return idx;
    }
    idx = text.indexOf(marker, idx + 1);
  }
  return -1;
}

interface BlockSpan {
  /** Offset of the begin marker (start of its line). */
  readonly beginIdx: number;
  /** Offset one past the begin marker's line terminator (start of interior). */
  readonly interiorStart: number;
  /** Offset of the end marker (start of its line). */
  readonly endMarkerIdx: number;
  /** Offset one past the whole block (after the end marker's line). */
  readonly blockEnd: number;
  /** Whether the block's final line carried a trailing `\n`. */
  readonly trailingNewline: boolean;
}

/** Locate a matched begin/end marker pair, or `null` when absent/unpaired. */
function locateBlock(text: string): BlockSpan | null {
  const beginIdx = findWholeLine(text, MANAGED_BLOCK_BEGIN, 0);
  if (beginIdx === -1) {
    return null;
  }
  const endMarkerIdx = findWholeLine(
    text,
    MANAGED_BLOCK_END,
    beginIdx + MANAGED_BLOCK_BEGIN.length,
  );
  if (endMarkerIdx === -1) {
    return null;
  }

  const beginNewline = text.indexOf(
    "\n",
    beginIdx + MANAGED_BLOCK_BEGIN.length,
  );
  const interiorStart = beginNewline === -1 ? text.length : beginNewline + 1;

  const endNewline = text.indexOf(
    "\n",
    endMarkerIdx + MANAGED_BLOCK_END.length,
  );
  const blockEnd = endNewline === -1 ? text.length : endNewline + 1;
  const trailingNewline = endNewline !== -1;

  return { beginIdx, interiorStart, endMarkerIdx, blockEnd, trailingNewline };
}

/** Split an interior substring into non-empty entry lines (stripping `\r`). */
function splitEntries(interior: string): string[] {
  return interior
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line !== "");
}

/**
 * Read the managed block from exclude text: `present` is true only when a
 * matched begin/end marker pair exists, and `entries` are that block's interior
 * lines in file order. Consumed by the `check` command to detect a missing or
 * modified block.
 */
export function findManagedBlock(text: string): ManagedBlockScan {
  const span = locateBlock(text);
  if (span === null) {
    // No matched pair. If a begin marker is nevertheless present, the document
    // holds an unpaired (malformed) block that reconcile will heal in place.
    const malformed = findWholeLine(text, MANAGED_BLOCK_BEGIN, 0) !== -1;
    return { present: false, malformed, entries: [] };
  }
  const interior = text.slice(span.interiorStart, span.endMarkerIdx);
  return { present: true, malformed: false, entries: splitEntries(interior) };
}

/** Render the block body (markers plus canonical entries), without a terminator. */
function renderBlock(entries: readonly string[]): string {
  return [MANAGED_BLOCK_BEGIN, ...entries, MANAGED_BLOCK_END].join("\n");
}

/**
 * Reconcile the `wtw`-managed block inside `existing` exclude text so it
 * contains exactly `managedPaths` (deduplicated, deterministically ordered).
 *
 * If a matched block already exists, its interior is rewritten in place and
 * every byte outside the block is preserved verbatim.
 *
 * If a begin marker exists with no matching end marker (a malformed, unpaired
 * block — e.g. a hand-deleted end marker), the transform does NOT append a
 * second block. Appending would leave two begin markers and one end marker; a
 * later reconcile would then pair the orphan begin with the appended end and
 * silently delete every line between them. Instead the orphan begin is healed
 * in place: the block is closed immediately after the begin-marker line with a
 * freshly rendered interior, so every following user byte is preserved and the
 * result contains exactly one matched block.
 *
 * If no begin marker exists at all, a fresh block is appended, with a separating
 * newline inserted only when the surrounding text does not already end with one.
 *
 * The result is byte-stable under repeated application, including for malformed
 * inputs.
 */
export function reconcileExcludeBlock(
  existing: string,
  managedPaths: string[],
): string {
  const entries = canonicalizeEntries(managedPaths);
  const span = locateBlock(existing);

  if (span !== null) {
    const before = existing.slice(0, span.beginIdx);
    const after = existing.slice(span.blockEnd);
    const trailing = span.trailingNewline ? "\n" : "";
    return `${before}${renderBlock(entries)}${trailing}${after}`;
  }

  // No matched pair. If an unpaired begin marker is present, heal it in place
  // rather than appending — appending would risk silent content loss on a
  // subsequent reconcile. The orphan begin line is replaced by a complete,
  // closed block; all bytes after that line are preserved as trailing content.
  const orphanBeginIdx = findWholeLine(existing, MANAGED_BLOCK_BEGIN, 0);
  if (orphanBeginIdx !== -1) {
    const beginNewline = existing.indexOf(
      "\n",
      orphanBeginIdx + MANAGED_BLOCK_BEGIN.length,
    );
    const before = existing.slice(0, orphanBeginIdx);
    const trailingNewline = beginNewline !== -1;
    const after = trailingNewline ? existing.slice(beginNewline + 1) : "";
    const trailing = trailingNewline ? "\n" : "";
    return `${before}${renderBlock(entries)}${trailing}${after}`;
  }

  // No block at all: append a fresh one terminated by a newline.
  const block = `${renderBlock(entries)}\n`;
  if (existing === "") {
    return block;
  }
  const separator = existing.endsWith("\n") ? "" : "\n";
  return `${existing}${separator}${block}`;
}
