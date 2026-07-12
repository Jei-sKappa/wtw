import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { afterAll, describe, expect, it } from "vitest";
import { type Checkpoint, loadCases } from "./harness/case-manifest";
import { runCase } from "./harness/case-runner";
import { createCheckpointTracker } from "./harness/checkpoints";
import {
  buildContractEnvironment,
  builtWtwExists,
  resolvePinnedWorktrunk,
} from "./harness/contract-env";

// External-contract suite. Runs the BUILT `wtw` artifact against real Git, a
// pinned real Worktrunk v0.67.0 binary, isolated home/config/approval state, and
// the fake Cursor. It proves the real lifecycle end to end — every piece of
// evidence here is REAL GIT + REAL WORKTRUNK; only Cursor is SIMULATED (the fake
// shim records the launch and never opens a GUI). The two lifecycle scenarios
// verify their declared checkpoints through a checkpoint tracker: each scenario
// runs a phase's assertions and then marks the matching declared checkpoint
// reached, and finishes by asserting every declared checkpoint was reached, so a
// failed assertion (which aborts before the reach) or a skipped checkpoint fails
// the suite. It runs ONLY under `bun run test:contract` (which builds the bundle
// first); `test`/`test:e2e` exclude this file. When the pinned binary or the
// built artifact is absent the whole suite SKIPS with a clear reason so it stays
// portable.

const repoRoot = path.resolve(import.meta.dirname, "../..");
const worktrunk = resolvePinnedWorktrunk();
const built = builtWtwExists(repoRoot);

const RESERVED_TOML = [
  "[pre-start]",
  'wtw-copy = "wt step copy-ignored --require-include"',
  "",
  "[post-start]",
  'wtw-sync = "wtw sync --open"',
  "",
  "[post-remove]",
  'wtw-sync = "wtw sync"',
  "",
].join("\n");

const WORKTREEINCLUDE = [
  ".config/wt.toml",
  ".worktreeinclude",
  "secret.env",
  "",
].join("\n");
const GITIGNORE = [
  ".config/wt.toml",
  ".worktreeinclude",
  "secret.env",
  "primary.code-workspace",
  "",
].join("\n");

interface CursorInvocation {
  argv: string[];
  cwd: string;
}

