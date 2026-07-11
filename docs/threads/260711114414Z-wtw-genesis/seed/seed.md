# Seed: wtw genesis

External: none — brand-new project, no tracker ticket exists yet

The seed comes from an handoff document while working on another project.

<handoff-document>
## What was asked

Create a self-contained handoff for a fresh AI session in a new, initially empty repository named `wtw`—WorkTrunk Wrapper—covering the motivation, validated prototype, proposed product direction, architecture, workflows, constraints, and unresolved decisions.

## Verdict

Build `wtw` as a separate repository and executable product: a thin, extensible companion around Worktrunk, not a fork or reimplementation. Its initial value should be private per-repository automation, reliable worktree lifecycle integration, editor/agent adapters, and a one-command `thread → worktree → agent` workflow.

Start with a conventional interactive CLI. Treat a full terminal UI as a later interface over a stable core.

## Why

### The problem being solved

The user routinely works across many projects and parallel Git worktrees. Worktrunk handles core worktree creation, switching, merging, and removal well, but significant repetitive setup remains:

- Copying selected ignored files into new worktrees.
- Maintaining editor workspaces containing all worktrees.
- Removing deleted worktrees from those editor workspaces.
- Keeping personal automation invisible to repository collaborators and forks.
- Repeating the same setup separately in every repository.
- Selecting a workflow thread and deriving a branch/worktree from it.
- Launching Codex, Claude Code, Cursor, or another agent in the new worktree.
- Reusing the same initial prompt and invoking the same discussion skill.
- Remembering the exact command sequence every time.

The desired experience is eventually close to:

```sh
wtw thread start
```

That command could interactively select a thread, create its branch and worktree, prepare the development environment, update the chosen editor, select and launch an agent, and provide the standard discussion prompt.

### Why this belongs in a separate repository

The proof of concept was developed while working in a repository whose explicit purpose is distributing standalone `SKILL.md` files. That repository has no build, test, packaging, or executable release pipeline.

`wtw` will likely need:

- A programming language and dependency manager.
- Unit and integration tests.
- Executable packaging.
- Versioned releases.
- Installation and upgrade instructions.
- Compatibility handling for Worktrunk versions.
- Issue tracking and user-facing documentation.
- Potential platform-specific behavior.
- Multiple editor and agent integrations.

Keeping it in the skills repository would couple two products with different users, release cadences, and technical needs. Extracting it later would become progressively harder.

The new repository should therefore be named:

```text
wtw
```

Expanded product name:

```text
WorkTrunk Wrapper
```

The likely executable name should also be `wtw`, subject to checking package registries and command-name collisions.

### Product boundary

`wtw` should remain a companion to Worktrunk.

It should not reimplement:

- Git worktree creation and deletion.
- Branch resolution.
- Worktrunk merge semantics.
- Worktrunk lifecycle ordering.
- Worktrunk’s branch shortcuts.
- Worktrunk’s worktree path templates.
- Worktrunk’s approval and hook machinery where those can be reused.

Instead, it should:

1. Discover repository context.
2. Manage private per-repository state.
3. Provide Worktrunk with the appropriate private project configuration.
4. Delegate core worktree operations to `wt`.
5. Implement higher-level workflows and integrations.
6. Present a more opinionated interactive experience.

Conceptually:

```text
User
  │
  ▼
wtw CLI
  ├── repository/private-state management
  ├── workflow orchestration
  ├── editor adapters
  ├── agent adapters
  ├── prompt/skill templates
  └── delegates core lifecycle operations
          │
          ▼
      Worktrunk (`wt`)
          │
          ▼
      Git worktrees
```

### Validated Worktrunk behavior

The prototype was tested with:

```text
Worktrunk v0.62.0
```

Reverify behavior against the installed/current version before relying on it as a permanent contract.

Worktrunk has two distinct configuration layers:

```text
User configuration:
~/.config/worktrunk/config.toml

Project configuration:
<repository>/.config/wt.toml
```

The layers differ in scope and trust semantics:

- User hooks are personal, trusted, and run first.
- Project hooks belong to the repository, require approval, and run afterward.
- `wt --config <path>` overrides the user configuration path.
- It does not override the project configuration path.
- `WORKTRUNK_PROJECT_CONFIG_PATH=<path>` overrides the project configuration path.

The environment variable is central to the proposed `wtw` architecture:

```sh
WORKTRUNK_PROJECT_CONFIG_PATH=/absolute/private/path/config.toml \
  wt switch --create feature
```

Relevant lifecycle behavior:

- `pre-start` runs after creating the worktree and blocks the command.
- `post-start` runs in the background.
- `pre-remove` is blocking.
- `post-remove` runs in the background after removal.
- A normal `wt merge` removes the source worktree and runs the removal lifecycle.
- `wt merge --no-remove` keeps the worktree and does not need workspace removal.
- `--no-hooks` bypasses hooks.
- A failed operation before cleanup does not run `post-remove`.
- Worktrunk reads project configuration from the worktree where the command was invoked unless the project configuration path is explicitly overridden.

Useful Worktrunk template variables include:

```text
{{ branch }}
{{ worktree_path }}
{{ primary_worktree_path }}
{{ repo }}
{{ repo_path }}
{{ default_branch }}
{{ target }}
{{ target_worktree_path }}
```

Official references:

- https://worktrunk.dev/config/
- https://worktrunk.dev/hook/
- https://worktrunk.dev/merge/
- https://worktrunk.dev/step/

### The local proof of concept

The current private prototype in the skills repository consists of:

```text
.config/wt.toml
.worktreeinclude
.cursor/skills.code-workspace
.cursor/sync_cursor_workspace.py
```

Those files are ignored locally through tracked `.gitignore` rules.

The Worktrunk configuration evolved into approximately:

```toml
[pre-start]
copy-ignored = "wt step copy-ignored --require-include"

[post-start]
cursor-workspace = "python3 {{ primary_worktree_path }}/.cursor/sync_cursor_workspace.py {{ primary_worktree_path }}/.cursor/skills.code-workspace {{ primary_worktree_path }} --open"

[post-remove]
cursor-workspace = "python3 {{ primary_worktree_path }}/.cursor/sync_cursor_workspace.py {{ primary_worktree_path }}/.cursor/skills.code-workspace {{ primary_worktree_path }}"
```

The include file became:

```gitignore
.config/wt.toml
.worktreeinclude
temp/
.library/
```

Copying `.config/wt.toml` and `.worktreeinclude` was necessary because Worktrunk launched from a sibling worktree otherwise could not discover the private `post-remove` hook.

This revealed an important weakness in the repository-file approach: private automation must be copied into every worktree before it can govern later operations from that worktree.

### Cursor prototype behavior

The installed Cursor CLI was:

```text
Cursor 3.7.36
```

It supports:

```sh
cursor --add <folder>
cursor --remove <folder>
cursor <workspace.code-workspace>
```

However, `cursor --add` and `cursor --remove` target the last active Cursor window. That is not deterministic when many Cursor windows for different projects are open.

The prototype solved targeting through a named workspace file:

```text
skills.code-workspace
```

The workspace file contains absolute folder paths:

```json
{
  "folders": [
    {
      "path": "/absolute/path/to/primary"
    },
    {
      "path": "/absolute/path/to/sibling-worktree"
    }
  ]
}
```

The Python helper accepts:

```sh
python3 sync_cursor_workspace.py \
  <workspace-file> \
  <repository-path> \
  [--open]
```

Its user-facing behavior:

- `<workspace-file>` identifies the exact Cursor workspace to update.
- `<repository-path>` identifies the Git repository whose worktrees should be discovered.
- `--open` opens or focuses that named workspace after synchronization.

Rather than incrementally adding or removing one folder, it runs the equivalent of:

```sh
git worktree list --porcelain
```

and regenerates the complete workspace folder list from Git’s authoritative state. This naturally:

- Adds newly created worktrees.
- Removes deleted worktrees.
- Includes worktrees created outside Worktrunk.
- Avoids stale incremental state.
- Supports sibling worktrees through absolute paths.

