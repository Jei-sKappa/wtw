# Decision log — wtw product scope and MVP (the seed)

Thread: docs/threads/260711114414Z-wtw-genesis/
Target: the seed
Subject: defining the product scope and minimum viable delivery boundaries for the initial wtw implementation.

## P1: Implementation scope and thread split

Point: Decide how to divide `wtw` into independently specified and implemented threads without creating unnecessary workflow overhead.

What you need to know: The product contains two strongly related but differently risky areas:

- The foundation: repository discovery, private state under the Git common directory, Worktrunk lifecycle integration, delegation, locking, diagnostics, and shell behavior.
- The user workflow: Cursor workspace synchronization, thread discovery, branch derivation, prompt construction, and agent launching.

The second area depends on the first, but building only the foundation risks producing plumbing without validating the intended user experience. Conversely, specifying everything as one implementation unit would make architectural failures expensive to unwind and give a junior developer too many interacting uncertainties at once.

Decision: Divide the work into two threads. The first thread will implement the private Worktrunk foundation, including a thin end-to-end lifecycle proof. The second thread will build the complete interactive workflow, including editor integration, thread selection, worktree creation, prompt construction, and agent launching.

Rationale: This keeps process overhead to two threads while isolating the highest-risk Worktrunk and private-state architecture before building the complete user experience. Requiring the first thread to prove real worktree creation and removal avoids delivering internal plumbing with no demonstrated lifecycle value.

## P2: MVP configuration activation

Point: Decide how the first MVP activates its private Worktrunk configuration while preserving native Worktrunk commands.

What you need to know: Manual use of `WORKTRUNK_PROJECT_CONFIG_PATH` avoids modifying Worktrunk’s user configuration and postpones wrapper and shell-integration work. `wtw init` can print the exact command to export the repository’s absolute configuration path. If the variable is absent, native Worktrunk will not run the private lifecycle hooks, so this MVP must clearly expose that limitation and provide a command that verifies whether activation is correct.

Decision: For the first MVP, use native `wt` with an explicitly supplied or shell-exported `WORKTRUNK_PROJECT_CONFIG_PATH`. Do not edit global Worktrunk configuration and do not implement transparent passthrough yet.

Rationale: This validates the shared private configuration, file-copying, and editor-integration architecture without first solving wrapper shell integration or modifying persistent global state. The user accepts that forgetting the environment variable will bypass `wtw` automation during this experimental MVP; transparent passthrough can remove that hazard later.

## P3: Private copy configuration

Point: Decide whether the MVP may keep local `wtw` configuration files inside worktrees and hide them through Git’s local exclude file.

What you need to know: `.git/info/exclude` is clone-local, untracked, and shared by the linked worktrees through their Git common directory. Rules placed there do not affect collaborators, commits, clones, or forks.

This permits `wtw init` to create a root-level `.worktreeinclude` and add it to `.git/info/exclude`. The include file can select ignored files and include itself:

```gitignore
.worktreeinclude
.env
temp/
.library/
```

The generated private Worktrunk configuration can then call:

```toml
[pre-start]
copy-ignored = "wt step copy-ignored --require-include"
```

That reuses Worktrunk’s established copying behavior, including Git-ignore semantics, safe handling of existing destination files, and copy-on-write support. We avoid implementing a second file-copy engine in `wtw`.

`wtw init` should manage a clearly marked block in `.git/info/exclude`, preserving all existing user rules. A later disable/uninstall operation should remove only that managed block. The configuration passed through `WORKTRUNK_PROJECT_CONFIG_PATH` can still live under `<git-common-dir>/wtw/`; only files that benefit from being worktree-local need to live in the checkout.

Decision: Use `.git/info/exclude` for the MVP. Create `.worktreeinclude` in the primary worktree, ignore it locally, and include `.worktreeinclude` in its own copy patterns so newly created worktrees receive it. Keep the generated private Worktrunk configuration under the Git common directory.

Rationale: The clarified privacy requirement is that collaborators must not receive or normally see the local automation, rather than that every operational file must live outside worktree content. This model meets that requirement and reuses Worktrunk's validated copy engine instead of implementing competing copy semantics.

## P4: Cursor workspace behavior

Point: Decide how the MVP represents the repository in Cursor and reacts to worktree lifecycle changes.

What you need to know: Cursor’s `--add` and `--remove` commands affect the last active window, which is unreliable when several projects are open. A named multi-root `.code-workspace` file provides deterministic project targeting.

The safest synchronization model is to rebuild its folder list from:

