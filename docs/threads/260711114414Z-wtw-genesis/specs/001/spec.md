---
version: 2
status:
  approved: 260711153233Z
---

# WorkTrunk Wrapper MVP specification

## Intended outcome

Implement the first usable version of `wtw` (WorkTrunk Wrapper): a private,
per-clone setup companion for Worktrunk that initializes local worktree
automation, keeps its control files and Cursor multi-root workspace synchronized,
and diagnoses drift without changing Worktrunk's native worktree lifecycle.

After implementation, a user can run `wtw init` once in a supported repository,
continue using native `wt` commands, edit the standard `.config/wt.toml` and
`.worktreeinclude` files directly, and rely on Worktrunk hooks to copy selected
ignored content and reconcile Cursor as worktrees are created, removed, or
removed through merge. The local automation remains absent from commits, clones,
and forks (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P16).

## Context

Worktrunk already owns Git worktree creation, switching, merging, removal,
shell-directory switching, hook ordering, and approval semantics. The missing
workflow is private repository setup: selected ignored files must be present in
new worktrees, every active worktree should appear in one deterministic Cursor
workspace, stale workspace entries should disappear, and the setup should not
need tracked repository changes.

A working prototype proved Worktrunk v0.62.0 can copy ignored files in a blocking
creation hook and can trigger Cursor workspace reconciliation on start and
removal. It also showed that lifecycle configuration must be present in every
worktree from which native `wt` may be invoked. The resulting MVP deliberately
uses Worktrunk's standard project configuration and copies the local control
files into linked worktrees instead of introducing an environment override,
global Worktrunk edits, or wrapper passthrough (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P16).

The broader product is split into two delivery threads. This specification is
the first: the initialization, synchronization, diagnostics, Cursor integration,
and real Worktrunk lifecycle proof. Transparent passthrough and the complete
`thread → worktree → editor → agent` workflow belong to a later thread (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P1 and
P27).

## Scope

### Included

- A private Bun workspace containing `@wtw/core` and `@wtw/cli`.
- A Node-compatible `wtw` CLI with `init`, `sync`, and `check` commands.
- Local setup at Worktrunk's standard `.config/wt.toml` path.
- A user-edited `.worktreeinclude` policy whose canonical copy is in the primary
  worktree.
- A user-editable root `<primary-directory-name>.code-workspace` whose
  top-level `folders` property is managed by `wtw`.
- A managed block in the shared Git common directory's `info/exclude` file.
- Propagation of `.config/wt.toml` and `.worktreeinclude` from the primary
  worktree to linked worktrees.
- Repository-wide synchronization locking and atomic file replacement.
- Read-only aggregate diagnostics.
- Verified macOS support for standard non-bare repositories, with Linux kept
  unverified/best-effort.
- A Jastr-style functional-requirement, E2E-case, traceability, and generated
  living-document system.
- Fast behavior E2E cases and a small real Worktrunk external-contract suite.
- Node-targeted bundling with semantic version plus build Git SHA.
- Documented local installation through a symlink to the bundle.

### Explicitly excluded

- Reimplementing Git or Worktrunk lifecycle semantics.
- `wt` argument passthrough or wrapper-owned switching, merging, or removal.
- Shell integration for `wtw`.
- Global Worktrunk user-configuration edits.
- A hidden manifest, durable private state model, or general `wtw` preferences
  file.
- Copying user-selected ignored development data during `wtw sync`; Worktrunk
  owns creation-time copying.
- Editors other than Cursor.
- Opening a real Cursor GUI in automated tests.
- Bare repositories, Windows, or repositories without a primary worktree that
  satisfies the explicit Git-derived predicate in this specification.
- Thread discovery, branch derivation, agent adapters, prompt templates, a TUI,
  or the one-shot thread workflow.
- `--force`, `--fix`, `--dry-run`, JSON output, a configuration command, or a
  separate workspace-open command.
- Registry publication, Homebrew, standalone executable distribution, automated
  releases/upgrades, or self-installation.