async function readCursorLines(logPath: string): Promise<CursorInvocation[]> {
  let raw: string;
  try {
    raw = await readFile(logPath, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CursorInvocation);
}

/** Poll `predicate` up to `timeoutMs`; throw with `label` when it never holds. */
async function poll(
  label: string,
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
  intervalMs = 150,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Load a scenario manifest's declared checkpoints, indexed by case id. The
 * lifecycle scenarios verify each declared checkpoint through a tracker, so a
 * case that is missing or declares no checkpoints fails loudly rather than
 * letting the test drift from its declarations.
 */
async function scenarioCheckpoints(caseId: string): Promise<Checkpoint[]> {
  const scenarios = (await loadCases(repoRoot)).filter(
    (entry) => entry.manifest.mode === "scenario",
  );
  const byId = new Map(scenarios.map((entry) => [entry.manifest.id, entry]));
  const entry = byId.get(caseId);
  if (entry?.manifest.checkpoints === undefined) {
    throw new Error(
      `scenario case ${caseId} is missing or declares no checkpoints`,
    );
  }
  return entry.manifest.checkpoints;
}

if (!worktrunk.ok) {
  describe("external contract suite (real Worktrunk v0.67.0)", () => {
    it.skip(`SKIPPED: ${worktrunk.reason}`, () => {});
  });
} else if (!built) {
  describe("external contract suite (real Worktrunk v0.67.0)", () => {
    it.skip("SKIPPED: built wtw artifact missing; run `bun run build` (test:contract does this)", () => {});
  });
} else {
  runContractSuite(worktrunk.bin, worktrunk.version);
}

function runContractSuite(wtBin: string, wtVersion: string): void {
  const contractEnv = buildContractEnvironment(repoRoot, wtBin);
  const cleanups: string[] = [contractEnv.binDir];

  afterAll(async () => {
    for (const dir of cleanups) await rm(dir, { recursive: true, force: true });
  });

  async function freshEnv(): Promise<{
    realRoot: string;
    home: string;
    env: NodeJS.ProcessEnv;
    cursorLog: string;
  }> {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "wtw-contract-")),
    );
    const home = await realpath(
      await mkdtemp(path.join(tmpdir(), "wtw-contract-home-")),
    );
    cleanups.push(root, home);
    const cursorLog = path.join(root, "cursor.log");
    const env: NodeJS.ProcessEnv = {
      ...contractEnv.env,
      HOME: home,
      FAKE_CURSOR_LOG: cursorLog,
      GIT_AUTHOR_NAME: "wtw-test",
      GIT_AUTHOR_EMAIL: "wtw@example.com",
      GIT_COMMITTER_NAME: "wtw-test",
      GIT_COMMITTER_EMAIL: "wtw@example.com",
    };
    return { realRoot: root, home, env, cursorLog };
  }

  async function initPrimary(
    realRoot: string,
    env: NodeJS.ProcessEnv,
    secret: string,
  ): Promise<string> {
    const primary = path.join(realRoot, "primary");
    await mkdir(path.join(primary, ".config"), { recursive: true });
    await writeFile(path.join(primary, ".config", "wt.toml"), RESERVED_TOML);
    await writeFile(path.join(primary, ".worktreeinclude"), WORKTREEINCLUDE);
    await writeFile(path.join(primary, ".gitignore"), GITIGNORE);
    await writeFile(path.join(primary, "secret.env"), secret);
    await writeFile(path.join(primary, "README.md"), "root\n");
    await execa("git", ["init", "-q", "-b", "main", primary], { env });
    await execa("git", ["-C", primary, "add", "README.md", ".gitignore"], {
      env,
    });
    await execa("git", ["-C", primary, "commit", "-qm", "init"], { env });
    await execa("wtw", ["init"], { cwd: primary, env });
    return primary;
  }

  const approvalsPath = (home: string): string =>
    path.join(home, ".config", "worktrunk", "approvals.toml");

  it(`resolves the pinned real Worktrunk v${wtVersion} binary`, () => {
    // real Worktrunk: the pinned binary is the one every scenario below drives.
    expect(wtVersion).toBe("0.67.0");
    expect(existsSync(wtBin)).toBe(true);
  });

  it("drives the full real lifecycle: init -> native approval -> blocking pre-start copy -> post-start sync+open -> remove-from-linked -> post-remove reconcile", async () => {
    // real Git + real Worktrunk; simulated Cursor (recorded, never launched).
    // Each phase runs its assertions and then marks the matching declared
    // checkpoint reached; a failed assertion aborts before the reach, so a
    // broken phase is inherently unreached. The block ends by asserting every
    // declared checkpoint was reached.
    const tracker = createCheckpointTracker(
      await scenarioCheckpoints("contract-lifecycle"),
    );
    const { realRoot, home, env, cursorLog } = await freshEnv();
    const primary = await initPrimary(realRoot, env, "SECRET=primary\n");
    const workspace = path.join(primary, "primary.code-workspace");

    // `wtw init` neither grants nor bypasses native Worktrunk approval — the
    // isolated approval store stays empty after init (no checkpoint: the refused
    // create below is the observable proof the store is empty).
    expect(
      existsSync(approvalsPath(home)),
      "init must not create Worktrunk approval state",
    ).toBe(false);

    // Observe native first-use approval: a non-`--yes` create is refused by the
    // native approval gate, which wtw neither grants nor bypasses.
    const refused = await execa("wt", ["switch", "--create", "feature"], {
      cwd: primary,
      env,
      reject: false,
    });
    expect(
      refused.exitCode,
      "non-interactive create without --yes refuses",
    ).not.toBe(0);
    expect(`${refused.stdout}\n${refused.stderr}`).toMatch(
      /needs approval|Cannot prompt for approval/,
    );
    tracker.reach("native-approval-refused");

    // The refused create granted nothing: the isolated approval store is empty.
    expect(
      existsSync(approvalsPath(home)),
      "a refused create must not grant approval",
    ).toBe(false);
    tracker.reach("approval-store-empty");

    // Drive the create (the test driver approves via --yes, not wtw). The
    // blocking pre-start copy runs BEFORE the command returns.
    const created = await execa(
      "wt",
      ["switch", "--create", "feature", "--yes"],
      { cwd: primary, env },
    );
    expect(created.exitCode).toBe(0);

    // The blocking pre-start hook ran before the successful create returned, so
    // selected ignored data copied from the primary already exists.
    const featureWt = path.join(realRoot, "primary.feature");
    expect(await readFile(path.join(featureWt, "secret.env"), "utf8")).toBe(
      "SECRET=primary\n",
    );
    tracker.reach("prestart-ignored-data");

    // Both control files copied by the blocking pre-start hook exist too.
    expect(existsSync(path.join(featureWt, ".config", "wt.toml"))).toBe(true);
    expect(existsSync(path.join(featureWt, ".worktreeinclude"))).toBe(true);
    tracker.reach("prestart-control-files");

    // The background post-start `wtw sync --open` opens the fake Cursor EXACTLY
    // ONCE on the exact absolute primary-workspace path. Wait for the background
    // hook (bounded poll) before asserting — never race.
    await poll("post-start Cursor open recorded", async () => {
      return (await readCursorLines(cursorLog)).length >= 1;
    });
    const opens = await readCursorLines(cursorLog);
    expect(opens.length, "fake Cursor opened exactly once").toBe(1);
    expect(opens[0]?.argv).toEqual([workspace]);
    tracker.reach("poststart-editor-opened-once");

    // post-start also reconciled the workspace to include the new worktree.
    await poll("workspace lists the feature worktree", async () => {
      return (await readFile(workspace, "utf8")).includes("primary.feature");
    });
    tracker.reach("poststart-workspace-reconciled");

    // Remove FROM the linked worktree via real Worktrunk; the background
    // post-remove `wtw sync` leaves the root workspace without the removed path
    // once the hook completes.
    await execa("wt", ["remove", "--yes"], { cwd: featureWt, env });
    await poll("workspace drops the removed worktree", async () => {
      return !(await readFile(workspace, "utf8")).includes("primary.feature");
    });
    expect(
      (await readFile(workspace, "utf8")).includes("primary.feature"),
    ).toBe(false);
    tracker.reach("postremove-workspace-dropped");

    // post-remove `wtw sync` (no `--open`) launched no additional Cursor open.
    expect(
      (await readCursorLines(cursorLog)).length,
      "post-remove sync must not open Cursor",
    ).toBe(1);
    tracker.reach("postremove-no-editor");

    tracker.assertAllReached();
  }, 90_000);

  it("copies primary ignored data and both control files even from a linked-worktree base", async () => {
    // real Git + real Worktrunk; simulated Cursor. The primary stays the
    // authoritative copy source even when the new branch base is a linked
    // worktree whose ignored content diverges. Each phase marks its declared
    // checkpoint reached; the block ends by asserting all were reached.
    const tracker = createCheckpointTracker(
      await scenarioCheckpoints("contract-linked-base"),
    );
    const { realRoot, env } = await freshEnv();
    const primary = await initPrimary(realRoot, env, "SECRET=primary\n");

    await execa("wt", ["switch", "--create", "base", "--yes"], {
      cwd: primary,
      env,
    });
    // Diverge the linked base's ignored content from the primary.
    await writeFile(
      path.join(realRoot, "primary.base", "secret.env"),
      "SECRET=base-divergent\n",
    );

    await execa(
      "wt",
      ["switch", "--create", "feat", "--base", "base", "--yes"],
      { cwd: primary, env },
    );

    // The pre-start copy sources from the primary, not the divergent base, so
    // the new worktree's ignored data matches the primary.
    const featWt = path.join(realRoot, "primary.feat");
    expect(
      await readFile(path.join(featWt, "secret.env"), "utf8"),
      "ignored data comes from the primary, not the linked base",
    ).toBe("SECRET=primary\n");
    tracker.reach("linked-base-ignored-data-from-primary");

    // Both control files copied from the primary are present.
    expect(existsSync(path.join(featWt, ".config", "wt.toml"))).toBe(true);
    expect(existsSync(path.join(featWt, ".worktreeinclude"))).toBe(true);
    tracker.reach("linked-base-control-files-present");

    tracker.assertAllReached();
  }, 90_000);

  it("runs the contract-mode case.yml cases against the built artifact and real Worktrunk", async () => {
    // real Git + real Worktrunk; simulated Cursor. Contract-mode declarative
    // cases run through the generic runner in contract mode with the real-tool
    // environment injected.
    const contractCases = (await loadCases(repoRoot)).filter(
      (entry) => entry.manifest.mode === "contract",
    );
    expect(
      contractCases.length,
      "at least one contract-mode case is declared",
    ).toBeGreaterThan(0);
    for (const testCase of contractCases) {
      await runCase(repoRoot, testCase, "contract", {
        extraEnv: contractEnv.env,
      });
    }
  }, 90_000);
}