```sh
git worktree list --porcelain
```

after creation or removal. This avoids stale incremental state and also repairs changes made outside the expected lifecycle whenever synchronization is run.

The workspace file can live under:

```text
<git-common-dir>/wtw/workspaces/<repository-name>.code-workspace
```

and contain absolute paths to every worktree. Because it is generated private state, `wtw` can own the entire file in the MVP rather than attempting JSONC-preserving edits of user-managed settings.

Decision: `wtw init` will create and initially synchronize one `wtw`-owned Cursor multi-root workspace under the Git common directory. `post-start` will rebuild and open or focus that exact workspace, while `post-remove` will rebuild it without opening or focusing Cursor. `wtw workspace sync` will provide manual reconciliation for lifecycle changes made outside configured Worktrunk operations. Cursor is the only MVP editor, but its behavior will remain separate from repository discovery and copying logic.

Rationale: A named workspace deterministically targets the correct project, unlike Cursor's last-active-window `--add` and `--remove` behavior. Full regeneration from Git's authoritative state prevents stale incremental state, while complete `wtw` ownership avoids JSONC-preserving edits in the MVP.

## P5: Initialization and configuration validation

Point: Decide whether initialization collects copy patterns interactively or scaffolds an editable configuration that a separate command validates.

What you need to know: Copy patterns are repository-specific and may include secrets, large caches, or files that do not currently exist. Automated discovery and interactive selection add complexity while still requiring user judgment. A read-only diagnostic command would also be useful beyond copying because the MVP depends on several external and local conditions.

Decision: `wtw init` will create a documented `.worktreeinclude` scaffold for the user to edit directly and will not collect copy patterns interactively. A separate read-only `wtw check` command will validate the Git repository and common-directory resolution, private state, local exclude rules, include patterns and their ignored status, current environment activation, Worktrunk and Cursor availability, generated hook configuration, and Cursor workspace reconciliation. Non-matching include patterns will be warnings rather than failures, and `check` will suggest remedies without changing state.

Rationale: Scaffolding keeps initialization deterministic and leaves security- and cost-sensitive copy selection with the user. A reusable read-only diagnostic boundary provides broader value for setup verification, automated testing, and support without introducing premature repair behavior.

## P6: Source of copied private files

Point: Decide whether new worktrees copy ignored files from the primary worktree or from the worktree used as their Git base.

What you need to know: Using the primary worktree provides one canonical source for private files and one canonical `.worktreeinclude`. Using the base worktree allows local ignored-file changes to propagate into child worktrees, but requires `.worktreeinclude` in every possible source worktree and permits its copies to diverge.

Decision: New worktrees will always copy selected ignored files from the primary worktree. The primary worktree will hold the only `.worktreeinclude`; the file will not include itself in its copy patterns. The Git base used to create a branch will not alter the ignored-file source.

Rationale: A single authoritative copy policy and source is simpler and more predictable, matches Worktrunk's default behavior, and avoids divergent `.worktreeinclude` copies. Copying from arbitrary linked worktrees can be introduced later as an explicit override if a concrete workflow requires it.

## P7: Safe and repeatable initialization

Point: Decide how `wtw init` behaves when run from linked worktrees, run repeatedly, or encounter files it did not create.

What you need to know: Initialization touches several differently owned locations:

- The primary worktree’s `.worktreeinclude`.
- The shared `.git/info/exclude`.
- Private generated files under `<git-common-dir>/wtw/`.
- A generated Cursor workspace.
- Potentially pre-existing files with the same names.

Silently overwriting an existing `.worktreeinclude` could destroy a manual or team-owned configuration. Refusing every rerun would make initialization and recovery unnecessarily brittle.

Decision: `wtw init` may run from the primary or any linked worktree and will resolve and report the primary worktree as the configuration owner. It will be idempotent for artifacts marked as `wtw`-owned, regenerate owned derived files, preserve and adopt an existing unowned `.worktreeinclude`, and never rewrite its user-edited patterns. A tracked `.worktreeinclude` will be used as shared policy without a redundant exclude rule; `check` will report that it is not private. Unrecognized conflicts under the private state directory will stop initialization rather than be overwritten. The `.git/info/exclude` update will use a delimited managed block and preserve unrelated content. Writes will be atomic, and partial failure will report exactly what was created rather than attempt broad rollback.

Rationale: This makes initialization safely repeatable and compatible with existing Worktrunk conventions while maintaining explicit ownership boundaries. It prevents data loss, supports recovery, and avoids surprising edits when initialization is launched from a linked worktree.