Creation uses `--open` so Cursor opens or focuses the correct named workspace. Removal omits `--open` to avoid stealing focus; the saved workspace is still updated.

Relevant workspace references:

- https://code.visualstudio.com/docs/editing/workspaces/workspaces
- https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces
- https://code.visualstudio.com/docs/configure/command-line

The Python helper is a proof of behavior, not necessarily the implementation to carry forward. `wtw` should probably own this functionality directly.

### The critical architectural improvement

The product should avoid storing its private operational configuration inside normal repository paths.

Git worktrees belonging to one repository share a Git common directory discoverable with:

```sh
git rev-parse --path-format=absolute --git-common-dir
```

A proposed private state layout is:

```text
<git-common-dir>/wtw/
├── config.toml
├── project.json
├── workspaces/
│   └── <project-name>.code-workspace
├── prompts/
│   └── ...
└── state/
    └── ...
```

For a standard non-bare repository, this may resolve under:

```text
<primary-repository>/.git/wtw/
```

For linked worktrees, `git rev-parse --git-common-dir` still identifies the common Git metadata location rather than the linked worktree’s small `.git` pointer file.

Advantages:

- Every worktree sees the same private state.
- Nothing appears in normal repository contents.
- No `.gitignore` rule is required.
- No `.git/info/exclude` rule is required.
- Nothing can accidentally be committed through ordinary Git operations.
- Forks and clones do not receive the configuration.
- Project hooks do not need to be copied into each worktree.
- Editor workspace definitions can be managed centrally.
- Removing a worktree does not remove the integration configuration.

`wtw` can delegate to Worktrunk with an absolute private project configuration:

```sh
WORKTRUNK_PROJECT_CONFIG_PATH=<git-common-dir>/wtw/config.toml \
  wt <arguments>
```

The generated private Worktrunk configuration could invoke stable `wtw` hook entry points:

```toml
[pre-start]
wtw = "wtw hook pre-start"

[post-start]
wtw = "wtw hook post-start"

[post-remove]
wtw = "wtw hook post-remove"
```

This is an architectural direction, not a settled specification. The next session should examine whether generated Worktrunk hooks or wrapper-owned orchestration produces the cleaner and more reliable contract.

### Why not use `.git/info/exclude`

The user explicitly prefers not to depend on `.git/info/exclude`.

There are two reasons:

1. It becomes another hidden per-clone mechanism that must be manipulated correctly.
2. It still leaves operational files inside the working tree rather than placing private tool state in an intentionally private location.

Using the Git common directory is a stronger separation: the files are not merely ignored; they are outside the worktree content Git normally considers.

### Why not rely on tracked `.gitignore`

A tracked `.gitignore` can hide private files from commits, but collaborators still see:

- The ignore rules.
- The names of the local integrations.
- Repository clutter or empty expected directories.
- A project-specific convention they may not use.

It also creates policy changes in a public/shared repository merely to support one developer’s private tooling.

`wtw` should require no tracked repository modifications by default.

An optional team mode could be considered later, but personal/private mode should be the default.

### Proposed product layers

A clean architecture would separate four concerns.

#### Core repository engine

Responsibilities:

- Locate the primary repository and Git common directory.
- Identify the Worktrunk project/repository.
- Read and write private `wtw` state.
- Discover all worktrees.
- Normalize paths across platforms.
- Acquire locks for concurrent operations.
- Generate or expose Worktrunk integration.
- Delegate to the installed `wt` executable.
- Capture and propagate exit codes and signals.
- Provide structured events to higher layers.

This layer should not know about Cursor, Codex, or workflow threads.

#### Integration adapters

Potential editor adapters:

```text
cursor
vscode
zed
none
custom-command
```

Potential agent adapters:

```text
codex
claude-code
cursor
custom-command
none
```

Each adapter should expose capabilities rather than force every integration into an identical shape. Examples:

- Open a named multi-root workspace.
- Open a worktree as a separate window.
- Add or remove a worktree from an existing workspace.
- Launch an interactive terminal agent.
- Launch a GUI editor.
- Accept a prompt as command-line arguments, stdin, clipboard content, or a generated file.