- Continuous-integration setup in the MVP.
- Public licensing or open-source publication decisions.

These boundaries implement the simplified MVP and prevent later product ideas
from expanding this handoff (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P27).

## Repository and package architecture

The repository is a private Bun workspace with exactly two initial product
packages (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P9–P11):

```text
packages/
├── core/
└── cli/
```

`@wtw/core` owns pure data and transformations: repository/worktree models,
Git-porcelain parsing from supplied text, initialization and synchronization
plans, managed exclude-block transformations, Worktrunk scaffold generation,
workspace-folder calculation, and structured diagnostic findings. It must not
read process arguments, inspect the current working directory, spawn commands,
perform filesystem writes, format terminal output, or set exit codes.

`@wtw/cli` owns effects and interfaces: Commander composition, cwd and platform
resolution, Git/Worktrunk/Cursor subprocesses, filesystem reads and atomic
writes, environment and executable lookup, lock acquisition, user-facing output,
and exit codes. Git, Worktrunk, Cursor, and filesystem concerns remain focused
modules inside this package; no integration becomes a third package in the MVP.

The CLI follows the Jastr reference conventions: a minimal `index.ts`, a
testable `buildProgram()`, focused command modules, centralized structured error
handling, Commander with typed extensions, strict TypeScript, Biome, Vitest,
Execa, YAML requirement/case manifests, and aggregate root scripts (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P15).
Source must avoid Bun-only runtime APIs. Bun is the package manager, workspace
manager, test/script runner, and bundler; the built CLI targets a documented
supported Node version and uses `#!/usr/bin/env node` (per the same log P11).

## Canonical local artifacts

For a primary worktree at `<primary>` whose directory basename is `<repo>`, the
MVP uses:

```text
<primary>/
├── .config/
│   └── wt.toml
├── .worktreeinclude
└── <repo>.code-workspace
```

There is no manifest and no durable `<git-common-dir>/wtw/` configuration tree.
The standard files themselves are the configuration (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P16).

The shared `<git-common-dir>/info/exclude` contains a clearly delimited,
idempotently managed `wtw` block covering exactly the canonical private paths.
All content outside that block is preserved. A required path already tracked by
Git is a privacy conflict: `init` must not proceed, and `check` reports a
failure. Local excludes do not make tracked files private (per the same log
P24).

### `.worktreeinclude`

When absent, initialization creates a documented scaffold containing at least:

```gitignore
.config/wt.toml
.worktreeinclude

# Add other ignored files and directories below.
```

The user owns and edits the copy policy. `wtw` never guesses or interactively
collects private paths. Both control entries are required so native Worktrunk
configuration remains discoverable from newly created linked worktrees (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P5 and
P16). Worktrunk's default primary-worktree source remains authoritative
regardless of the Git branch used as the new worktree's base.

### `.config/wt.toml`

When absent, initialization scaffolds standard Worktrunk project configuration
with three distinct named commands equivalent to:

```toml
[pre-start]
wtw-copy = "wt step copy-ignored --require-include"

[post-start]
wtw-sync = "wtw sync --open"

[post-remove]
wtw-sync = "wtw sync"
```

The user may add any other valid Worktrunk hooks, aliases, or settings. The
`wtw-copy` key in `pre-start` and the `wtw-sync` key in both post-hook tables,
together with their exact command strings, are the `wtw` contract and must
remain exactly compatible (per
`specs/001/discussions/260711143813Z-review-findings-decision-log.md` P7). `wtw`
never rewrites an existing `.config/wt.toml`: an
existing compatible file is preserved byte-for-byte; a missing or conflicting
required hook causes no-write preflight failure with the exact additions the
user must make before rerunning `init` (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P18).

Worktrunk owns project-command approval. `wtw init` neither grants nor bypasses
approval. Native Worktrunk presents its normal first-use approval prompt and
stores the result in its own approval state (per the same log P8, as retained
after P16 superseded environment activation).

### Cursor workspace