## P8: Worktrunk hook approval

Point: Decide whether `wtw init` should trigger Worktrunk’s project-command approval or leave approval to the first native Worktrunk operation.

What you need to know: Supplying a private file through `WORKTRUNK_PROJECT_CONFIG_PATH` changes its location, but Worktrunk still treats its hooks as project commands. On first use, Worktrunk displays the commands and asks for approval. If accepted, that decision is stored in Worktrunk’s personal approvals file; changing a generated command requires approval again.

This is distinct from modifying the Worktrunk user configuration, but it is still persistent user-level state owned by Worktrunk.

Decision: `wtw init` will not trigger or bypass approval. It will preview the generated hook commands and print the activation and first-use instructions. The first activated native Worktrunk operation will present and persist approval through Worktrunk's normal security flow. `wtw check` may report observable approval status but will never grant approval.

Rationale: This preserves Worktrunk's native trust boundary, minimizes MVP orchestration and persistent side effects, and lets the user approve commands at the moment they would execute. The accepted trade-off is an approval prompt during the first configured Worktrunk operation.

## P9: Implementation language and packaging

Point: Choose the implementation language for the initial `wtw` executable.

What you need to know: The MVP needs reliable subprocess execution, path handling, atomic file updates, TOML generation, JSON output, Git inspection, and a distributable CLI. It does not need a web runtime or extensive application framework. A future interactive selector or TUI should remain possible, but we should not optimize primarily for that yet.

Decision: Implement `wtw` in TypeScript using Bun as the standard runtime, package manager, workspace manager, and bundler. Use `.library/sources/Jei-sKappa_jastr` as the principal structural and tooling reference, subject to separate decisions about which conventions fit `wtw`.

Rationale: The owner wants `wtw` to follow the same Bun-based CLI development standard used across their projects. The Jastr reference provides an established local convention for workspace organization, executable bundling, living behavior documentation, end-to-end testing, and build-time version metadata.

## P10: Initial package boundary

Point: Decide how to split the Bun workspace into packages without creating speculative abstractions.

What you need to know: Jastr uses a private Bun workspace with a pure engine package and a CLI package. Its important rule is responsibility separation, not the literal name `engine`:

- The reusable package knows nothing about CLI arguments, current working directories, process exits, or terminal output.
- The CLI owns argument parsing, subprocess execution, filesystem access, messages, and exit codes.
- The workspace root owns aggregate build, test, formatting, type-checking, and documentation scripts.

For `wtw`, editor plugins and workflow plugins do not yet justify independent packages.

Decision: Create a private Bun workspace with `packages/core` and `packages/cli`. `@wtw/core` will own pure repository/worktree models, parsing and transformation logic, generated configuration and workspace documents, initialization plans, and structured diagnostics. `@wtw/cli` will own the executable, arguments, subprocesses, filesystem and environment effects, atomic writes, output, and exit codes. Git, Worktrunk, and Cursor integrations will remain focused CLI modules until an independently useful package boundary emerges.

Rationale: This gives the project an honest reusable/testable core and a clear effects boundary while satisfying the monorepo direction with only two meaningful packages. Splitting every external integration into its own package now would add ceremony without independent consumers.

## P11: Bun toolchain versus Bun runtime

Point: Decide whether built `wtw` artifacts require Node.js, require Bun, or embed a runtime.

What you need to know: Jastr uses Bun as its package manager and bundler, but its production bundle targets Node and starts with:

```sh
#!/usr/bin/env node
```

Its source intentionally avoids Bun-specific runtime APIs. Thus “built with Bun” does not mean “runs on Bun.”

Decision: Follow Jastr's runtime model for the initial implementation. Use Bun for workspace management, scripts, tests, and bundling; write Node-compatible source without Bun-only runtime APIs; and produce a bundled JavaScript CLI targeting a declared supported Node version with a Node shebang. Standalone executable compilation is deferred.

Rationale: This follows the owner's established CLI convention and preserves runtime portability while retaining Bun's development workflow. It avoids adding platform-specific executable builds and release automation before the product behavior stabilizes.

## P12: Living behavior document and traceability

Point: Decide which behaviors must appear in the generated living document and be covered by executable end-to-end cases.

What you need to know: Jastr does not generate documentation directly from test names. It has two authored sources:

- Structured functional requirements and acceptance criteria.
- Declarative end-to-end case manifests referencing those criteria through `covers`.

