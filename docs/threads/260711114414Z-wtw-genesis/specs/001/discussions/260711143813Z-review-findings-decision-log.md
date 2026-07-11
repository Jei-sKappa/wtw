# Decision log — review findings for the wtw MVP spec (specs/001/spec.md)

Thread: docs/threads/260711114414Z-wtw-genesis/
Target: specs/001/spec.md
Subject: disposing the lossless-mapping and handoff-grade review findings before approving the wtw MVP specification.

## P1: Existing Cursor workspace adoption

Point: Define how `wtw init` handles an existing `<repository>.code-workspace` file at the target path.

What you need to know: The spec currently mentions both an “unrecognized workspace collision” and invalid JSONC without defining the distinction. That conflicts with the later decision that the workspace is user-editable and `wtw` owns only `folders`.

There is no useful third category here:

- Missing file: `init` creates it.
- Existing valid workspace: `init` can adopt it and update only `folders`.
- Existing malformed or structurally invalid workspace: `init` must fail without writes.

Decision: Remove the “unrecognized workspace collision” category. `wtw init` creates a missing workspace; adopts an existing workspace that parses as JSONC with a top-level object and has either no `folders` property or a replaceable `folders` value; and fails preflight without writes for invalid JSONC or a non-object top level. Adoption preserves every unrelated property, comment, and unaffected formatting while internal synchronization replaces `folders`.

Rationale: This follows the accepted user-editable workspace model directly, avoids inventing ownership metadata, and gives initialization and E2E cases one complete deterministic predicate.

## P2: Detached worktree ordering

Point: Define the sort key for detached worktrees in the Cursor workspace.

What you need to know: Normal linked worktrees sort by branch name, but detached worktrees have no branch. Their display label is already defined as `detached@<short-sha>`. Using one common display-name sort key avoids a special empty-value rule.

Decision: Keep the primary worktree first. For each remaining worktree, compute its display name as the full branch name for a branch worktree or `detached@<short-sha>` for a detached worktree, then sort by display name and normalized absolute path.

Rationale: One display-name sort key makes branch and detached ordering deterministic without inventing an empty-branch special case.

## P3: Missing workspace during synchronization

Point: Decide whether standalone `wtw sync` recreates or rejects a missing primary workspace file.

What you need to know: The workspace is partly user-editable, but its existence and `folders` property are required derived state. `sync` is the explicit reconciliation command used after raw Git operations and background-hook failures. Requiring `init` merely to recreate a deleted workspace would weaken that repair role.

Decision: `wtw sync` recreates a missing `<repository>.code-workspace` with the normal minimal scaffold and current managed `folders`. It preserves every unrelated part of an existing valid workspace, never overwrites an existing invalid workspace, and permits `sync --open` to open a successfully recreated file. `wtw check` reports the missing file as a failure until synchronization repairs it.

Rationale: The workspace is required derived state, and once the file is absent there is no remaining user customization for refusal to protect. Recreation makes explicit synchronization a complete repair path without weakening invalid-content safety.

## P4: Primary worktree predicate

Point: Replace the vague phrase “usable primary worktree” with an explicit supported-repository predicate.

What you need to know: Command-specific write permissions may fail independently and should produce ordinary filesystem errors. The support boundary only needs to establish that Git exposes a real canonical primary checkout where the local configuration can live.

Decision: A supported primary worktree requires a non-bare repository; a main/primary record in `git worktree list --porcelain`; a record not marked prunable; an existing directory at its absolute path; and Git repository-root discovery at that path resolving to the same primary path. Failure of any predicate makes repository discovery unsupported and causes no writes. Read/write permission failures after discovery remain ordinary command failures rather than repository-shape failures.

Rationale: This replaces an undefined adjective with observable Git and filesystem predicates while keeping transient permission problems separate from structural support.

## P5: Conditional merge acceptance criterion

Point: Resolve AC-13.3, whose “test only if needed” wording is not machine-checkable.

What you need to know: The MVP does not implement or wrap merge. Worktrunk owns merge semantics, and the real linked-worktree removal scenario already proves that the generated `post-remove` hook performs reconciliation. Our performance decision also said additional real scenarios should exist only when they establish a distinct external contract.

Decision: Remove the conditional merge acceptance criterion. Keep the behavioral statement that a normal removing `wt merge` relies on Worktrunk's native post-remove lifecycle, without claiming separate `wtw` verification of native merge behavior. Renumber the existing repair criterion from AC-13.4 to AC-13.3. A real merge contract case may be added later only with an expanded compatibility contract or a concrete defect requiring it.

Rationale: A discretionary test is not machine-checkable, and native merge is outside the implemented wrapper surface. The real removal scenario proves the distinct hook behavior this MVP owns without adding redundant lifecycle cost.

## P6: Supersession of the original Cursor model

Point: Confirm whether the later simplified design intentionally supersedes P4’s hidden, fully generated workspace model.

What you need to know: Genesis P4 placed a fully `wtw`-owned workspace under the Git common directory and proposed `wtw workspace sync`. Later decisions changed all three elements:

- P16 moved the workspace to the primary project root.
- P17 made it user-editable with only `folders` managed.
- P27 replaced `workspace sync` with `wtw sync`.

The spec follows those later decisions, but P16’s written supersession sentence did not explicitly name P4.

Decision: Genesis P16, P17, and P27 jointly supersede genesis P4 wherever they conflict: the workspace lives in the primary root, remains user-editable outside the managed `folders` property, and is reconciled through `wtw sync`. Record this clarification in the review-findings log and cite it from the revised spec without rewriting the earlier genesis record.

Rationale: The later simplification was intentional. An append-only clarification makes the evolution explicit and auditable while preserving the original decision history.

## P7: Reserved Worktrunk hook names

Point: Decide whether the exact generated hook key names are part of the public configuration contract.

What you need to know: The genesis discussion required distinct named hooks and exact validation but did not explicitly approve the spellings later used by the spec:

```toml
[pre-start]
wtw-copy = "wt step copy-ignored --require-include"

[post-start]
wtw-sync = "wtw sync --open"

[post-remove]
wtw-sync = "wtw sync"
```

Stable names make `check`, manual integration guidance, and living-document cases deterministic. Leaving them free would let implementations produce incompatible local configurations.

Decision: Pin `wtw-copy` as the required pre-start key and `wtw-sync` as the required key in both post-start and post-remove. The exact commands remain those shown above.

Rationale: The table context and command make each concise name unambiguous, while stable spellings give initialization, checking, manual integration guidance, and E2E cases one portable configuration contract.

## P8: macOS and Linux verification matrix

Point: Decide whether official macOS and Linux support requires the automated suites to run on both operating systems.

What you need to know: Running tests only on one OS would leave the other support claim based mainly on code review. The real Worktrunk suite is intentionally small, so a two-OS CI matrix increases CI cost without slowing ordinary local development: locally, developers run against their current OS.

Decision: For the MVP, macOS is the only officially supported and verified platform. Run the fast E2E and real Worktrunk contract suites locally on macOS; do not require CI yet. Keep implementation portability-conscious for Linux, but label Linux explicitly unverified/best-effort rather than supported. Promote Linux to official support only after the same suites pass there. Windows remains unsupported. This supersedes genesis P19's equal macOS/Linux official-support wording.

Rationale: The owner and colleagues currently use only macOS and do not need CI overhead yet. Calling untested Linux officially supported would overstate the living document's evidence, so the narrower label preserves honesty while leaving a clear promotion path.