The root workspace is user-editable JSONC. `wtw` owns only its top-level
`folders` property and preserves comments, formatting, property order, and all
unrelated properties through a JSONC-aware edit operation. Invalid JSONC causes
no workspace write and is a diagnostic failure (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P17).

The workspace file stays only in the primary worktree and is not selected by
`.worktreeinclude`. This primary-root, user-editable model intentionally
supersedes the genesis discussion's earlier hidden, fully generated workspace
model (per `specs/001/discussions/260711143813Z-review-findings-decision-log.md`
P6).

Its managed folder list contains every registered worktree whose directory
currently exists. The primary is first. For every remaining entry, the display
name is the full branch name or, for a detached worktree,
`detached@<short-sha>`; entries sort by that display name and then normalized
absolute path. Prunable or missing registrations are excluded, diagnosed as
warnings, and never pruned by `wtw` (per the genesis log P22 and the review
findings log P2).

## Public CLI contract

The complete MVP surface is:

```text
wtw
wtw init
wtw sync [--open]
wtw check
wtw help [command]
wtw -h | --help
wtw -V | --version
```

Bare invocation displays root help. Help and version paths exit 0. `init` and
`check` accept no command-specific options; `sync` accepts only `--open`.
Unknown commands/options and unexpected positional arguments print one
single-line `Error: <message>` to stderr, leave stdout empty, and exit 1.
Expected failures use the same error channel and exit convention. Successful
human-readable output is deterministic (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P15 and
P27).

### `wtw init`

`init` is non-interactive and may run from the primary worktree, a linked
worktree, or any nested directory inside either. It resolves the primary
worktree and common Git directory, then performs a complete predictable-conflict
preflight before writing:

- allowed OS and non-bare repository shape;
- a primary worktree satisfying the explicit predicate below;
- Git, Worktrunk, Cursor, Node/runtime context, and the `wtw` executable used by
  hooks;
- untracked required private paths;
- valid or absent standard artifacts;
- exact required hooks in an existing Worktrunk TOML file;
- validity of existing `.worktreeinclude`, JSONC, and managed exclude content.

Any predictable conflict exits 1 with no writes. After a successful preflight,
`init` creates missing scaffolds, reconciles the managed exclude block, and runs
the same internal blocking synchronization operation as `wtw sync`, without
opening Cursor. It reports created, preserved, synchronized, and unchanged
artifacts concisely; triggers no approval; and prints no generic next-step
advice. A healthy rerun exits 0 and is a no-op apart from reconciliation.
Unexpected filesystem failure reports every completed write, exits 1, and does
not attempt broad destructive rollback (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P25).

### `wtw sync`

`sync` resolves the primary worktree from any supported invocation location,
then acquires one repository-wide cross-process lock under the Git common
directory before enumerating worktrees. It waits for a documented short timeout,
uses an established library's stale-lock policy, writes nothing if acquisition
times out, and always releases the lock in success and error paths.

While holding the lock, it:

1. Atomically copies the primary `.config/wt.toml` and `.worktreeinclude` bytes
   to every linked worktree, overwriting divergent linked control copies because
   primary files are authoritative.
2. Re-enumerates valid Git worktrees and atomically updates only the workspace
   `folders` property.
3. Does not copy any other path selected by `.worktreeinclude`.

If the primary workspace is absent, `sync` recreates its minimal scaffold with
the current managed folders. If it exists as valid JSONC with a top-level
object, `sync` adopts it and preserves everything except the managed `folders`
edit. Invalid JSONC or a non-object top level causes failure without overwriting
the file (per
`specs/001/discussions/260711143813Z-review-findings-decision-log.md` P1 and
P3).

Plain `sync` never opens Cursor. `sync --open` launches `cursor` with the exact
absolute primary-worktree workspace path only after all synchronization writes
succeed. If launch fails after successful writes, the synchronized state remains
and the command exits 1 with the launch error. Direct synchronization blocks
until writes and any launch attempt complete (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P21 and
P23).

Raw `git worktree add` does not run Worktrunk hooks. Its resulting drift is
reported by `check` and repaired by the next explicit `sync`.

### `wtw check`

