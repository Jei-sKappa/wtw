### Task 11: CLI — `wtw sync --open`

**Objective:** Add the Cursor launch behavior to `sync`: after all
synchronization writes succeed, `sync --open` launches `cursor` exactly once with
the exact absolute primary-worktree workspace path; a launch failure after writes
preserves the synchronized state and exits 1 with the launch error.

**Input / context:** Depends on Task 10's `runSync` and the fake Cursor from Task
3. Behavior fixed by the spec's "`wtw sync`" and "Cursor launch behavior"
paragraphs and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P21, P23.
`cursor` is resolved through `PATH`. Automated tests never open the real GUI.

**Steps:**
1. Add `packages/cli/src/cursor/launch.ts` exporting
   `launchCursor(workspacePath: string): Promise<void>`: invoke `cursor` via
   structured `execa` with the single exact absolute workspace path argument;
   surface a non-zero exit or spawn failure as a `WtwError` carrying the launch
   error.
2. In `runSync` (Task 10), gate the launch strictly after every synchronization
   write has succeeded: when `open` is true, call `launchCursor` with the
   absolute primary workspace path exactly once. If launch fails, leave the
   synchronized files in place (no rollback) and propagate the error so the
   command exits 1. `init`, `check`, and plain `sync` never call `launchCursor`.
3. Ensure direct synchronization blocks until writes and any launch attempt
   complete before the command returns.
4. Author FR-10 requirement file
   `packages/cli/requirements/functional/10-cursor-launch.yml` (AC-10.1..10.4;
   AC-10.4 is the manual-only criterion — record it as a requirement whose
   evidence is the manual release checklist, not an automated case). Add E2E
   cases using the fake Cursor: `init`, `check`, and plain `sync` never invoke it
   (assert the invocation log is empty); `sync --open` invokes it exactly once
   with the exact absolute root workspace path and only after successful writes;
   a simulated launch failure after writes preserves the synchronized files and
   exits 1 with the launch error.
5. Document the manual release check (a supported real Cursor opens/focuses the
   named workspace) in the CLI docs (a short section in
   `packages/cli/docs/` or the release checklist file) and mark AC-10.4 as
   manual-evidence in the requirement file.

**Files modified:** `packages/cli/src/cursor/launch.ts` (NEW),
`packages/cli/src/commands/sync.ts`,
`packages/cli/requirements/functional/10-cursor-launch.yml` (NEW),
`packages/cli/docs/RELEASE-CHECKLIST.md` (NEW),
`packages/cli/test/e2e/cases/*/case.yml` (NEW, FR-10 cases)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test:e2e` exits 0 for all FR-10 cases.
- A case asserts the fake-Cursor invocation log contains exactly one entry with
  the exact absolute workspace path for `sync --open`, and is empty for `init`,
  `check`, and plain `sync`.
- A launch-failure case asserts the synchronized files are unchanged after the
  failure and the command exits 1.

**Acceptance criteria:**
- `init`, `check`, and plain `sync` never invoke Cursor. (AC-10.1)
- `sync --open` invokes the fake Cursor exactly once with the exact absolute root
  workspace path, only after successful writes. (AC-10.2)
- A simulated Cursor launch failure after writes preserves the synchronized files
  and exits 1 with the launch error. (AC-10.3)
- The manual release check for a real Cursor is recorded as manual evidence;
  automated suites never launch the GUI. (AC-10.4)

**Consumes:** `runSync` from Task 10; the fake Cursor and case conventions from
Task 3.

**Produces:** `launchCursor(workspacePath: string): Promise<void>` in
`packages/cli/src/cursor/launch.ts`; the launch-after-writes behavior wired into
`runSync`; the FR-10 requirement manifest and the manual release checklist.
