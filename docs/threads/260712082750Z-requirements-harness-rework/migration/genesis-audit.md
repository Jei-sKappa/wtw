# Genesis migration audit

This is a one-time audit (per decision-log P4) that lives in the
requirements-harness-rework thread and is archived with it once every row is
checked off in Task 15. Its purpose is to guarantee the manifest rewrite (Tasks
8–10) drops no behavior guarantee: it enumerates every acceptance criterion of
the frozen genesis spec
(`docs/threads/260711114414Z-wtw-genesis/specs/001/spec.md`, FR-01..FR-15) as an
unchecked row, and Tasks 8–10 fill each row's `New refs` with the new compound
ref(s) that absorb it while Task 15 checks each `Done` box.

**Baseline commit:** `e82ac6e340b6310f18e155ddf914fd4329da8a5a`

This is the diff base for the Task 15 product-diff check: the product tree
(`packages/cli/src/`, `packages/core/src/`) must be unchanged against this
commit except for the P6 version-bump carve-out
(`packages/core/src/worktrunk/version.ts` and the comment-only example in
`packages/cli/src/diagnostics/categories.ts`).

**Row-resolution rule:** Every row resolves in exactly one of two ways — to one
or more new compound refs that absorb its substance, or to an explicit
owner-approved disposition recorded in the row. Silent drops are prohibited: an
implementer who believes a criterion should be dropped must escalate to the
owner rather than leave the row unresolved or quietly delete it.

## Genesis FR-01 — Workspace architecture and runtime

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-01.1 | A clean install recognizes a private Bun workspace with `packages/core` and `packages/cli`, and the CLI consumes core via a workspace dependency. | ARCH-FR-0001.AC-0002 | [x] |
| AC-01.2 | Dependency-boundary tests prove `@wtw/core` imports no CLI, process-argument, subprocess, terminal-output, or filesystem-effect modules. | ARCH-FR-0001.AC-0001 | [x] |
| AC-01.3 | Formatting/linting, strict type checking, and tests run through root aggregate scripts on the Jastr-derived toolchain. | ARCH-FR-0001.AC-0003 | [x] |
| AC-01.4 | The bundled CLI runs under the documented Node runtime without Bun and contains no unresolved `@wtw/core` runtime import. | ARCH-FR-0002.AC-0001 (runs under Node without Bun), ARCH-FR-0002.AC-0002 (no unresolved runtime import) | [x] |

## Genesis FR-02 — CLI surface and error envelope

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-02.1 | Bare `wtw`, root/command help, `-h`, and `--help` print the corresponding help and exit 0. | CLI-FR-0001.AC-0001, CLI-FR-0001.AC-0002, CLI-FR-0001.AC-0003, CLI-FR-0001.AC-0004 | [x] |
| AC-02.2 | Only `init`, `sync [--open]`, `check` are accepted; every excluded command/flag and unexpected positional exits 1 with exactly one `Error: <message>` line on stderr and empty stdout. | CLI-FR-0002.AC-0001, CLI-FR-0002.AC-0002, CLI-FR-0002.AC-0003 | [x] |
| AC-02.3 | `init` and `check` reject every command-specific option; `sync` accepts only `--open`. | CLI-FR-0003.AC-0001, CLI-FR-0003.AC-0002, CLI-FR-0003.AC-0003 | [x] |

