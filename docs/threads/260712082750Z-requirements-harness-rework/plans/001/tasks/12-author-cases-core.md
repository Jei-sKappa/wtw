### Task 12: Author missing dedicated cases — core domains

**Objective:** Give every still-uncovered `verifiedBy: case` AC in the core domains (`CLI`, `REPO`, `INIT`, `PRIV`, `CONF`, `VER`) its one dedicated fast case.

**Input / context:** The uncovered-AC backlog produced by Task 11 (the traceability test's error output enumerates it). Near-duplicate cases and duplicated fixtures are accepted by design (spec §3): the fastest correct route is copying the sibling case that already exercises the behavior and narrowing its assertions to the one AC. Case conventions: kebab ids, `covers` scalar, assertions scoped to the AC's substance plus the runner's mandatory envelope (exit code, stdout, stderr).

**Steps:**

1. Produce the backlog: run `bun run test:e2e` and extract the `uncovered acceptance criterion <ref>` errors, or run a one-liner that calls `validateTraceability` and prints the failure list. Partition it by prefix; this task takes `CLI-`, `REPO-`, `INIT-`, `PRIV-`, `CONF-`, `VER-`.
2. For each backlog ref, create a new case directory `packages/cli/test/e2e/cases/<kebab-id>/` with `case.yml` (fast mode, `covers` = that one ref), fixtures (copied from the nearest sibling where applicable), and expected streams/files asserting exactly that AC's observable outcome plus the envelope.
3. Run each new case as you go: `bunx vitest run packages/cli/test/e2e/e2e.test.ts -t '<case-id>'`.
4. When the partition is exhausted, re-run the backlog extraction and confirm no remaining uncovered ref carries a core-domain prefix.

**Files modified:** new `packages/cli/test/e2e/cases/*/` directories (one per previously uncovered core-domain AC); no existing files change.

**Verification:** `bun run test:e2e` — all case tests pass, and the traceability failure output contains no `CLI-`, `REPO-`, `INIT-`, `PRIV-`, `CONF-`, or `VER-` refs (remaining uncovered refs belong only to Task 13's domains). `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**

- Every active `verifiedBy: case` AC with a core-domain prefix is covered by exactly one passing fast case.
- Each new case's assertions are scoped to its one AC plus the mandatory envelope.

**Consumes:** uncovered-AC backlog from Task 11; core-domain registry from Task 8.

**Produces:** full declarative coverage of the core domains; the residual backlog (behavior-domain and `WTA` refs only) for Task 13.