Cursor should be one adapter, not a core dependency.

#### Workflow orchestration

Potential workflows:

```text
create worktree
remove worktree
merge worktree
start thread
resume thread
launch agent
open editor
synchronize workspace
```

The high-value differentiated workflow is:

```text
thread selection
→ branch/worktree derivation
→ Worktrunk creation
→ private-file setup
→ editor synchronization
→ agent selection
→ prompt construction
→ agent launch
```

#### Interface layer

Suggested order:

1. Scriptable non-interactive CLI.
2. Interactive prompts for missing arguments.
3. Optional richer selector/fuzzy finder.
4. Full-screen TUI only after workflows stabilize.

The core should remain usable without the TUI.

### CLI direction

The CLI should likely support transparent delegation where possible:

```sh
wtw switch --create feature
wtw remove
wtw merge
wtw list
```

It may also expose opinionated commands:

```sh
wtw init
wtw doctor
wtw config
wtw workspace sync
wtw editor open
wtw agent launch
wtw thread start
```

Potential shorthand:

```sh
wtw create feature
```

could translate to:

```sh
wt switch --create feature
```

The wrapper should preserve Worktrunk’s stdout, stderr, exit codes, interactive behavior, and shell-switching semantics as faithfully as possible.

Directory switching is a design risk: Worktrunk’s shell integration uses a shell wrapper/function so `wt switch` can change the caller’s directory. A subprocess cannot directly change its parent shell’s working directory. `wtw` will need to investigate one of these approaches:

- Its own shell integration.
- Emitting a destination path consumed by a shell function.
- Delegating in a way compatible with Worktrunk’s shell wrapper.
- Accepting that higher-level commands launch the agent/editor in the destination without changing the original shell.
- Installing shell functions for both `wt` and `wtw`.

This must be investigated early; it could materially affect the CLI design.

### Proposed one-shot thread workflow

The user’s repeated manual workflow is:

1. Choose a workflow thread.
2. Create a branch/worktree whose name comes from the thread.
3. Open the worktree in Cursor or another environment.
4. Launch Codex, Claude Code, Cursor, or another agent.
5. Invoke the discussion skill.
6. Paste a standard prompt.
7. Begin discussing the selected thread.

The desired command could be:

```sh
wtw thread start
```

Potential interaction:

```text
Select thread:
> 260711120000Z-thread-archival
  260710093000Z-workflow-cleanup
  260708180000Z-raycast-sync

Derived branch:
thread/thread-archival

Base:
@ (current branch)

Editor:
> Cursor
  VS Code
  None

Agent:
> Codex
  Claude Code
  Cursor
  Custom

Skill:
> discussion

Initial prompt:
Discuss the thread at docs/threads/260711120000Z-thread-archival/...
```

Potential non-interactive equivalent:

```sh
wtw thread start \
  docs/threads/260711120000Z-thread-archival \
  --base @ \
  --editor cursor \
  --agent codex \
  --skill discussion
```

The actual thread naming and branch derivation rules remain undecided. The current observed branch style was:

```text
thread/thread-archival
```

One tested Worktrunk command was:

```sh
wt switch --create thread/thread-archival --base @
```

The tool should detect collisions and existing branches/worktrees rather than blindly recreate them.

### Prompt and skill integration

The product should avoid hard-coding one personal prompt into core logic.

A possible model:

```text
Prompt template
├── built-in defaults
├── user-level templates
├── per-repository private overrides
└── command-line override
```

Variables might include:

```text
{{ thread_path }}
{{ thread_name }}
{{ branch }}
{{ worktree_path }}
{{ repository_path }}
{{ editor }}
{{ agent }}
{{ skill }}
```

Example conceptual template:

```text
Use the discussion skill to think through the thread at {{ thread_path }}.
Read the thread seed, ledger, and relevant artifacts before beginning.
```

Different agents accept prompts differently:

- Command arguments.
- Standard input.
- Clipboard.
- A generated temporary prompt file.
- A GUI action.
- No prompt support, requiring only editor launch.

Adapter capabilities should model these differences explicitly.

### Worktrunk hook timing lesson

The prototype initially used:

```toml
[post-start]
copy-ignored = "wt step copy-ignored --require-include"
```

That caused `wt switch` to return before copying finished. The folders appeared later because `post-start` is intentionally asynchronous.

It was corrected to:

```toml
[pre-start]
copy-ignored = "wt step copy-ignored --require-include"
```

The lesson for `wtw`:

- Blocking readiness tasks belong in `pre-start`.
- Background conveniences belong in `post-start`.
- The tool should make this distinction explicit in its abstraction.
- A command should not report a worktree as ready while required setup is still running.
- Optional long-running integrations may need status reporting rather than silent detachment.

### Worktrunk removal lesson

The prototype initially kept `.config/wt.toml` only in the primary checkout. A worktree was later removed by running:

```sh
wt remove --force -D thread/thread-archival
```

from that worktree’s terminal.

Git removed the worktree, but the Cursor workspace retained the stale folder. Worktrunk logs showed no `post-remove` hook because the worktree where the command ran did not contain `.config/wt.toml`.

The prototype fixed this by copying the local configuration into every worktree.

The stronger product lesson is:

> Lifecycle configuration must be discoverable from every worktree before the operation starts.

Using an absolute `WORKTRUNK_PROJECT_CONFIG_PATH` pointing into the Git common directory should solve this without copying configuration.

### Merge behavior

The installed Worktrunk version reports this normal merge pipeline:

```text
commit
→ squash
→ rebase
→ pre-merge
→ merge
→ pre-remove
→ cleanup
→ post-remove + post-merge
```

A normal:

```sh
wt merge
```

removes the source worktree and should trigger workspace synchronization through `post-remove`.

Exceptions include:

```sh
wt merge --no-remove
wt merge --no-hooks
```

as well as failures before cleanup and situations where Worktrunk preserves the worktree.

`wtw` should delegate these semantics rather than create a competing merge model.

### Recommended MVP boundary

The first useful release should probably prove the private-state and lifecycle architecture before attempting the full thread/agent workflow.

A plausible sequence is:

#### MVP 1: private Worktrunk companion

- Detect Git repository and common directory.
- Detect the `wt` binary and compatible version.
- Initialize private per-repository state.
- Generate or expose private Worktrunk lifecycle configuration.
- Delegate create/switch/remove/merge operations.
- Synchronize a generic worktree registry.
- Provide clear diagnostics through `wtw doctor`.
- Require no tracked repository changes.

#### MVP 2: editor workspaces

- Define an editor-adapter interface.
- Implement Cursor first as the reference adapter.
- Generate a project-named `.code-workspace`.
- Synchronize it from Git’s authoritative worktree list.
- Open/focus the exact named workspace.
- Make focus behavior configurable on creation and removal.
- Support `editor = none`.

#### MVP 3: thread workflow

- Discover workflow threads.
- Select one interactively or accept a path.
- Derive and validate the branch/worktree name.
- Create through Worktrunk.
- Select editor and agent.
- Render a prompt template.
- Launch the configured agent in the worktree.

#### Later: richer interaction

- Fuzzy selection.
- Status previews.
- Worktree diff/branch metadata.
- Merge and removal confirmation screens.
- Full-screen TUI.
- Plugin ecosystem.
- Team-shared optional configuration.

### Why CLI before TUI

A TUI could eventually provide an excellent experience:

- Browse worktrees.
- Preview status and diffs.
- Create, switch, merge, and remove.
- Select threads.
- Select editors and agents.
- View hook progress and failures.

However, building it first would force early decisions about:

- Terminal rendering framework.
- Input and keybinding model.
- Async task representation.
- Log streaming.
- Screen lifecycle.
- Cross-platform terminal behavior.
- Accessibility and scripting.

Those concerns could obscure the core product question: whether the private-state, lifecycle, editor, and agent abstractions are correct.

The CLI should be designed so a TUI can call the same application services later.