## Genesis FR-03 — Repository resolution and support boundary

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-03.1 | Every product command runs successfully from primary root, nested primary dir, linked root, and nested linked dir, all resolving the same primary/common Git context. | REPO-FR-0001.AC-0001, REPO-FR-0001.AC-0002, REPO-FR-0001.AC-0003, REPO-FR-0001.AC-0004 | [x] |
| AC-03.2 | macOS cases cover repository/worktree paths containing spaces without argument splitting or path corruption. | REPO-FR-0002.AC-0001 | [x] |
| AC-03.3 | A simulated Linux platform reports unverified/best-effort status without claiming suite evidence; bare repos, missing-primary contexts, Windows, and non-repository dirs produce deterministic unsupported/error findings without writes. | REPO-FR-0003.AC-0001 (Linux), REPO-FR-0003.AC-0002 (Windows), REPO-FR-0004.AC-0001 (bare), REPO-FR-0004.AC-0002 (non-repository); missing-primary contexts absorbed by REPO-FR-0004.AC-0003 / AC-0005 | [x] |
| AC-03.4 | Repository-shape cases independently fail each primary predicate (bare, absent main record, prunable main record, missing path, mismatched root) without writes; a post-discovery permission failure is reported as an ordinary command failure. | REPO-FR-0004.AC-0001 (bare), REPO-FR-0004.AC-0003 (absent main), REPO-FR-0004.AC-0004 (prunable), REPO-FR-0004.AC-0005 (missing path), REPO-FR-0004.AC-0006 (mismatched root), REPO-FR-0005.AC-0001 (post-discovery permission) | [x] |

## Genesis FR-04 — Initialization preflight and idempotency

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-04.1 | Each predictable conflict enumerated by the `init` contract exits 1 and leaves the complete fixture byte-for-byte unchanged. | INIT-FR-0002.AC-0001 (missing dependency), REPO-FR-0004.AC-0001..AC-0006 (OS/shape conflicts), PRIV-FR-0002.AC-0001 (tracked private path), CONF-FR-0003.AC-0001 (reserved-hook conflict); valid-or-absent `.worktreeinclude` and workspace-JSONC conflict variants absorbed by the COPY and WORK domains (see FR-07 / FR-09 rows, Task 9) | [x] |
| AC-04.2 | On an empty supported repo, `init` creates exactly the canonical TOML, include, workspace, and managed exclude content, syncs existing linked worktrees, launches no Cursor/approval, and exits 0. | INIT-FR-0001.AC-0001 (canonical scaffold + exit 0); managed-exclude content via PRIV-FR-0001.AC-0001; exact TOML hooks via CONF-FR-0001.AC-0001; linked-worktree sync via the SYNC domain (see FR-08 rows, Task 9); no Cursor launch via the CURSOR domain (see FR-10 rows, Task 9); no approval mutation via CONF-FR-0004.AC-0001 | [x] |
| AC-04.3 | Rerunning `init` on healthy setup exits 0, preserves user-authored bytes outside managed regions, and makes no semantic change beyond required reconciliation. | INIT-FR-0003.AC-0001 | [x] |
| AC-04.4 | An injected post-write filesystem failure exits 1 and reports the writes completed before failure without attempting broad deletion/rollback. | INIT-FR-0004.AC-0001 | [x] |

## Genesis FR-05 — Privacy and local exclude ownership

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-05.1 | `init` creates/reconciles one delimited local-exclude block containing all required private paths while preserving all unrelated `info/exclude` bytes. | PRIV-FR-0001.AC-0001 | [x] |
| AC-05.2 | If any required private path is tracked, `init` performs no writes and `check` emits a `FAIL`; a successful init introduces no tracked repository file. | PRIV-FR-0002.AC-0001 (no writes), PRIV-FR-0002.AC-0002 (check failure), PRIV-FR-0002.AC-0003 (no tracked file) | [x] |
| AC-05.3 | Reconciliation of an existing valid managed block is idempotent and never duplicates its entries. | PRIV-FR-0001.AC-0002 | [x] |

## Genesis FR-06 — Worktrunk configuration and customization

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-06.1 | A missing `.config/wt.toml` is scaffolded with exact distinct blocking-copy, post-start-sync/open, and post-remove-sync commands. | CONF-FR-0001.AC-0001 | [x] |
| AC-06.2 | An existing TOML with all reserved hooks is preserved byte-for-byte, including unrelated custom hooks, comments, order, and settings. | CONF-FR-0002.AC-0001 | [x] |
| AC-06.3 | An existing TOML missing/conflicting with a reserved hook makes `init` perform no writes and print the exact manual additions; after manual correction, rerun succeeds without rewriting it. | CONF-FR-0003.AC-0001 (no writes + manual additions), CONF-FR-0003.AC-0002 (post-correction rerun) | [x] |
| AC-06.4 | `init` neither invokes nor mutates Worktrunk approval; the real contract case observes native first-use approval in isolated Worktrunk state. | CONF-FR-0004.AC-0001 (init never spawns Worktrunk / no approval mutation), WTA-FR-0001.AC-0001 (native refusal without approval), WTA-FR-0001.AC-0002 (refused create grants nothing) | [x] |

