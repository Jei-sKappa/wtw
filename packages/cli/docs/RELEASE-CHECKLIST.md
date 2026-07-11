# wtw CLI — Manual release checklist

The automated suites are hermetic: the fast E2E harness drives a fake `cursor`
shim that only records the workspace path it was asked to open and never spawns
a GUI. A small number of behaviors can only be confirmed by a human against a
real, supported Cursor install. Perform these manual checks before cutting a
release and record the outcome (date, Cursor version, OS) in the release notes.

## FR-10 — Cursor launch (manual evidence for spec AC-10.4)

`sync --open` must actually open and focus the correct workspace in a supported
real Cursor. The automated cases prove the exact argument and ordering against
the fake shim; this step proves the real editor honors it.

1. In a supported repository with at least one worktree, run `wtw sync --open`
   from any worktree directory.
2. Confirm a supported real Cursor **opens** the root workspace file
   (`<primary-directory-name>.code-workspace`) and **focuses** it (raising an
   already-open window rather than duplicating it).
3. Confirm the command exits 0 after the editor launch is handed off.

Record: Cursor version, OS, and pass/fail. This is the sole place a real Cursor
GUI is exercised; automated suites never launch it.