`check` is read-only, does not acquire the synchronization lock, does not open
Cursor, and aggregates every independently discoverable finding under these
stable categories in order:

```text
Repository
Dependencies
Privacy
Worktrunk
Copy policy
Synchronization
Cursor workspace
```

Findings use `PASS`, `WARN`, or `FAIL`. The command exits 0 when no failure
exists, including when warnings exist; exits 1 when at least one failure exists;
and ends with deterministic severity counts. It continues when prerequisites
permit and marks dependent checks skipped instead of emitting cascading false
failures. JSON output is not included (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P24).

Failures include unsupported context, unavailable required executables, a
primary/common Git directory that fails the explicit repository predicate,
incompatible or unparseable Worktrunk,
missing/invalid/tracked/unexcluded required artifacts, missing or modified
reserved hooks/control entries, divergent linked control copies, invalid JSONC,
and workspace-folder drift. Warnings include Linux's unverified/best-effort
platform status, newer unverified Worktrunk,
nonmatching or absent optional include selections, stale Git registrations, and
ignored optional Cursor metadata. A check observes one read snapshot and may
naturally report transient drift during concurrent synchronization.

## Lifecycle behavior

The blocking `pre-start` copy command makes selected ignored files and both
control files part of worktree readiness. Native Worktrunk failure semantics
govern a failed copy (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P28).

The `post-start` `wtw sync --open` command is a Worktrunk background hook.
Worktrunk may return before Cursor opens. Failure does not undo the new worktree;
the repair path is `wtw check` followed by `wtw sync --open`.

The `post-remove` `wtw sync` command is also background. Failure may leave
temporary workspace/control drift but does not compete with removal. A normal
`wt merge` that removes its source uses Worktrunk's existing post-remove
lifecycle. `wt merge --no-remove`, `--no-hooks`, failures before cleanup, and raw
Git operations retain native behavior and receive no automatic compensation;
explicit check/sync is the repair path.

## Compatibility and safety constraints

- macOS is the only officially supported and verified MVP operating system.
  Linux execution remains allowed but is explicitly unverified/best-effort;
  Linux becomes supported only after the same suites pass there. Windows is
  unsupported. CI is deferred (per
  `specs/001/discussions/260711143813Z-review-findings-decision-log.md` P8).
- Supported repositories are standard non-bare Git repositories whose primary
  worktree satisfies all of these predicates: Git reports the repository as
  non-bare; `git worktree list --porcelain` reports a main/primary worktree
  record; that record is not prunable; its absolute path exists as a directory;
  and Git repository-root discovery at that path resolves to the same primary
  path. Failure is an unsupported repository-shape error with no writes.
  Read/write permission failures after discovery are ordinary command failures
  (per
  `specs/001/discussions/260711143813Z-review-findings-decision-log.md` P4).
  Invocation from primary, linked, and nested directories is required.
- Sibling worktrees and paths containing spaces or unusual non-NUL characters
  are required. Structured subprocess arguments must be used instead of shell
  command construction wherever the fixed Worktrunk hook strings do not require
  shell syntax.