### Alternatives considered and rejected

#### Keep the tool in the skills repository

Rejected because it changes a content repository into a mixed executable/content monorepo and couples unrelated release cycles.

#### Continue copying ignored configuration into every worktree

Rejected as the product architecture because it is fragile, repetitive, and was already shown to break removal automation when configuration was absent.

#### Put private files in tracked `.gitignore`

Rejected as the default because it exposes personal integration conventions to collaborators and modifies the shared repository.

#### Use `.git/info/exclude`

Rejected by user preference and because the Git common directory offers a cleaner private-state boundary.

#### Use only global Worktrunk user configuration

Rejected because the user wants project-local behavior without accumulating project-specific configuration in a global file.

#### Reimplement Worktrunk

Rejected because Worktrunk already provides strong lifecycle and worktree semantics. `wtw` should add orchestration and integrations.

#### Build the TUI first

Rejected as the initial strategy because it creates substantial interface work before the workflow model is validated.

## Caveats

- Files under the Git common directory are private to the clone, not portable through Git. A new computer or fresh clone will require `wtw init` or an explicit import/synchronization mechanism.
- “Invisible to collaborators” means absent from commits, clones, and forks. Another operating-system user with filesystem access to the same clone could still inspect `.git/wtw/`.
- Worktrunk may change environment variables, hook schemas, or CLI behavior. Compatibility should be version-checked rather than assumed from v0.62.0.
- `WORKTRUNK_PROJECT_CONFIG_PATH` must be tested with absolute paths, linked worktrees, bare repositories, nested repositories, and unusual Git directory layouts.
- Worktrunk project hooks require approval. The initialization UX must explain and handle this without silently bypassing Worktrunk’s security model.
- If generated hooks call `wtw`, the executable must remain discoverable on `PATH` from background hook processes.
- Wrapper-owned lifecycle orchestration may diverge from Worktrunk behavior if users invoke raw `wt`; generated Worktrunk hooks may be safer, but the trade-off is not yet settled.
- Raw `wt` invocations will not receive `wtw`’s private project-config override unless shell integration or another persistent mechanism supplies it.
- Shell directory switching is not automatically preserved when one executable launches another subprocess. This is a significant design question.
- Background Worktrunk hooks may outlive the foreground command. `wtw` needs a clear readiness model and possibly structured progress reporting.
- Opening a named Cursor workspace can focus or open the correct project, but live refresh behavior after externally editing `.code-workspace` files should be tested against supported Cursor versions.
- Cursor’s `--add` and `--remove` target the last active window and therefore cannot serve as the only deterministic multi-project mechanism.
- Rewriting a `.code-workspace` file must preserve unrelated keys such as `settings`, `extensions`, and user-added metadata.
- Workspace files are JSON-with-comments in the VS Code ecosystem. A strict JSON parser may reject manually added comments. The prototype used strict JSON; the product should decide whether it owns the entire file or supports JSONC preservation.
- Concurrent `wtw` commands could race while updating private state or editor workspace files. Atomic writes and locking should be considered.
- Worktree paths can contain spaces and unusual characters. Avoid shell-string construction when structured process execution is possible.
- Worktree removal may happen outside `wtw` or Worktrunk. Synchronization should rebuild from Git state rather than trusting internal events.
- Thread discovery is currently specific to the user’s modular workflow repository conventions. It should be an optional workflow module, not required for basic Worktrunk wrapping.
- Agent names and invocation conventions vary. “Claude Code,” “Codex,” and “Cursor” should be adapters with explicit capabilities rather than hard-coded branches throughout the application.
- The future repository is empty, so language, packaging, license, CI, and contribution model remain undecided.
- The product may eventually be public, but beginning with a private GitHub repository would allow architectural experimentation without prematurely committing to compatibility.

## Pointers

