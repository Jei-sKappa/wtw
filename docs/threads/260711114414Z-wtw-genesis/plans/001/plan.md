# Plan: WorkTrunk Wrapper (`wtw`) MVP

## Objective and context

Build the first usable `wtw` from an empty repository to a working,
Node-runnable CLI with `init`, `sync`, and `check` commands, a pure
`@wtw/core` / effectful `@wtw/cli` Bun workspace, a Jastr-style living-behavior
document system, fast behavior E2E coverage, a real Worktrunk v0.62.0
external-contract suite, and documented symlink installation.

`wtw` is a private per-clone setup companion for Worktrunk. It does not change
Worktrunk's worktree lifecycle: it initializes local automation, keeps the
standard control files (`.config/wt.toml`, `.worktreeinclude`) and a Cursor
multi-root workspace synchronized across worktrees, and diagnoses drift. All
local automation stays out of commits via a managed `info/exclude` block.

The repository already contains the Jastr reference implementation at
`.library/sources/Jei-sKappa_jastr/` (gitignored). It is the authoritative model
for every convention this spec cites — workspace layout, `tsconfig`/`biome`/
`vitest` config, the `buildProgram()` + `index.ts` + `args.ts` + `errors.ts` +
`version.ts` CLI shape, the E2E harness (`case-manifest.ts`, `requirements.ts`,
`case-runner.ts`, `traceability.ts`), the requirement/case YAML manifests, and
the `living-docs.ts` / `generate-living-docs.ts` generator. Tasks reference it as
`<jastr-ref>/…` meaning
`.library/sources/Jei-sKappa_jastr/packages/…`. Study the corresponding Jastr
file before writing its `wtw` analogue; adapt names to the `wtw` domain rather
than copying `jastr` semantics.

The core/cli responsibility split is fixed by the spec; individual file and
module names below that boundary are the implementer's choice (Degrees of
freedom). Library choices (TOML parser, JSONC editor, atomic-write utility,
cross-process lock) are the implementer's, subject to the FR-08 constraints.

Source: specs/001/spec.md

## Global Constraints

Copied from the spec's "Compatibility and safety constraints" and the
architecture invariants it states:

- macOS is the only officially supported and verified MVP operating system. Linux execution remains allowed but is explicitly unverified/best-effort; Linux becomes supported only after the same suites pass there. Windows is unsupported. CI is deferred.
- Supported repositories are standard non-bare Git repositories whose primary worktree satisfies all of these predicates: Git reports the repository as non-bare; `git worktree list --porcelain` reports a main/primary worktree record; that record is not prunable; its absolute path exists as a directory; and Git repository-root discovery at that path resolves to the same primary path. Failure is an unsupported repository-shape error with no writes. Read/write permission failures after discovery are ordinary command failures. Invocation from primary, linked, and nested directories is required.
- Sibling worktrees and paths containing spaces or unusual non-NUL characters are required. Structured subprocess arguments must be used instead of shell command construction wherever the fixed Worktrunk hook strings do not require shell syntax.
- Git, Worktrunk, Cursor, Node, and `wtw` are resolved through `PATH`.
- The initial verified Worktrunk range is `>=0.62.0 <0.63.0`; the real contract suite pins v0.62.0. Older and unparseable versions fail `check`. v0.63.0 and newer warn as unverified but are not blocked. Expanding the verified range requires a passing real contract suite plus requirement/living-doc updates.
- Atomic replacement must prevent partially written canonical, linked-control, or workspace files.
- `check` and predictable `init` failures are non-mutating.
- No operation runs Git prune, deletes a worktree, edits global Worktrunk config, grants command approval, or modifies user-selected ignored data.
- `@wtw/core` must not read process arguments, inspect the current working directory, spawn commands, perform filesystem writes, format terminal output, or set exit codes. `@wtw/cli` owns all effects and interfaces.
- Source must avoid Bun-only runtime APIs. Bun is the package manager, workspace manager, test/script runner, and bundler; the built CLI targets a documented supported Node version and uses `#!/usr/bin/env node`.
- Every active observable acceptance criterion must have at least one E2E case reference; observable acceptance is established through the E2E model, not unit tests. Rendered cases must label real vs simulated Git/Worktrunk/Cursor evidence, and simulated evidence must never be presented as real lifecycle proof. Automated tests never open the Cursor GUI.

## Tasks

1. **Workspace and toolchain scaffold** — stand up the private Bun workspace, `@wtw/core` + `@wtw/cli`, shared config, aggregate scripts, and the dependency-boundary test. → `tasks/01-workspace-scaffold.md`
2. **CLI skeleton: program, argv validation, error envelope, version** — `buildProgram()` with `init`/`sync`/`check`, the single-line `Error:` envelope, and source `--version`. → `tasks/02-cli-skeleton.md`
3. **E2E harness and living-doc schema foundation** — manifest/requirements validators, the case runner, fake executables, and the first CLI-surface/version cases. → `tasks/03-e2e-harness.md`
4. **Core: repository and worktree model + Git porcelain parsing** — pure models, `git worktree list --porcelain` parsing, and the primary-worktree predicate. → `tasks/04-core-repo-model.md`
5. **CLI: repository resolution and support boundary** — resolve primary/common Git context from any location, enforce the support predicate, with FR-03 resolver unit coverage (observable FR-03 E2E authored in Task 13). → `tasks/05-cli-repo-resolution.md`
6. **Core: managed local-exclude block** — idempotent delimited `info/exclude` block transform over supplied text. → `tasks/06-core-exclude-block.md`
7. **Core: Worktrunk scaffold, hook compatibility, and version range** — TOML scaffold generation, reserved-hook compatibility over supplied text, and the version-compatibility finding. → `tasks/07-core-worktrunk.md`
8. **Core: copy-policy scaffold and entry checks** — `.worktreeinclude` scaffold and required-entry/optional-match findings. → `tasks/08-core-copy-policy.md`
9. **Core: workspace folder calculation and JSONC folders edit** — deterministic folder list, labels, and a JSONC-preserving `folders` edit. → `tasks/09-core-workspace.md`
10. **CLI: `wtw sync`** — repository-wide lock, atomic control-file propagation, and workspace `folders` reconciliation, with FR-08/FR-09 E2E cases. → `tasks/10-cli-sync.md`
11. **CLI: `wtw sync --open`** — launch Cursor once with the absolute workspace path after successful writes, with FR-10 E2E cases. → `tasks/11-cli-sync-open.md`
12. **CLI: `wtw init`** — predictable-conflict preflight, scaffold creation, exclude reconciliation, internal blocking sync, and idempotency, with FR-04 E2E cases. → `tasks/12-cli-init.md`
13. **CLI: `wtw check`** — read-only aggregate diagnostics across the stable categories with severities, counts, and skips, with FR-03/FR-11/FR-12 E2E cases. → `tasks/13-cli-check.md`
14. **Build, version SHA injection, and local install** — Node-targeted bundle, `WTW_GIT_SHA` injection, `<version> (<sha>)` output, and the documented symlink install. → `tasks/14-build-and-install.md`
15. **External-contract suite (real Worktrunk v0.62.0)** — the second harness mode proving real initialization, approval, blocking copy, and lifecycle reconciliation against the built artifact. → `tasks/15-external-contract-suite.md`
16. **Living-doc generator, traceability, and full report gate** — `BEHAVIOR.md` generation with `--check`, complete FR-02..FR-13 traceability, and the aggregate test-and-report script. → `tasks/16-living-docs-and-gate.md`
