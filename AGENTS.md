# AGENTS.md

This file provides guidance to AI Agents when working with code in this
repository.

## Update rule

Update `AGENTS.md` when:

- You make significant changes that needs to be remembered across session.
- You made a mistake that should not be repeated.
- The user told you a new rule that should be remembered.

> Note: `CLAUDE.md` is a symlink to `AGENTS.md`.

## Project

`wtw` (WorkTrunk Wrapper) is a private, per-clone setup companion for
[Worktrunk](https://worktrunk.dev) (`wt`), the Git-worktree lifecycle CLI. It
does not wrap or reimplement Worktrunk's lifecycle; it initializes local
worktree automation, keeps control files and a Cursor multi-root workspace
synchronized across worktrees, and diagnoses drift. All local automation stays
out of commits via a managed `info/exclude` block.

### CLI surface

`wtw init` (predictable-conflict preflight, scaffold creation, exclude
reconciliation, internal blocking sync), `wtw sync [--open]` (repository-wide
lock, atomic control-file propagation, workspace `folders` reconciliation,
optional Cursor launch after writes), `wtw check` (read-only aggregate
diagnostics under seven fixed categories with PASS/WARN/FAIL and deterministic
counts). Errors are a single `Error: <message>` line on stderr with exit 1.

### Managed artifacts (in the primary worktree)

- `.config/wt.toml` — standard Worktrunk project config; three reserved hooks
  are the wtw contract (`pre-start wtw-copy`, `post-start wtw-sync`,
  `post-remove wtw-sync`). Never rewritten if present; conflicts fail preflight.
- `.worktreeinclude` — user-owned copy policy; scaffold carries the two
  required control entries.
- `<repo>.code-workspace` — user-editable JSONC; wtw owns only the top-level
  `folders` property (surgical, comment-preserving edits).
- `<git-common-dir>/info/exclude` — one delimited, idempotent wtw-managed
  block covering exactly the canonical private paths.

### Architecture

Bun workspace with exactly two packages:

- `packages/core` (`@wtw/core`) — PURE: data types, Git-porcelain parsing,
  exclude-block/Worktrunk/copy-policy/workspace transforms over supplied text.
  No fs, subprocess, cwd, process args, terminal output, or exit codes —
  enforced by `packages/core/test/dependency-boundary.test.ts`.
- `packages/cli` (`@wtw/cli`) — ALL effects: Commander program, repository
  resolution, Git/Worktrunk/Cursor subprocesses (structured execa args, never
  shell), atomic writes (temp-then-rename), the repository-wide
  `proper-lockfile` lock, output, exit codes.

Bun is the package manager/test runner/bundler; source avoids Bun-only APIs.
The built CLI (`bun run build`) is a self-contained Node bundle
(`packages/cli/dist/index.js`, `#!/usr/bin/env node`, embedded git SHA),
installed via a symlink from `~/.local/bin/wtw` (see
`packages/cli/docs/INSTALL.md`). Executable resolution honors `WTW_GIT_BIN` /
`WTW_WT_BIN` / `WTW_CURSOR_BIN` env overrides (the test seam), else PATH.

### Verification model

Behavior is specified in requirement manifests
(`packages/cli/requirements/functional/*.yml`) mapped to E2E cases
(`packages/cli/test/e2e/cases/*/case.yml`) with modes `fast` (fake wt/cursor
shims), `contract` (real pinned Worktrunk v0.62.0 + built bundle), and
`scenario` (imperative lifecycle proof in `contract.test.ts`). Traceability is
enforced: every active FR-02..FR-13 criterion needs a covering case.
`packages/cli/docs/BEHAVIOR.md` is GENERATED (`bun run docs:living`) — never
hand-edit it; `docs:living:check` fails on drift.

Key scripts (root): `format`, `check` (biome), `typecheck`, `test`,
`test:e2e`, `test:contract`, `docs:living[:check]`, `build`, and
`test-and-report` (the full fail-fast gate — all of the above in order).
All must pass before committing.

macOS is the verified platform (Linux best-effort, Windows unsupported).
Verified Worktrunk range: `>=0.62.0 <0.63.0`.

Workflow docs (spec, plans, decision logs) live under `docs/threads/`; the
authoritative spec is `docs/threads/260711114414Z-wtw-genesis/specs/001/spec.md`.
The Jastr reference implementation at `.library/sources/Jei-sKappa_jastr/`
(gitignored) is the convention model for toolchain, CLI shape, and the E2E
harness.

## Engineering Principles

These principles guide all implementation decisions in this project:

- **Law of Demeter**: A module should know as little as possible about the
  internal structure of other modules. Reduce coupling.
- **Principle of Least Astonishment**: Code should behave in a way other
  developers would reasonably expect.
- **Separation of Concerns**: Split a system into distinct parts, each handling
  a specific concern.
- **Premature Optimization is the Root of All Evil**: Optimize only when there
  is evidence it matters. Readability and correctness come first.
- **Defensive Programming**: Assume inputs, dependencies, and environments may
  fail or misbehave. Validate and safeguard at system boundaries.
- **Design for Testability**: Structure code so it is easy to verify
  automatically. Testable code tends to be more modular and loosely coupled.
- **KISS**: Avoid unnecessary complexity. Simplicity is better than cleverness.
- **YAGNI**: Do not build features until they are actually needed.
- **DRY**: Avoid duplication. Code that repeats itself is harder to maintain.

## Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with
project-specific instructions or explicit user requests as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.