- Worth opening a tier-2 design thread in the new `wtw` repository before implementation because this contains several real architectural decisions.
- Worth reading any `AGENTS.md` or repository instructions created in `wtw` before writing workflow artifacts.
- Consider validating the Git-common-directory strategy with a small executable spike before selecting a full architecture.
- Consider testing these repository shapes during the spike:
  - Standard repository with primary checkout.
  - Sibling linked worktree.
  - Worktree created from another linked worktree.
  - Bare repository with linked worktrees.
  - Repository path containing spaces.
- Consider comparing two lifecycle models:
  - Generated Worktrunk project hooks stored under the Git common directory.
  - Wrapper-owned before/after orchestration around delegated Worktrunk commands.
- Consider favoring generated Worktrunk hooks if they preserve behavior for merge cleanup and lifecycle events more faithfully.
- Consider whether `wtw` should refuse raw passthrough arguments it does not understand or forward all unknown arguments transparently.
- Consider designing internal operations around structured request/result objects so both CLI and future TUI can reuse them.
- Consider reserving stable machine-readable output early, for example:
  ```sh
  wtw list --format json
  ```
- Consider whether the private configuration should distinguish:
  ```text
  desired configuration
  generated Worktrunk configuration
  mutable runtime state
  ```
  rather than combining everything in one TOML file.
- Consider an idempotent `wtw init` that:
  - Detects Worktrunk.
  - Discovers the common Git directory.
  - Creates private state.
  - Selects optional integrations.
  - Generates project configuration.
  - Requests Worktrunk approval normally.
  - Runs diagnostics.
- Consider an equally important `wtw uninstall` or `wtw disable` that removes only `wtw`-owned private state.
- Consider storing ownership/version metadata in generated files so later versions can migrate them safely.
- Consider a configuration model with user defaults plus private per-repository overrides, while keeping both outside tracked repository content.
- Consider whether reusable defaults across computers belong in:
  - A user-level `wtw` profile.
  - A private dotfiles repository.
  - Export/import commands.
  - A future encrypted synchronization feature.
- Consider choosing a project-specific workspace title automatically from the repository name while allowing overrides.
- Consider naming workspace folders by branch rather than raw directory basename when that improves editor clarity.
- Consider making workspace focus behavior configurable:
  ```toml
  [editor.cursor]
  on_create = "focus"
  on_remove = "silent"
  ```
- Consider separating required readiness hooks from optional background integrations:
  ```text
  prepare/blocking
  notify/background
  cleanup/blocking
  reconcile/background
  ```
- Consider representing the one-shot thread workflow as a composable pipeline rather than a monolithic command.
- Consider allowing prompt templates and agent commands to be previewed before execution.
- Consider adding `--dry-run` broadly, especially for:
  - Initialization.
  - Worktrunk delegation.
  - Workspace changes.
  - Thread-to-branch derivation.
  - Agent launch.
- Consider recording exactly which external commands would run in diagnostic output without leaking secrets.
- Consider using the official Worktrunk documentation as the primary technical source rather than relying solely on this handoff.
- Consider checking whether `wtw` conflicts with existing package names, executables, or trademarks before publishing.
- Consider starting the GitHub repository as private and deciding on open-source licensing after the MVP boundary and security model are clearer.

## Worth knowing

The current skills-repository prototype is functioning after several iterations, so it provides strong evidence that the workflow is useful rather than hypothetical. It successfully demonstrated:

- Blocking copy of selected ignored files during worktree creation.
- Project-specific named Cursor workspace management.
- Addition of sibling worktrees through absolute paths.
- Cleanup of workspace entries after worktree removal.
- Normal Worktrunk merge compatibility through `post-remove`.
- The importance of lifecycle configuration being visible from every worktree.

It also exposed precisely why a dedicated tool is valuable:

- Background hooks can produce surprising readiness behavior.
- Per-worktree ignored configuration is fragile.
- Editor window targeting is not trivial.
- Removal invoked from a linked worktree differs from creation invoked in the primary checkout.
- Private integration policy should not leak into shared `.gitignore`.
- Repeating this setup manually in every project is unreasonable.

No product-design thread or decision log was created in the skills repository. That was deliberate once the separate-repository boundary became clear. The new `wtw` repository is the correct place to open the design thread and record subsequent decisions.
</handoff-document>