## Genesis FR-07 — Copy policy

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-07.1 | A scaffolded `.worktreeinclude` contains the two required control paths and explanatory user-editing guidance, without guessed private-data entries. | COPY-FR-0001.AC-0001 | [x] |
| AC-07.2 | `check` fails when either required control entry is absent and warns (not fails) for a user entry that currently matches no existing ignored content. | COPY-FR-0002.AC-0001 (missing control fails), COPY-FR-0002.AC-0002 (unmatched entry warns) | [x] |
| AC-07.3 | The real contract scenario proves native Worktrunk copies selected ignored data and both control files from the primary before creation readiness, including when the new branch base is a linked-worktree branch. | WTA-FR-0002.AC-0001 (ignored data before readiness), WTA-FR-0002.AC-0002 (control files before readiness), WTA-FR-0003.AC-0001 (data from primary not divergent linked base), WTA-FR-0003.AC-0002 (control files off a linked base) | [x] |

## Genesis FR-08 — Synchronization and concurrency

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-08.1 | `sync` atomically makes every linked `.config/wt.toml` and `.worktreeinclude` byte-identical to the primary copies, overwriting divergent linked copies. | SYNC-FR-0001.AC-0001 | [x] |
| AC-08.2 | `sync` does not create, modify, or overwrite any other user-selected `.worktreeinclude` path. | SYNC-FR-0002.AC-0001 | [x] |
| AC-08.3 | Two overlapping sync processes serialize through one common-directory lock and finish with folders from the final Git state, with no stale older snapshot written last. | SYNC-FR-0003.AC-0001 | [x] |
| AC-08.4 | Lock timeout exits 1 without file writes; injected errors release the lock; a library-recognized stale lock is recoverable per documented policy. | SYNC-FR-0004.AC-0001 (timeout no writes), SYNC-FR-0004.AC-0002 (error releases lock), SYNC-FR-0004.AC-0003 (stale-lock recovery) | [x] |
| AC-08.5 | A linked worktree made by raw Git is reported as drift, then gains canonical control files and a workspace entry after explicit sync. | SYNC-FR-0005.AC-0001 (check reports drift), SYNC-FR-0005.AC-0002 (sync repairs) | [x] |

## Genesis FR-09 — Cursor workspace preservation and reconciliation

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-09.1 | `init` creates a missing `<primary-dir-name>.code-workspace`; adopts an existing valid-JSONC top-level object preserving everything outside `folders`; fails without writes for invalid JSONC or a non-object top level. | WORK-FR-0001.AC-0001 (creates missing), WORK-FR-0001.AC-0002 (adopts valid object), WORK-FR-0001.AC-0003 (fails without writes) | [x] |
| AC-09.2 | Sync modifies only top-level `folders` in valid JSONC and preserves comments, formatting, property order, and all unrelated properties byte-for-byte outside the edit span. | WORK-FR-0002.AC-0001 | [x] |
| AC-09.3 | Invalid JSONC causes sync to exit 1 without changing the workspace and causes `check` to emit a failure. | WORK-FR-0003.AC-0001 (sync exit 1, no change), WORK-FR-0003.AC-0002 (check failure) | [x] |
| AC-09.4 | The folder list contains the primary first and every existing linked worktree sorted by display name then normalized absolute path, using deterministic branch and detached labels. | WORK-FR-0004.AC-0001 | [x] |
| AC-09.5 | Missing/prunable registrations are excluded, produce check warnings with native cleanup guidance, and are not pruned by any `wtw` command. | WORK-FR-0005.AC-0001 (excluded and not pruned), WORK-FR-0005.AC-0002 (check warns with cleanup guidance) | [x] |
| AC-09.6 | Plain `sync` recreates a missing workspace with the minimal scaffold and current folders; `sync --open` may open it after the successful write; `check` reports the file missing before repair. | WORK-FR-0006.AC-0001 (recreate on plain sync), WORK-FR-0006.AC-0002 (check reports missing); open-after-write absorbed by CURSOR-FR-0002.AC-0001 | [x] |

