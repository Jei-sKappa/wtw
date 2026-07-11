### Task 6: Core — managed local-exclude block

**Objective:** Provide the pure transform that produces and idempotently
reconciles a clearly delimited `wtw`-managed block inside `info/exclude` text,
covering exactly the canonical private paths and preserving all content outside
the block.

**Input / context:** Depends on Task 1's `@wtw/core`. Pure text transform (no
fs). Behavior fixed by the spec's "Canonical local artifacts" section and
decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P3, P16,
P24. The canonical private paths are `.config/wt.toml`, `.worktreeinclude`, and
the `<repo>.code-workspace` file. The exact marker spelling is a Degree of
freedom, provided it is deterministic and idempotent.

**Steps:**
1. Add `packages/core/src/exclude/managed-block.ts` exporting
   `reconcileExcludeBlock(existing: string, managedPaths: string[]): string`:
   locate an existing delimited `wtw` block by its begin/end markers; replace its
   interior with exactly the managed paths (deduplicated, deterministic order);
   append a fresh block if none exists; and return content byte-identical outside
   the block. Preserve trailing-newline conventions of the surrounding file.
2. Define the begin/end marker constants (e.g.
   `# >>> wtw managed >>>` / `# <<< wtw managed <<<`) as exported constants so the
   check-side reader and tests share one source of truth.
3. Add a reader `findManagedBlock(text): { present: boolean; entries: string[] }`
   for the `check` command (Task 13) to detect a missing or modified block.
4. Add focused unit tests at
   `packages/core/test/exclude/managed-block.test.ts`: creation into empty text;
   creation appended after unrelated content; idempotent reconcile of an existing
   valid block (no duplicate entries, byte-stable); reconcile that repairs a
   modified interior while preserving all surrounding bytes.

**Files modified:** `packages/core/src/exclude/managed-block.ts` (NEW),
`packages/core/src/index.ts`,
`packages/core/test/exclude/managed-block.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/core/test/exclude` exits 0, including an idempotence
  test that applies `reconcileExcludeBlock` twice and asserts byte-equality.
- The dependency-boundary test still passes.

**Acceptance criteria:**
- `reconcileExcludeBlock` produces one delimited block containing exactly the
  supplied canonical private paths and preserves all unrelated bytes. (supports
  AC-05.1)
- Reconciliation of an existing valid block is idempotent and never duplicates
  entries. (supports AC-05.3)

**Consumes:** `@wtw/core` from Task 1.

**Produces:** `reconcileExcludeBlock(existing: string, managedPaths: string[]): string`,
`findManagedBlock(text): { present: boolean; entries: string[] }`, and the
exported begin/end marker constants, all from `@wtw/core`.
