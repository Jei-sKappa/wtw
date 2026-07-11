### Task 7: Core — Worktrunk scaffold, hook compatibility, and version range

**Objective:** Provide the pure Worktrunk domain logic: generate the canonical
`.config/wt.toml` scaffold, check an existing TOML's reserved hooks for exact
compatibility (producing the exact manual additions on conflict), and evaluate
the Worktrunk version-compatibility finding.

**Input / context:** Depends on Task 1's `@wtw/core`. Pure over supplied text and
version strings (no fs, no subprocess). Reserved-hook contract fixed verbatim by
the spec's "`.config/wt.toml`" section and review-findings decision log
`specs/001/discussions/260711143813Z-review-findings-decision-log.md` P7; scaffold
and no-rewrite behavior by genesis log P16, P18, P28; version range by P19, P20.
The TOML parser is a Degree of freedom.

**Steps:**
1. Add `packages/core/src/worktrunk/scaffold.ts` exporting the canonical scaffold
   content. The scaffold MUST contain exactly these three named commands (the
   `wtw` contract — keys and command strings must not drift):
   ```toml
   [pre-start]
   wtw-copy = "wt step copy-ignored --require-include"

   [post-start]
   wtw-sync = "wtw sync --open"

   [post-remove]
   wtw-sync = "wtw sync"
   ```
2. Add `checkReservedHooks(tomlText: string): HookCompatResult` in
   `packages/core/src/worktrunk/hooks.ts`, parsing supplied
   TOML text and verifying the `wtw-copy` key in `[pre-start]` and the `wtw-sync`
   key in both `[post-start]` and `[post-remove]` exist with exactly the above
   command strings. On any missing/conflicting reserved hook, return a
   non-compatible result carrying the exact manual additions the user must make
   (the precise TOML lines), for the no-write preflight failure message. A file
   already carrying all reserved hooks is reported compatible and must be
   preserved byte-for-byte by callers (this function never rewrites).
3. Add `evaluateWorktrunkVersion(version: string | null): VersionFinding` in
   `packages/core/src/worktrunk/version.ts`, implementing P20: parsed `0.62.0` and later `0.62.x` → pass; below `0.62.0` →
   fail; `0.63.0` and newer → warn (unverified, not blocked); unparseable/`null`
   → fail. Return a structured finding (severity + message) for `check`.
4. Re-export from `packages/core/src/index.ts`.
5. Add focused unit tests at `packages/core/test/worktrunk/`: the scaffold string
   equals the exact contract commands; an existing TOML with all reserved hooks
   (plus unrelated custom hooks/comments/order) is reported compatible; a missing
   and a conflicting reserved hook each produce the exact manual additions; the
   version finding for `0.62.0`, `0.62.7`, `0.61.9`, `0.63.0`, `1.0.0`, and
   unparseable input.

**Files modified:** `packages/core/src/worktrunk/scaffold.ts` (NEW),
`packages/core/src/worktrunk/hooks.ts` (NEW),
`packages/core/src/worktrunk/version.ts` (NEW),
`packages/core/src/index.ts`,
`packages/core/test/worktrunk/scaffold.test.ts` (NEW),
`packages/core/test/worktrunk/hooks.test.ts` (NEW),
`packages/core/test/worktrunk/version.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/core/test/worktrunk` exits 0.
- A test asserts the scaffold contains the three exact key/command pairs
  verbatim.
- The dependency-boundary test still passes.

**Acceptance criteria:**
- The scaffold carries exactly the three distinct blocking-copy,
  post-start-sync/open, and post-remove-sync commands with their exact key names
  and command strings. (supports AC-06.1)
- `checkReservedHooks` reports an all-hooks-present TOML compatible (so callers
  preserve it byte-for-byte) and, on a missing/conflicting reserved hook, returns
  the exact manual additions. (supports AC-06.2, AC-06.3)
- `evaluateWorktrunkVersion` passes `0.62.x`, fails below `0.62.0` and
  unparseable input, and warns `0.63.0`+. (supports AC-12.1)

**Consumes:** `@wtw/core` from Task 1.

**Produces:** the canonical `.config/wt.toml` scaffold string;
`checkReservedHooks(tomlText: string): HookCompatResult` (carrying exact manual
additions on conflict); `evaluateWorktrunkVersion(version: string | null): VersionFinding`,
all from `@wtw/core`.