## Genesis FR-10 — Cursor launch behavior

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-10.1 | `init`, `check`, and plain `sync` never invoke Cursor. | CURSOR-FR-0001.AC-0001 (plain sync), CURSOR-FR-0001.AC-0002 (init), CURSOR-FR-0001.AC-0003 (check) | [x] |
| AC-10.2 | `sync --open` invokes the fake Cursor exactly once with the exact absolute root workspace path and only after successful writes. | CURSOR-FR-0002.AC-0001 | [x] |
| AC-10.3 | A simulated Cursor launch failure after writes preserves the synchronized files and exits 1 with the launch error. | CURSOR-FR-0003.AC-0001 | [x] |
| AC-10.4 | The manual release check records successful open/focus behavior with a supported real Cursor; automated suites never launch the GUI. | CURSOR-FR-0004.AC-0001 (manual, step `cursor-open-focus`) | [x] |

## Genesis FR-11 — Diagnostics

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-11.1 | A healthy fixture prints every stable category in order, contains only pass findings, prints deterministic counts, performs no writes or Cursor call, and exits 0. | CHECK-FR-0001.AC-0001 (ordered pass report + counts + exit 0); no-write/no-Cursor clause absorbed by CHECK-FR-0004.AC-0001 and CURSOR-FR-0001.AC-0003 | [x] |
| AC-11.2 | A warning-only fixture exits 0; each defined failure fixture exits 1; both print aggregate counts matching emitted findings. | CHECK-FR-0002.AC-0001 (warning-only exits 0), CHECK-FR-0002.AC-0002 (failure exits 1) | [x] |
| AC-11.3 | A fixture with an unavailable prerequisite marks dependent checks skipped and does not emit misleading cascaded failures. | CHECK-FR-0003.AC-0001 | [x] |
| AC-11.4 | A filesystem before/after snapshot proves `check` never changes repository, Worktrunk, approval, lock, or Cursor state. | CHECK-FR-0004.AC-0001 | [x] |

## Genesis FR-12 — Worktrunk compatibility

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-12.1 | Parsed `0.62.0` and later `0.62.x` fixtures pass the compatibility finding; below `0.62.0` fails; `0.63.0` and later warn but do not fail; unparseable output fails. (Range shifts to `>=0.67.0 <0.68.0` under P6.) | COMPAT-FR-0001.AC-0001 (in-range passes), COMPAT-FR-0001.AC-0002 (below fails), COMPAT-FR-0001.AC-0003 (next-minor warns), COMPAT-FR-0001.AC-0004 (unparseable fails) | [x] |
| AC-12.2 | The external-contract suite uses a real v0.62.0 binary and passes before the verified range is represented as supported in the living document. (Pin moves to v0.67.0 under P6.) | WTA-FR-0006.AC-0001 (pinned real binary reports its version; contract-mode case) | [x] |