The harness validates the references, runs cases through the real CLI, and generates `docs/BEHAVIOR.md` from the same requirements, fixtures, commands, expected streams, exit codes, and output files. A check mode fails when the committed document is stale.

Copying this mechanically could force internal implementation details into slow subprocess tests. The document should describe observable CLI behavior, not every pure helper invariant.

Decision: Adopt Jastr's full requirements-to-cases traceability model for externally observable `wtw` behavior. Author structured functional requirements and declarative E2E manifests under `packages/cli`; generate `packages/cli/docs/BEHAVIOR.md` deterministically from them; forbid manual edits to the generated document; require every active CLI acceptance criterion to be covered by at least one E2E case; preserve explicit deferred and removed statuses; validate manifests and traceability strictly; execute cases through the actual CLI entrypoint in isolated environments; and include relevant fixtures, commands, exact streams, exit codes, and output files in the document. Provide regeneration and exact `--check` drift scripts in the standard quality gate. Keep pure internal contracts in `@wtw/core` unit tests unless they surface as observable CLI behavior.

Rationale: Future development will be designed through discussions and then delegated wholesale to third parties or LLMs. The generated behavior document must therefore act as an inspectable executable contract showing that delivered behavior matches the owner's decisions, while unit tests retain efficient coverage of internal edge cases.

## P13: Fast E2E coverage plus real external-contract proof

Point: Decide how much of the E2E suite runs real Git and Worktrunk operations versus declared simulations.

What you need to know: Repeating complete Worktrunk lifecycles for every CLI acceptance criterion would make the suite slow and discourage frequent execution. Conversely, using only fakes could allow our model to drift from actual Worktrunk behavior. The MVP itself does not wrap ordinary Worktrunk operations, so most `wtw init`, `wtw check`, and `wtw workspace sync` behaviors do not need a real lifecycle operation in every case.

Decision: Use one E2E harness and living document with two explicit automated execution modes. Fast behavior cases will run the real `wtw` CLI in isolated fixtures, use real Git where inexpensive and directly relevant, and use declared fake Worktrunk and Cursor executables for deterministic behavior, call recording, and failures. A small external-contract suite will run at least one complete happy-path lifecycle against real Git and a declared compatible real Worktrunk version, with isolated user state and simulated Cursor, proving initialization, activation, approval, blocking file copy, post-start synchronization, linked-worktree removal, and post-remove reconciliation. Add other real scenarios only when they prove a distinct external contract. Every case and the generated behavior document will label each dependency as real or simulated. Actual Cursor GUI focus/open behavior remains a short manual release check. Fast and contract suites will have separate commands, while CI and the final test-and-report quality gate run both plus traceability and living-document drift checks.

Rationale: The model gives delegated implementers fast comprehensive behavioral feedback without repeatedly paying for full Worktrunk lifecycles, while a narrow real contract proof prevents the fakes from becoming an unverified model of external behavior. Explicit labels let the owner distinguish simulated evidence from real integration evidence when reading the living document.

## P14: Version and build identity

Point: Define the exact `wtw --version` contract for source runs and bundled builds.

What you need to know: Jastr reads its semantic version from the CLI package manifest and injects the current short Git SHA as a build-time constant. Source execution has no injected constant and displays `dev`. Its build does not add a dirty-tree marker.

A failed Git lookup during the build should be treated explicitly; otherwise a bundle could accidentally contain an empty or misleading identity.

Decision: Source execution will print exactly `<package-version> (dev)`, and bundled builds will print exactly `<package-version> (<short-git-sha>)` for both `wtw --version` and `wtw -V`. The semantic version will come from `packages/cli/package.json`; a build-time `WTW_GIT_SHA` constant will carry `git rev-parse --short HEAD`; source code will fall back to `dev`; and builds will fail clearly when no Git SHA can be resolved. The MVP will not add a dirty-tree marker. E2E requirements will cover the source form, and a build test will cover injected identity.

Rationale: This follows the requested Jastr convention, gives every bundle a traceable source commit, and avoids silently producing an ambiguous build outside Git. Omitting dirty state keeps the version contract identical in shape to the reference and treats the SHA as source identity rather than a reproducibility claim.

## P15: CLI structure and development conventions

Point: Decide how broadly to adopt Jastr’s implementation conventions beyond Bun, packages, living docs, and versioning.

What you need to know: The reference’s reusable conventions form a coherent toolchain:

- Commander with typed extensions for CLI composition.
- A tiny executable entrypoint.
- A testable `buildProgram()` function.
- One focused module per command.
- Centralized error formatting and exit-code handling.
- Biome for formatting and linting.
- TypeScript strict checking.
- Vitest for tests.
- Execa for controlled subprocess execution.
- YAML for requirements and E2E case manifests.
- Root scripts that aggregate package-level build, type-check, test, and documentation checks.

Adopting only fragments could create needless divergence from the development standard you want. The domain-specific Jastr directories and behaviors should not be copied.

Decision: Adopt Jastr's coherent CLI and development stack: Commander with typed extensions, a minimal `index.ts`, a testable `buildProgram()`, focused command modules, centralized structured error handling, Biome, strict TypeScript, Vitest, Execa, YAML requirement and case manifests, and root aggregate scripts for build, check, format, typecheck, tests, E2E, external contracts, living docs, and the full report. Organize CLI support into focused Git, Worktrunk, Cursor, and filesystem modules. Expected failures will render `Error: <message>` on stderr with exit code 1 and no stdout; successful output remains deterministic. Copy the reference's seams and conventions, not its template-specific domain code.

Rationale: The conventions work as an integrated standard already familiar to the owner and reduce design variance for delegated implementers. Retaining `wtw`-specific domain boundaries prevents cargo-culting Jastr's unrelated features.

## P16: Worktree-local, user-editable setup

Point: Decide whether the MVP should use standard, locally ignored project files as its complete configuration instead of generated state under the Git common directory.

What you need to know: Keeping `.config/wt.toml` at Worktrunk’s standard path removes the need for `WORKTRUNK_PROJECT_CONFIG_PATH`. Native `wt` automatically discovers it in whichever worktree invokes the operation.

For that to remain true, `.config/wt.toml` and `.worktreeinclude` must be copied into every new worktree. The primary worktree remains the canonical source, while `wtw sync` can repair existing worktrees that are missing or carrying stale copies.

Decision: Store the user-editable Worktrunk configuration at `.config/wt.toml`, the copy policy at `.worktreeinclude`, and one `<repository>.code-workspace` file in the primary project root. Cover all three with a managed `.git/info/exclude` block. Scaffold `.worktreeinclude` with `.config/wt.toml` and `.worktreeinclude` so every new worktree receives native Worktrunk discovery and the copy policy. Scaffold distinct named hooks for blocking `wt step copy-ignored --require-include`, post-start `wtw sync --open`, and post-remove `wtw sync`, while allowing users to add arbitrary other Worktrunk configuration. The MVP surface will be `wtw init`, `wtw sync`, and `wtw check`: initialization safely creates or augments the standard files; synchronization copies the primary configuration and include policy to linked worktrees and reconciles the workspace, optionally opening it; checking validates excludes, required include entries, compatible hook semantics, copy convergence, workspace state, and dependencies without writing. The primary copies are authoritative; configuration edits in linked copies are not preserved. Do not create a manifest or private generated-state directory in the MVP.

Rationale: This uses Worktrunk's native discovery, gives users direct access to its full configuration surface, eliminates manual environment activation and hidden state, and reduces `wtw` to the three differentiated capabilities actually needed. Local excludes satisfy the clarified privacy requirement. The accepted trade-off is replicated configuration, controlled through a canonical primary copy plus synchronization and drift diagnostics. This decision supersedes P2's manual environment activation, P3/P6's primary-only `.worktreeinclude`, and P7's generated-state ownership model where they conflict.

## P17: Code-workspace customization

Point: Decide whether the root `.code-workspace` file is entirely generated or user-editable alongside `wtw`-managed folders.

What you need to know: Cursor workspace files may contain useful user configuration beyond `folders`, including:

```jsonc
{
  "folders": [],
  "settings": {},
  "extensions": {},
  "launch": {},
  "tasks": {}
}
```

They also support JSON with comments. Rewriting the complete document from strict JSON would remove user settings, comments, and formatting. Declaring the whole file generated would be simpler but inconsistent with the new user-editable Worktrunk model.

Decision: Make the primary root `<repository>.code-workspace` user-editable while reserving its top-level `folders` property for `wtw`. `wtw init` creates it only when absent. `wtw sync` uses a JSONC-aware edit library to atomically replace `folders` with absolute paths derived from Git while preserving comments, formatting, property order, and every unrelated property. Invalid JSONC causes a no-write sync failure and a check finding. The file remains only in the primary worktree, is excluded locally, and is not copied through `.worktreeinclude`. `wtw check` validates only the managed folder list, and `wtw sync --open` opens this exact file.

