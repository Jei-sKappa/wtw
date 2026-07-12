### Task 8: New manifests — core CLI domains

**Objective:** Rewrite the six core-domain manifests (`CLI`, `REPO`, `INIT`, `PRIV`, `CONF`, `VER`) into narrow FRs with one-assertion `verifiedBy` ACs under the new convention, and fill the matching migration-audit rows.

**Input / context:** The audit rows from Task 1 for genesis FR-02..FR-06 and FR-15; the old fat manifests being replaced (`02-cli-surface.yml`, `03-repository.yml`, `04-init.yml`, `05-privacy.yml`, `06-worktrunk-config.yml`, `15-version.yml`) — their descriptions and AC substance are the raw material; the genesis spec's matching FR sections for anything the old manifests compressed. Schema from Task 3. Convention: FR ids `<PREFIX>-FR-0001` onward per file (prefixes per the plan's pinned map), ACs `AC-0001` restarting per FR, statements one observable assertion with no `FR-`/`AC-`/`(spec` substrings, shared context in FR descriptions, no coverage prose in `notes`.

**Steps:**

1. For each of the six files in turn, decompose the old fat FR into narrow FRs (one behavior theme each — e.g. the old CLI-surface FR splits along "unknown command rejected", "unknown flag rejected", "help output", "error envelope shape", …), guided row-by-row by the audit's substance column so nothing is dropped.
2. Write each file fresh in the new convention. Almost all ACs in these domains are `verifiedBy: case`; where an old criterion is genuinely unreachable by the E2E harness, defer it to Task 10's `ARCH`/`HARNESS` domains rather than mislabeling it `unit` here (the spec's boundary rule).
3. Keep AC statements phrased as checkable outcomes (exit code, stream content, file state, invocation record). Do not copy `(spec AC-…)` suffixes or task references; the statement lint will reject them anyway.
4. Fill the `New refs` cell of every genesis FR-02..FR-06 and FR-15 audit row with the absorbing compound ref(s). If any old criterion seems droppable, stop and escalate to the owner per the audit's resolution rule — do not leave the cell empty silently.
5. Validate each rewritten file individually (full-directory loading still fails until Task 10): for each file run a one-liner such as `bunx tsx -e 'import {readFileSync} from "node:fs"; import YAML from "yaml"; import {validateRequirements} from "./packages/cli/test/e2e/harness/requirements.ts"; const f=process.argv[1]; validateRequirements(YAML.parse(readFileSync(f,"utf8")),{filePath:f}); console.log("ok",f)' <file>`.

**Files modified:** `packages/cli/requirements/functional/02-cli-surface.yml`, `03-repository.yml`, `04-init.yml`, `05-privacy.yml`, `06-worktrunk-config.yml`, `15-version.yml` (all rewritten in place), `docs/threads/260712082750Z-requirements-harness-rework/migration/genesis-audit.md` (refs filled)

**Verification:** The per-file validation one-liner prints `ok` for all six files; `grep -rn 'WTW-FR-' packages/cli/requirements/functional/{02,03,04,05,06,15}-*.yml` returns nothing; in the audit, every row of genesis FR-02..FR-06 and FR-15 has a non-empty `New refs` cell (spot-check with `grep -A20 '^## Genesis FR-02'` etc.).

**Acceptance criteria:**

- Six manifests exist in the new convention with prefixes `CLI`, `REPO`, `INIT`, `PRIV`, `CONF`, `VER` respectively, each loading clean under the strict schema.
- Every genesis FR-02..FR-06 and FR-15 audit row resolves to new compound ref(s) (or a recorded owner disposition).
- No statement carries banned substrings; no `notes` carries coverage or task prose.

**Consumes:** audit rows from Task 1; manifest schema from Task 3.

**Produces:** the `CLI`/`REPO`/`INIT`/`PRIV`/`CONF`/`VER` FR+AC registry (compound refs) that Tasks 11–12 point cases at; filled audit rows for genesis FR-02..FR-06, FR-15.
