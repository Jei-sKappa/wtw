### Task 1: Migration audit skeleton

**Objective:** Create the one-time genesis migration audit artifact with one unchecked row per genesis acceptance criterion, so the manifest rewrite (Tasks 8–10) has an authoritative checklist that no behavior guarantee is dropped.

**Input / context:** The genesis spec's acceptance section at `docs/threads/260711114414Z-wtw-genesis/specs/001/spec.md` (FR-01 through FR-15; acceptance bullets are the lines matching `^- \*\*AC-`). Settled decision per `seed/discussions/260712090851Z-requirements-harness-rework-decision-log.md` P4: the audit is one-time, lives in this thread, and is archived with it. The genesis spec is a frozen record — read it, never edit it.

**Steps:**

1. Record the rework's baseline commit: run `git rev-parse HEAD` and note the hash — it is the diff base for the product-diff check in Task 15 (product tree unchanged except the P6 version-bump carve-out).
2. Create `docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` opening with: a short purpose paragraph (one-time audit per P4, archived after check-off), the baseline commit hash from step 1, and the row-resolution rule from the spec (a row resolves only to one or more new compound refs, or to an explicit owner-approved disposition; silent drops prohibited — an implementer who believes a criterion should be dropped escalates to the owner).
3. For each genesis FR (FR-01..FR-15), add a `## Genesis FR-NN — <title>` section containing a table with columns `| Genesis AC | Substance | New refs | Done |`.
4. Add one row per acceptance bullet of that FR in the genesis spec: the genesis AC id (e.g. `AC-02.1`), a one-line summary of its substance in your own words, an empty `New refs` cell, and `[ ]` in `Done`. Do not paraphrase away testable substance — the summary must be specific enough that Tasks 8–10 can verify absorption against it.

**Files modified:** `docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` (NEW)

**Verification:** `grep -c '^- \*\*AC-' docs/threads/260711114414Z-wtw-genesis/specs/001/spec.md` and `grep -c '^| AC-' docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` print the same number (57 at plan time). `grep -c '^## Genesis FR-' …/migration/genesis-audit.md` prints 15. The audit file contains the baseline commit hash (`git rev-parse HEAD` output appears verbatim).

**Acceptance criteria:**

- The audit artifact exists in this thread with exactly one row per genesis acceptance bullet, all rows unchecked with empty `New refs`.
- All 15 genesis FR sections are present.
- The baseline commit hash and the row-resolution rule (owner escalation, no silent drops) are stated in the artifact.

**Consumes:** none

**Produces:** `migration/genesis-audit.md` (thread-relative) — the row set Tasks 8–10 fill (`New refs`) and Task 15 checks off; the baseline commit hash Task 15 diffs against.