Rationale: This preserves normal Cursor workspace customization without weakening deterministic worktree reconciliation. Restricting ownership to one property gives users a clear boundary and avoids destructive full-document generation.

## P18: Existing Worktrunk configuration

Point: Decide whether `wtw init` modifies an existing `.config/wt.toml` or requires the user to integrate the scaffold manually.

What you need to know: TOML parsers can preserve values semantically but commonly discard comments, formatting, and ordering when serializing. Implementing a robust syntax-preserving TOML editor would be disproportionate for three hook entries. Appending text is unsafe when the relevant hook tables already exist.

Decision: Never rewrite an existing `.config/wt.toml`. If absent, `wtw init` creates the complete scaffold. If present with the exact required named hooks, initialization continues without changing it. If a required hook is absent or conflicts, initialization performs no writes and prints the exact TOML additions required; the user edits the file and reruns initialization. Custom hooks under other names remain unrestricted. `wtw check` validates the required names and commands exactly. Initialization preflights this condition before any writes so manual integration never leaves partial setup.

Rationale: This preserves user formatting, comments, ordering, and arbitrary Worktrunk configuration without building a syntax-preserving TOML editor for a rare case. A short explicit manual integration is safer and less surprising than semantic reserialization or textual patching.

## P19: Supported environment

Point: Define the repository shapes and operating systems the MVP officially supports.

What you need to know: The validated workflow used a standard non-bare repository on macOS with sibling linked worktrees and Cursor. Supporting bare repositories changes the meaning of “primary worktree” and where canonical editable files live. Windows introduces different executable lookup, path, shell-command, and atomic-write behavior.

Paths containing spaces and invoking commands from nested directories are normal cases and should not be postponed.

Decision: Officially support macOS and Linux standard non-bare repositories with an identifiable primary worktree. Commands must work from the primary worktree, any linked worktree, and nested directories; support sibling worktrees and paths containing spaces or unusual non-NUL characters; and locate Git, Worktrunk, Cursor, and the supported Node runtime through `PATH`. Bare repositories, repositories without a usable primary worktree, Windows, missing dependencies, and unsupported Worktrunk versions receive clear diagnostics. Avoid needless POSIX shell-string construction, but provide no behavioral guarantee for unsupported platforms.

Rationale: This captures the proven macOS environment and a practical portable POSIX boundary without taking on Windows shell/path behavior or the different canonical-file model required by bare repositories.

## P20: Worktrunk compatibility policy

Point: Decide whether `wtw check` rejects, warns about, or accepts Worktrunk versions outside the version exercised by the real contract suite.

What you need to know: The prototype and current local installation use Worktrunk v0.62.0. Before version 1.0, a new minor release may change hook configuration, template behavior, or copy-step flags. Requiring exactly one patch version would be brittle, while silently accepting every future version would overstate what the E2E contract proves.

Decision: Define the initial verified range as Worktrunk `>=0.62.0 <0.63.0` and pin v0.62.0 in the first real external-contract suite. `wtw check` will fail versions below the minimum and unparseable version output, pass versions inside the range, and prominently warn—without failing—for v0.63.0 or newer as unverified. The warning names the verified range and recommends running the real contract suite. Native Worktrunk execution is never blocked. Expanding the range requires the real suite to pass and the functional requirement and living document to be updated.

Rationale: This distinguishes proven compatibility from hopeful compatibility while avoiding brittle exact-patch enforcement or blocking the user after a normal newer-version upgrade.

## P21: Cursor launch side effects

Point: Decide when `wtw` commands may open or focus Cursor.

What you need to know: Automatically opening Cursor during `init`, routine reconciliation, checks, or post-removal hooks could steal focus unexpectedly. Opening it after explicitly creating a new worktree is part of the desired workflow.

Decision: `wtw init` will create and synchronize the workspace without opening Cursor and without printing an unnecessary post-init suggestion to open it. `wtw check` never opens Cursor or writes. Plain `wtw sync` updates state without opening Cursor; `wtw sync --open` synchronizes and then opens or focuses the exact root workspace. Worktrunk post-start uses `wtw sync --open`, while post-remove uses plain `wtw sync`. If file synchronization succeeds but Cursor launch fails, retain the valid synchronized state and report the launch failure.

Rationale: This prevents unexpected focus stealing during setup, diagnostics, ordinary reconciliation, and removal while retaining the desired editor handoff after creating a worktree or explicitly requesting it.

## P22: Workspace folder representation

Point: Define the ordering, labels, and stale-worktree handling for the managed `folders` array.