- Git, Worktrunk, Cursor, Node, and `wtw` are resolved through `PATH`.
- The initial verified Worktrunk range is `>=0.62.0 <0.63.0`; the real contract
  suite pins v0.62.0. Older and unparseable versions fail `check`. v0.63.0 and
  newer warn as unverified but are not blocked. Expanding the verified range
  requires a passing real contract suite plus requirement/living-doc updates
  (per
  `seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P19 and
  P20).
- Atomic replacement must prevent partially written canonical, linked-control,
  or workspace files.
- `check` and predictable `init` failures are non-mutating.
- No operation runs Git prune, deletes a worktree, edits global Worktrunk config,
  grants command approval, or modifies user-selected ignored data.

## Build, version, and local installation

The semantic version comes from `packages/cli/package.json`. Source execution
prints exactly `<version> (dev)` for `--version` and `-V`. A bundled build injects
`WTW_GIT_SHA` from `git rev-parse --short HEAD` and prints exactly
`<version> (<short-sha>)`. A build without a resolvable Git SHA fails clearly;
there is no dirty-tree suffix (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P14).

The build creates a self-contained Node-targeted CLI bundle containing
`@wtw/core`. Local installation is documented as a direct symlink from
`~/.local/bin/wtw` to that bundle. Documentation states that `~/.local/bin` must
be on `PATH`, rebuilding updates the command through the symlink, and removing
the symlink uninstalls it. Packages remain private (per the same log P26).

## Executable behavior documentation and verification

Externally observable CLI behavior is defined in structured functional
requirements and declarative E2E case manifests under `packages/cli`. The exact
case grouping may follow the domain, but the architecture must include:

```text
packages/cli/
├── requirements/functional/
├── test/e2e/cases/
├── test/e2e/harness/
├── scripts/living-docs.ts
├── scripts/generate-living-docs.ts
└── docs/BEHAVIOR.md
```

Requirements and cases are authored; `BEHAVIOR.md` is deterministic generated
output and is never hand-edited. Every active observable acceptance criterion
must have at least one case reference. Manifests and traceability are strictly
validated. The document exposes relevant fixtures, invoked commands, dependency
mode, exact expected streams, exit codes, and expected file outputs. Deferred and
removed requirements retain explicit statuses. A generation command writes the
document; its `--check` form exact-compares bytes and fails on drift (per
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P12).

One harness supports two labelled automated modes (per the same log P13):

- Fast behavior E2E cases run the real `wtw` entrypoint in isolated temporary
  environments, use real Git when inexpensive and relevant, and use declared
  fake Worktrunk/Cursor executables for deterministic behavior and failure
  injection.
- A small external-contract suite uses real Git, a pinned real Worktrunk v0.62.0
  binary, isolated home/config/approval state, the built `wtw` artifact, and a
  fake Cursor. At least one scenario proves initialization, native approval,
  blocking ignored-file/control copying, post-start workspace synchronization,
  removal invoked from a linked worktree, and post-remove reconciliation.

Every rendered case states, for example, `real Git`, `simulated Worktrunk`, and
`simulated Cursor`; simulated evidence must never be presented as real lifecycle
proof. A manual release checklist verifies only that a supported real Cursor
opens/focuses the named workspace. Automated tests never open the GUI.

Root quality commands cover formatting/linting, type checking, package tests,
fast E2E, external contracts, living-document regeneration/checking, build, and
a full test-and-report gate. The full local macOS gate runs both E2E modes and
the living-document drift check; CI is not required in the MVP. Pure core edge
cases may use focused tests, but observable acceptance is established through
E2E coverage.

## Acceptance criteria

Each criterion is machine-checkable. The cited P-number is its decision-log
traceability source; implementation requirements and E2E manifests must retain
one-to-one identifiers or an explicit mapping to these criteria.

### FR-01 — Workspace architecture and runtime

- **AC-01.1:** A clean dependency install recognizes a private Bun workspace
  containing `packages/core` and `packages/cli`, and the CLI consumes core through
  a workspace dependency. (P9, P10)
- **AC-01.2:** Dependency-boundary tests prove `@wtw/core` imports no CLI,
  process-argument, subprocess, terminal-output, or filesystem-effect modules.
  (P10)
- **AC-01.3:** Formatting/linting, strict type checking, and tests run through
  root aggregate scripts using the agreed Jastr-derived toolchain. (P15)
- **AC-01.4:** The bundled CLI runs under the documented supported Node runtime
  without Bun installed and contains no unresolved `@wtw/core` runtime import.
  (P11, P26)

### FR-02 — CLI surface and error envelope

- **AC-02.1:** Bare `wtw`, root/command help, `-h`, and `--help` print the
  corresponding help and exit 0. (P27)
- **AC-02.2:** Only `init`, `sync [--open]`, and `check` are accepted product
  commands; every excluded command/flag and unexpected positional argument exits
  1 with exactly one `Error: <message>` line on stderr and empty stdout. (P15,
  P27)
- **AC-02.3:** `init` and `check` reject every command-specific option; `sync`
  accepts only `--open`. (P27)

### FR-03 — Repository resolution and support boundary

- **AC-03.1:** E2E cases invoke every product command successfully from the
  primary root, a nested primary directory, a linked root, and a nested linked
  directory, with all operations resolving the same primary/common Git context.
  (P19, P25)
- **AC-03.2:** macOS cases cover repository/worktree paths containing spaces
  without argument splitting or path corruption. (P19; review findings P8)
- **AC-03.3:** A simulated Linux platform reports its unverified/best-effort
  status without claiming suite evidence, while bare repositories,
  missing-primary contexts, Windows, and
  non-repository directories produce deterministic unsupported/error findings
  without writes. (P19, P24, P25; review findings P8)
- **AC-03.4:** Repository-shape cases independently fail each primary predicate
  (bare, absent main record, prunable main record, missing path, mismatched root)
  without writes, while a post-discovery permission failure is reported as an
  ordinary command failure. (review findings P4)

### FR-04 — Initialization preflight and idempotency

- **AC-04.1:** Each predictable conflict enumerated by the `init` contract exits
  1 and leaves the complete fixture byte-for-byte unchanged. (P18, P24, P25)
- **AC-04.2:** On an empty supported repository, `init` creates exactly the
  canonical TOML, include, workspace, and managed exclude content, synchronizes
  existing linked worktrees, does not launch Cursor or approval, and exits 0.
  (P16, P21, P25)
- **AC-04.3:** Rerunning `init` on healthy setup exits 0, preserves user-authored
  bytes outside managed regions, and makes no semantic change beyond required
  reconciliation. (P7 as superseded by P16, P17, P25)
- **AC-04.4:** An injected post-write filesystem failure exits 1 and reports the
  writes completed before failure without attempting broad deletion/rollback.
  (P25)

### FR-05 — Privacy and local exclude ownership

- **AC-05.1:** Initialization creates/reconciles one delimited local-exclude
  block containing all required private paths while preserving all unrelated
  `info/exclude` bytes. (P3, P16, P25)
- **AC-05.2:** If any required private path is tracked, `init` performs no writes
  and `check` emits a `FAIL`; no tracked repository file is introduced by a
  successful initialization. (P24)
- **AC-05.3:** Reconciliation of an existing valid managed block is idempotent
  and never duplicates its entries. (P7, P25)

### FR-06 — Worktrunk configuration and customization

- **AC-06.1:** A missing `.config/wt.toml` is scaffolded with exact distinct
  blocking-copy, post-start-sync/open, and post-remove-sync commands. (P16, P28)
- **AC-06.2:** An existing TOML file with all reserved hooks is preserved
  byte-for-byte, including unrelated custom hooks, comments, order, and settings.
  (P16, P18)
- **AC-06.3:** An existing TOML missing or conflicting with a reserved hook makes
  `init` perform no writes and print the exact manual additions; after the fixture
  is manually corrected, rerun succeeds without rewriting it. (P18)
- **AC-06.4:** Initialization neither invokes nor mutates Worktrunk approval;
  the real contract case observes native first-use approval in isolated
  Worktrunk state. (P8)

### FR-07 — Copy policy

- **AC-07.1:** A scaffolded `.worktreeinclude` contains the two required control
  paths and explanatory user-editing guidance, without guessed private-data
  entries. (P5, P16)
- **AC-07.2:** `check` fails when either required control entry is absent and
  warns, rather than fails, for a user entry that currently matches no existing
  ignored content. (P5, P24)
- **AC-07.3:** The real contract scenario proves native Worktrunk copies selected
  ignored data and both control files from the primary before creation readiness,
  including when the new branch base is a linked-worktree branch. (P6 as
  superseded in file propagation by P16, P28)

### FR-08 — Synchronization and concurrency

- **AC-08.1:** `sync` atomically makes every linked `.config/wt.toml` and
  `.worktreeinclude` byte-identical to the primary copies, overwriting divergent
  linked control copies. (P16, P23)
- **AC-08.2:** `sync` does not create, modify, or overwrite any other
  user-selected `.worktreeinclude` path. (P23)
- **AC-08.3:** Two deliberately overlapping sync processes serialize through one
  common-directory lock and finish with folders derived from the final Git state,
  with no stale older snapshot written last. (P23)
- **AC-08.4:** Lock timeout exits 1 without file writes; injected errors release
  the lock; a library-recognized stale lock is recoverable according to the
  documented policy. (P23)
- **AC-08.5:** A linked worktree made by raw Git is reported as drift, then gains
  canonical control files and a workspace entry after explicit sync. (P25)

### FR-09 — Cursor workspace preservation and reconciliation

- **AC-09.1:** `init` creates a missing
  `<primary-directory-name>.code-workspace`; adopts an existing valid-JSONC
  top-level object while preserving everything outside `folders`; and fails
  without writes for invalid JSONC or a non-object top level. (P17, P25; review
  findings P1)
- **AC-09.2:** Synchronization modifies only top-level `folders` in valid JSONC
  and preserves comments, formatting, property order, and all unrelated
  properties byte-for-byte where they are outside the edit span. (P17)
- **AC-09.3:** Invalid JSONC causes sync to exit 1 without changing the workspace
  and causes `check` to emit a failure. (P17, P24)
- **AC-09.4:** The resulting folder list contains the primary first and every
  existing linked worktree sorted by display name and then normalized absolute
  path, using deterministic branch and detached labels. (P22; review findings
  P2)
- **AC-09.5:** Missing/prunable registrations are excluded, produce check
  warnings with native cleanup guidance, and are not pruned by any `wtw`
  command. (P22, P24)
- **AC-09.6:** Plain `sync` recreates a missing workspace with the minimal
  scaffold and current folders; `sync --open` may open it after the successful
  write; and `check` reports the file missing before repair. (review findings
  P3)

### FR-10 — Cursor launch behavior

- **AC-10.1:** `init`, `check`, and plain `sync` never invoke Cursor. (P21)
- **AC-10.2:** `sync --open` invokes the fake Cursor exactly once with the exact
  absolute root workspace path and only after successful writes. (P21, P23)
- **AC-10.3:** A simulated Cursor launch failure after writes preserves the
  synchronized files and exits 1 with the launch error. (P21)
- **AC-10.4:** The manual release check records successful open/focus behavior
  with a supported real Cursor; automated suites never launch the GUI. (P13)

### FR-11 — Diagnostics

- **AC-11.1:** A healthy fixture prints every stable category in order, contains
  only pass findings, prints deterministic counts, performs no writes or Cursor
  call, and exits 0. (P21, P24)
- **AC-11.2:** A warning-only fixture exits 0; each defined failure fixture exits
  1; both print aggregate counts matching emitted findings. (P24)
- **AC-11.3:** A fixture with an unavailable prerequisite marks dependent checks
  skipped and does not emit misleading cascaded failures. (P24)
- **AC-11.4:** A filesystem before/after snapshot proves `check` never changes
  repository, Worktrunk, approval, lock, or Cursor state. (P24)

### FR-12 — Worktrunk compatibility

- **AC-12.1:** Parsed versions `0.62.0` and later `0.62.x` fixtures pass the
  compatibility finding; a version below `0.62.0` fails; `0.63.0` and a later
  version warn but do not fail; unparseable output fails. (P20)
- **AC-12.2:** The external-contract suite uses a real v0.62.0 binary and passes
  before the verified range is represented as supported in the living document.
  (P13, P20)

### FR-13 — Lifecycle integration

- **AC-13.1:** The real Worktrunk scenario proves selected ignored content exists
  before a successful create command returns, while the fake Cursor records the
  post-start exact workspace open invocation. (P28)
- **AC-13.2:** Removing from a linked worktree through real Worktrunk leaves the
  root workspace without the removed path after the background hook completes.
  (P13, P28)
- **AC-13.3:** Fast cases demonstrate repair after simulated background failure,
  `--no-hooks`, and raw Git drift through explicit `check` and `sync`. (P28)

### FR-14 — Living behavior document

- **AC-14.1:** Strict schema tests reject invalid requirement/case manifests,
  unknown fields, unsafe fixture paths, invalid coverage references, and active
  acceptance criteria with no E2E case. (P12)
- **AC-14.2:** The behavior generator deterministically renders requirements,
  criteria, fixtures, commands, dependency modes, exact streams, exit codes, and
  output files; `--check` fails on any byte drift and writes nothing. (P12, P13)
- **AC-14.3:** Every active observable criterion in FR-02 through FR-13 has an E2E
  case mapping, and the living document visibly distinguishes real and simulated
  Git, Worktrunk, and Cursor evidence. (P12, P13)
- **AC-14.4:** The full test-and-report command runs formatting/linting,
  typechecking, package tests, fast E2E, the real external contract, behavior-doc
  drift, and build, and exits nonzero when any stage fails. (P12, P13, P15)

### FR-15 — Version, build, and local use

- **AC-15.1:** Source-run `--version` and `-V` print exactly the CLI package
  version followed by ` (dev)` and exit 0. (P14)
- **AC-15.2:** A build test injects a known short SHA and the resulting bundle
  prints exactly `<package-version> (<known-sha>)`; building with no resolvable
  Git SHA fails clearly. (P14)
- **AC-15.3:** The bundle has a Node shebang, is self-contained, and runs with the
  supported Node runtime without Bun. (P11, P26)
- **AC-15.4:** Following the documented symlink procedure makes `wtw` available
  through `PATH`, a rebuild changes its reported embedded SHA without reinstall,
  and removing the symlink removes the command. (P26)

## Coverage and traceability

FR-01 covers the workspace/package/runtime architecture; FR-02 the complete CLI
surface; FR-03 supported contexts; FR-04 initialization; FR-05 privacy; FR-06
customizable Worktrunk configuration; FR-07 copy policy; FR-08 synchronization
and races; FR-09/FR-10 Cursor state and launching; FR-11 diagnostics; FR-12
compatibility; FR-13 real lifecycle behavior; FR-14 executable documentation;
and FR-15 build/install identity. Together they cover every observable behavior
and constraint in this specification.

Each AC cites the source P-number(s) from
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md`. The E2E
requirement files and `covers` references are the downstream executable mapping;
an implementation is not acceptable while any active observable AC lacks a
case.

## Unresolved questions

No unresolved product-behavior question blocks implementation. Public licensing,
registry/release distribution, exact future editor support, and the second
thread's wrapper/workflow design are intentionally outside this specification
and require later decisions.

## Degrees of freedom

The implementer may choose the following implementation details, provided every
constraint and acceptance criterion above remains true:

- Exact supported Node baseline and pinned Bun/tool dependency versions, as long
  as they are documented, tested by the required local gate, Node-compatible,
  and compatible with the agreed Jastr-derived stack.
- The initial semantic package version.
- Exact file/module names below the fixed `core`/`cli` responsibility boundary.
- TOML parser, JSONC editor, atomic-write utility, and cross-process locking
  library.
- The synchronization lock's exact path, wait duration, retry cadence, and
  library-supported stale threshold, provided they are repository-wide,
  documented, deterministic in tests, and satisfy FR-08.
- Exact success, warning, skip, and summary wording and terminal styling, except
  for pinned version output, the `Error: <message>` failure envelope, stable check
  category order/severities, exact scaffold commands, and outputs explicitly
  asserted by this specification.
- Exact requirement-file grouping, E2E case decomposition, fixture substitution
  vocabulary, and full-report script name, provided traceability, evidence
  labels, generated-document content, and all required quality stages remain
  intact.
- Whether pure-core edge cases use Vitest unit tests, property tests, or both;
  externally observable behavior must still be covered through the E2E model.
- Exact local-exclude block marker spelling and workspace JSONC formatting for a
  newly created file, provided both remain deterministic and idempotent.