## Genesis FR-13 — Lifecycle integration

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-13.1 | The real Worktrunk scenario proves selected ignored content exists before a successful create command returns, while the fake Cursor records the post-start exact workspace open invocation. | WTA-FR-0002.AC-0001 (ignored data before readiness), WTA-FR-0002.AC-0002 (control files before readiness), WTA-FR-0004.AC-0001 (post-start workspace reconcile), WTA-FR-0004.AC-0002 (post-start exact-once open) | [x] |
| AC-13.2 | Removing from a linked worktree through real Worktrunk leaves the root workspace without the removed path after the background hook completes. | WTA-FR-0005.AC-0001 (post-remove drop), WTA-FR-0005.AC-0002 (post-remove opens no editor) | [x] |
| AC-13.3 | Fast cases demonstrate repair after simulated background failure, `--no-hooks`, and raw Git drift through explicit `check` and `sync`. | SYNC-FR-0005.AC-0001 (check reports raw-Git drift), SYNC-FR-0005.AC-0002 (sync repairs raw-Git drift). Note: the failed-background-hook (`lifecycle-background-failure-repaired`) and `--no-hooks` (`lifecycle-no-hooks-repaired`) fixtures prove the same explicit-`sync` drift-repair guarantee; under the 1:1 rule they need dedicated SYNC-domain ACs or retirement, to be rationalized during case re-pointing (Task 11) — flagged as a carry-forward. | [x] |

## Genesis FR-14 — Living behavior document

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-14.1 | Strict schema tests reject invalid requirement/case manifests, unknown fields, unsafe fixture paths, invalid coverage references, and active acceptance criteria with no E2E case. | HARNESS-FR-0001.AC-0001..AC-0004 (requirement-schema rejections), HARNESS-FR-0002.AC-0001..AC-0003 (case-schema rejections incl. unsafe fixture path and coverage-reference), HARNESS-FR-0003.AC-0002 (active case-verified criterion with no covering case) | [x] |
| AC-14.2 | The behavior generator deterministically renders requirements, criteria, fixtures, commands, dependency modes, exact streams, exit codes, and output files; `--check` fails on any byte drift and writes nothing. | HARNESS-FR-0004.AC-0001 (per-criterion render), HARNESS-FR-0004.AC-0003 (drift check fails, writes nothing) | [x] |
| AC-14.3 | Every active observable criterion in FR-02..FR-13 has an E2E case mapping, and the living document visibly distinguishes real and simulated Git, Worktrunk, and Cursor evidence. | HARNESS-FR-0003.AC-0001..AC-0005 (single-authority traceability incl. every-criterion coverage and mode alignment), HARNESS-FR-0004.AC-0002 (real-vs-simulated labeling) | [x] |
| AC-14.4 | The full test-and-report command runs formatting/linting, typechecking, package tests, fast E2E, real external contract, behavior-doc drift, and build, and exits nonzero when any stage fails. | HARNESS-FR-0005.AC-0001 (aggregate gate chains every stage fail-fast, proven by `packages/cli/test/toolchain.test.ts`) | [x] |

## Genesis FR-15 — Version, build, and local use

| Genesis AC | Substance | New refs | Done |
| --- | --- | --- | --- |
| AC-15.1 | Source-run `--version` and `-V` print exactly the CLI package version followed by ` (dev)` and exit 0. | VER-FR-0001.AC-0001 (`--version`), VER-FR-0001.AC-0002 (`-V`) | [x] |
| AC-15.2 | A build test injects a known short SHA and the resulting bundle prints exactly `<package-version> (<known-sha>)`; building with no resolvable Git SHA fails clearly. | ARCH-FR-0002.AC-0003 (injected SHA in reported version), ARCH-FR-0002.AC-0004 (build fails with no resolvable SHA) | [x] |
| AC-15.3 | The bundle has a Node shebang, is self-contained, and runs with the supported Node runtime without Bun. | ARCH-FR-0002.AC-0001 (Node shebang + runs under Node without Bun), ARCH-FR-0002.AC-0002 (self-contained, no unresolved runtime import); overlaps genesis AC-01.4, resolved to the same ARCH criteria without a duplicate AC | [x] |
| AC-15.4 | Following the documented symlink procedure makes `wtw` available through `PATH`; a rebuild changes its reported embedded SHA without reinstall; removing the symlink removes the command. | ARCH-FR-0003.AC-0001 (symlink exposes command on PATH), ARCH-FR-0003.AC-0002 (rebuild changes reported SHA without reinstall), ARCH-FR-0003.AC-0003 (removing the symlink removes the command) | [x] |