What you need to know: Git’s porcelain output can contain the primary worktree, linked worktrees, detached worktrees, and prunable entries whose directories no longer exist. Cursor accepts optional display names in addition to paths. Deterministic output prevents needless workspace churn and makes E2E expectations stable.

Decision: Include every registered worktree whose directory exists, exclude prunable or missing paths without pruning Git, and have `wtw check` warn with native cleanup guidance. Put the primary worktree first; sort remaining entries by branch name and then absolute path; use normalized absolute paths; label normal entries with the full branch name and detached entries as `detached@<short-sha>`. Name the root workspace `<primary-directory-name>.code-workspace`. Initialization stops rather than overwriting an unrecognized file at that path.

Rationale: Branch labels are more useful than incidental worktree directory names, and deterministic ordering avoids needless file churn and unstable E2E output. Excluding missing directories keeps Cursor valid while leaving potentially destructive Git cleanup to the user.

## P23: Synchronization scope and concurrency

Point: Define exactly what `wtw sync` reconciles and how concurrent lifecycle hooks avoid racing.

What you need to know: `.worktreeinclude` may select mutable files such as `.env`, caches, or local databases. Recopying those during every synchronization could overwrite legitimate worktree-specific state. Worktrunk already owns copying selected content when a worktree is created.

Multiple worktrees may also be created or removed concurrently. Without serialization, two `sync` processes could enumerate different Git states and the older snapshot could be written last.

Decision: `wtw sync` will copy only the primary `.config/wt.toml` and `.worktreeinclude` to every linked worktree, overwriting divergent linked control-file copies because the primary is authoritative; reconcile only the primary root workspace's `folders` property; and never recopy other paths selected by `.worktreeinclude`. `--open` launches Cursor only after synchronization writes succeed. Synchronization will acquire one repository-wide transient lock under the Git common directory before enumeration and hold it through atomic control-file and workspace writes. Use an established cross-process locking library with a documented short wait timeout and stale-lock handling; fail without writing on timeout; always release the lock. `wtw check` remains lock-free and reports the snapshot it observes.

Rationale: This avoids overwriting legitimate per-worktree private state, preserves Worktrunk as the creation-time copy engine, and prevents concurrent background lifecycle hooks from committing stale workspace snapshots. Transient lock metadata adds no durable configuration model.

## P24: Diagnostic result contract

Point: Define how `wtw check` reports repository health and which findings make it fail.

What you need to know: A diagnostic command is most useful when it reports all independently discoverable problems in one run rather than stopping at the first failure. Some conditions are actionable breakage; others are cautions that do not prevent the configured workflow.

The privacy model also depends on the local files being untracked. `.git/info/exclude` cannot hide a file that Git already tracks.

Decision: Make `wtw check` a read-only aggregate diagnostic with deterministic Repository, Dependencies, Privacy, Worktrunk, Copy policy, Synchronization, and Cursor workspace categories. Findings are `PASS`, `WARN`, or `FAIL`; exit 0 when no failures exist, including with warnings, and exit 1 when any failure exists; print a final count summary; omit JSON output in the MVP. Failures cover unsupported context, missing required dependencies or files, incompatible/unparseable Worktrunk, tracked or unexcluded private paths, invalid TOML/JSONC, absent or altered required hooks/control entries, divergent linked control copies, and workspace drift. Warnings cover newer unverified Worktrunk, nonmatching/absent optional include selections, stale Git registrations, and ignored optional Cursor metadata. Continue independent checks and mark prerequisite-dependent sections skipped rather than cascading false failures. `wtw init` preflight fails when a required private path is already tracked because this MVP cannot meet privacy at that standard path.

Rationale: Aggregation gives the user and delegated implementers one complete actionable health report. Stable severity and exit semantics support both human use and test automation, while treating tracked paths as failures enforces the project's actual collaborator-invisibility requirement.

## P25: Initialization execution model

Point: Define the complete observable behavior of `wtw init`.

What you need to know: Initialization may be invoked from any directory within any worktree, and repositories may already contain linked worktrees. It should avoid interactive ceremony while preventing predictable partial setup.

