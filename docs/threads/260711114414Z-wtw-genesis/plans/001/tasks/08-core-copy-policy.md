### Task 8: Core — copy-policy scaffold and entry checks

**Objective:** Provide the pure `.worktreeinclude` logic: generate the documented
scaffold containing the two required control entries and user guidance, and
evaluate required-entry and optional-match findings for `check`.

**Input / context:** Depends on Task 1's `@wtw/core`. Pure over supplied text (no
fs, no glob against the real filesystem — matching is evaluated over a supplied
set of ignored paths). Behavior fixed by the spec's "`.worktreeinclude`" section
and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P5, P16,
P24. `wtw` never guesses or interactively collects private paths.

**Steps:**
1. Add `packages/core/src/copy-policy/scaffold.ts` exporting the scaffold, which
   MUST contain at least the two required control paths and the guidance comment:
   ```gitignore
   .config/wt.toml
   .worktreeinclude

   # Add other ignored files and directories below.
   ```
2. Add `checkIncludeEntries(includeText, requiredPaths, ignoredCandidates): IncludeFindings`
   in `packages/core/src/copy-policy/entries.ts`:
   parse the include text into entries; report a FAIL-level finding when either
   required control entry (`.config/wt.toml`, `.worktreeinclude`) is absent;
   report a WARN-level finding for a user entry that currently matches no path in
   the supplied `ignoredCandidates` set (never a fail). Do not add or guess
   entries.
3. Re-export from `packages/core/src/index.ts`.
4. Add focused unit tests at `packages/core/test/copy-policy/`: the scaffold
   contains the two required entries and the guidance line; a missing required
   entry yields a FAIL finding; an optional entry matching nothing yields a WARN
   (not a FAIL); both required present with matching optional entries yields no
   finding.

**Files modified:** `packages/core/src/copy-policy/scaffold.ts` (NEW),
`packages/core/src/copy-policy/entries.ts` (NEW),
`packages/core/src/index.ts`,
`packages/core/test/copy-policy/scaffold.test.ts` (NEW),
`packages/core/test/copy-policy/entries.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/core/test/copy-policy` exits 0.
- The dependency-boundary test still passes.

**Acceptance criteria:**
- The scaffold contains the two required control paths and explanatory
  user-editing guidance, with no guessed private-data entries. (supports AC-07.1)
- `checkIncludeEntries` fails when either required control entry is absent and
  warns (not fails) for a user entry matching no existing ignored content.
  (supports AC-07.2)

**Consumes:** `@wtw/core` from Task 1.

**Produces:** the `.worktreeinclude` scaffold string;
`checkIncludeEntries(includeText, requiredPaths, ignoredCandidates): IncludeFindings`,
from `@wtw/core`.