Decision: `wtw init` will be non-interactive and resolve the primary worktree from primary, linked, or nested invocation. It first performs a no-write preflight covering platform/repository support, required executables, untracked private paths, exact required hooks in any existing Worktrunk config, workspace conflicts, and validity of existing include/workspace/exclude content; every predictable conflict stops with no writes. It then creates only missing canonical scaffolds, reconciles the delimited local-exclude block, preserves valid user files byte-for-byte except for the managed workspace `folders`, and invokes the same internal synchronization used by `wtw sync` without opening Cursor. It reports created, preserved, synchronized, and unchanged artifacts concisely, triggers no approval, prints no generic next-step advice, and exits 0 only when required checks pass. A healthy rerun is a successful reconciliation/no-op. Unpredictable partial filesystem failure reports completed writes and exits 1 without broad rollback. Worktrees made through raw Git are repaired by later sync and reported as drift until then.

Rationale: A complete preflight prevents foreseeable partial setup, while a shared synchronization implementation makes first-run and repair behavior consistent. Non-interactive idempotency keeps the command suitable for both direct use and delegated automation without adding confirmation ceremony.

## P26: MVP installation and distribution

Point: Decide how the first implementation becomes an executable on `PATH` without adding premature publishing infrastructure.

What you need to know: Like Jastr, `@wtw/cli` depends on a private workspace package. A global package-manager install may try to resolve `@wtw/core` from a registry. The bundled CLI is self-contained, so a direct symlink to the bundle avoids that issue and automatically follows later local rebuilds.

The lifecycle hooks require the command to be available specifically as `wtw`.

Decision: Keep both workspace packages private and use Jastr's local-development installation convention: install dependencies with Bun, build a self-contained Node-targeted CLI bundle containing `@wtw/core`, create a Node-shebang artifact with the embedded short Git SHA, and symlink it as `~/.local/bin/wtw`. Document that `~/.local/bin` must be on `PATH`, that rebuilding updates the symlink target in place, and that removing the symlink uninstalls it. The real contract suite will exercise the built artifact. Exclude registry publishing, Homebrew, standalone binaries, automated releases/upgrades, and self-installation from the MVP.

Rationale: This makes the exact `wtw` hook command immediately usable and keeps local rebuilds frictionless without introducing registry resolution problems or a release pipeline before product behavior stabilizes.

## P27: Final MVP command surface

Point: Define the complete public CLI surface included in the first implementation.

What you need to know: Earlier product ideas included Worktrunk passthrough, editor adapters, thread workflows, dry runs, repair operations, JSON output, and configuration commands. The simplified MVP does not need those features to initialize, reconcile, and verify the local workflow.

Decision: The complete first public surface is bare `wtw`, `wtw init`, `wtw sync [--open]`, `wtw check`, `wtw help [command]`, `wtw -h|--help`, and `wtw -V|--version`. Bare invocation and informational help/version paths exit 0. `init` and `check` accept no command options; `sync` accepts only `--open`. Unknown commands/options and unexpected positional arguments use the standard single-line error and exit 1. Exclude Worktrunk passthrough, force/fix/dry-run/JSON/config commands, and a separate workspace-open command. Native `wt` remains the lifecycle interface; the second product thread owns passthrough and the broader thread-to-agent workflow.

Rationale: This is the minimum complete surface for the three capabilities the owner identified—initialize, reconcile, and verify—and prevents deferred product ideas from leaking into the junior implementation by implication.

## P28: Lifecycle readiness and failure semantics

Point: Decide which `wtw` lifecycle work must block worktree creation and which may complete asynchronously.

What you need to know: Worktrunk runs `pre-start` hooks synchronously and `post-start`/`post-remove` hooks in the background. A failed background hook does not undo the successful Worktrunk operation; its output is available through Worktrunk’s hook logs.

The copied private files may be required immediately for development. Cursor reconciliation and focus are conveniences that can be repaired by running `wtw sync`.

Decision: Run `wt step copy-ignored --require-include` in blocking `pre-start`, so creation is not ready until selected ignored content and local control files copy successfully and native Worktrunk semantics handle failure. Run `wtw sync --open` in background `post-start`; creation may return before Cursor opens, and failure leaves the worktree intact for explicit check/sync repair. Run plain `wtw sync` in background `post-remove`; failure may leave temporary editor/control drift but never alters native removal semantics. Normal removing merges rely on Worktrunk's post-remove lifecycle. `--no-remove`, `--no-hooks`, failures before cleanup, and raw Git operations retain native behavior without automatic compensation. Direct `wtw sync` is blocking through writes and any requested Cursor launch attempt.

Rationale: Required development inputs belong in the readiness boundary, while editor focus and workspace reconciliation are repairable conveniences. This preserves Worktrunk's lifecycle semantics and makes eventual consistency explicit rather than allowing background copying to surprise the user.
