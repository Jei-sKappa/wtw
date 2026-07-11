// Read-only diagnostics aggregation for `wtw check`.
//
// This module gathers every independently discoverable finding under the seven
// STABLE categories fixed by the spec's "`wtw check`" section, in this exact
// order:
//
//   Repository · Dependencies · Privacy · Worktrunk · Copy policy ·
//   Synchronization · Cursor workspace
//
// Every probe here is strictly READ-ONLY: it stats, reads files, resolves
// executables on `PATH`, and spawns `git`/`wt --version` to observe state, but
// it acquires NO lock, performs NO write, and NEVER launches Cursor. The pure
// decisions are delegated to `@wtw/core` evaluators (Tasks 4/6/7/8/9); this
// module owns only the effects that surround them and the severity assignment.
//
// Skip-vs-fail: when a prerequisite is genuinely unavailable (an unsupported
// platform, or a repository context that could not be resolved because Git
// failed or the primary predicate did not hold), the dependent categories emit
// a single SKIP finding instead of cascading false FAILs. A missing REQUIRED
// artifact inside a resolved repository is a real FAIL, not a skip.
//
// Drift is computed WITHOUT mutating: the synchronization category replays the
// same read-only comparison `runSync` performs (control-file bytes via direct
// reads, folder list via `computeManagedFolders` + `applyFoldersEdit`) and
// reports whether an explicit `sync` WOULD change anything — it never invokes
// the write path.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  applyFoldersEdit,
  checkIncludeEntries,
  checkReservedHooks,
  computeManagedFolders,
  evaluateWorktrunkVersion,
  findManagedBlock,
  isSupportedPrimary,
  type ManagedWorktreeInput,
  normalizeWorktreePath,
  parseWorktreePorcelain,
  REQUIRED_INCLUDE_ENTRIES,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
  REQUIRED_INCLUDE_WT_TOML,
  type RepositoryContext,
  type WorktreeRecord,
  WtwError,
} from "@wtw/core";
import { execa } from "execa";
import {
  checkRequiredExecutables,
  type DependencyStatus,
  WT_BIN_ENV,
} from "../deps";
import {
  lsFilesIgnored,
  lsFilesTracked,
  revParse,
  worktreeListPorcelain,
  worktreeRoot,
} from "../git/git";
import { platformOverrideFromEnv, resolvePlatformSupport } from "../platform";
import { workspaceFileName, workspacePathFor } from "../workspace/write";

/** The three severities the spec fixes for `check` findings. */
export type Severity = "pass" | "warn" | "fail";

/**
 * A finding's outcome. `skip` is not a severity — it marks a dependent check
 * that could not run because a prerequisite was unavailable, so it never counts
 * toward the pass/warn/fail tally and never sets a non-zero exit code.
 */
export type Outcome = Severity | "skip";

/** One structured diagnostic finding under a category. */
export interface Finding {
  /** Outcome class: `pass`/`warn`/`fail`, or `skip` for an unrunnable check. */
  readonly outcome: Outcome;
  /** Human-readable, deterministic message. */
  readonly message: string;
}

/** All findings gathered under one stable category. */
export interface CategoryReport {
  /** The stable category name (one of {@link CATEGORY_ORDER}). */
  readonly name: string;
  /** The findings under this category, in report order. */
  readonly findings: readonly Finding[];
}

/** Deterministic severity/skip tally across every category. */
export interface DiagnosticsCounts {
  readonly pass: number;
  readonly warn: number;
  readonly fail: number;
  readonly skip: number;
}

/** The complete `check` result: ordered categories, counts, and failure flag. */
export interface DiagnosticsReport {
  readonly categories: readonly CategoryReport[];
  readonly counts: DiagnosticsCounts;
  /** Whether any finding is a `fail` (the sole driver of exit code 1). */
  readonly hasFailure: boolean;
}

/** The seven stable categories, in the exact order the spec fixes. */
export const CATEGORY_ORDER = [
  "Repository",
  "Dependencies",
  "Privacy",
  "Worktrunk",
  "Copy policy",
  "Synchronization",
  "Cursor workspace",
] as const;

/** The two authoritative control files propagated from the primary worktree. */
const CONTROL_FILES: readonly string[] = [
  REQUIRED_INCLUDE_WT_TOML,
  REQUIRED_INCLUDE_WORKTREEINCLUDE,
];

const pass = (message: string): Finding => ({ outcome: "pass", message });
const warn = (message: string): Finding => ({ outcome: "warn", message });
const fail = (message: string): Finding => ({ outcome: "fail", message });
const skip = (message: string): Finding => ({ outcome: "skip", message });

/** Whether `absolutePath` currently exists as a directory. */
async function directoryExists(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}

/** Read a file's UTF-8 bytes, or `null` when it does not exist. */
async function readMaybe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Resolve the `wt` binary the same way the launcher/probe seam does. */
function resolveWtBinary(): string {
  const override = process.env[WT_BIN_ENV];
  return override !== undefined && override.length > 0 ? override : "wt";
}

/**
 * Spawn `wt --version` (read-only) and return the trimmed version string, or
 * `null` when Worktrunk is absent, exits non-zero, or prints nothing. This is
 * the only Worktrunk invocation `check` makes; it never triggers approval.
 */
async function resolveWorktrunkVersion(binary: string): Promise<string | null> {
  try {
    const result = await execa(binary, ["--version"], {
      reject: false,
      stripFinalNewline: true,
    });
    if (result.failed || result.exitCode !== 0) return null;
    const out = typeof result.stdout === "string" ? result.stdout.trim() : "";
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Outcome of resolving the Repository category: findings plus the context. */
interface RepositoryOutcome {
  readonly findings: Finding[];
  /** The resolved context, or `null` when the repository could not be resolved. */
  readonly context: RepositoryContext | null;
}

/**
 * Repository category: classify the platform and evaluate the five-conjunct
 * primary-support predicate over freshly gathered Git facts. An unsupported
 * platform or an unresolved/unsupported repository leaves `context` null so the
 * dependent categories skip rather than cascade.
 */
async function repositoryCategory(cwd: string): Promise<RepositoryOutcome> {
  const findings: Finding[] = [];
  const platform = resolvePlatformSupport(
    platformOverrideFromEnv() ?? process.platform,
  );
  findings.push(
    platform.status === "verified"
      ? pass(platform.reason)
      : platform.status === "unverified"
        ? warn(platform.reason)
        : fail(platform.reason),
  );

  if (platform.status === "unsupported") {
    findings.push(
      skip("Repository shape not checked because the platform is unsupported."),
    );
    return { findings, context: null };
  }

  try {
    const commonDirRaw = await revParse(cwd, "--git-common-dir");
    const gitCommonDir = normalizeWorktreePath(path.resolve(cwd, commonDirRaw));
    const porcelain = await worktreeListPorcelain(cwd);
    const worktrees = parseWorktreePorcelain(porcelain);
    const isBareRepository =
      (await revParse(cwd, "--is-bare-repository")) === "true";
    const primary = worktrees.find((record) => record.primary);
    const primaryPathExists =
      primary !== undefined ? await directoryExists(primary.path) : false;
    const resolvedRootPath =
      primary !== undefined && primaryPathExists
        ? await worktreeRoot(primary.path)
        : "";

    const predicate = isSupportedPrimary({
      context: {
        primaryPath: primary?.path ?? "",
        gitCommonDir,
        worktrees,
      },
      isBareRepository,
      primaryPathExists,
      resolvedRootPath,
    });

    if (!predicate.supported) {
      findings.push(
        fail(
          predicate.reason ??
            "Repository shape does not satisfy the wtw support predicate.",
        ),
      );
      return { findings, context: null };
    }

    const context: RepositoryContext = {
      primaryPath: (primary as WorktreeRecord).path,
      gitCommonDir,
      worktrees,
    };
    findings.push(
      pass(`Supported repository; primary worktree at ${context.primaryPath}.`),
    );
    return { findings, context };
  } catch (error) {
    const detail = error instanceof WtwError ? error.message : String(error);
    findings.push(
      fail(`Not a supported Git repository (checks skipped): ${detail}`),
    );
    return { findings, context: null };
  }
}

/** Outcome of the Dependencies category: findings plus the Worktrunk status. */
interface DependenciesOutcome {
  readonly findings: Finding[];
  readonly worktrunk: DependencyStatus | undefined;
}

/** Dependencies category: each required executable resolvable on `PATH`. */
async function dependenciesCategory(): Promise<DependenciesOutcome> {
  const statuses = await checkRequiredExecutables();
  const findings = statuses.map((status) =>
    status.found
      ? pass(`${status.label} is available on PATH.`)
      : fail(`${status.label} is not available on PATH.`),
  );
  const worktrunk = statuses.find((status) => status.label === "Worktrunk");
  return { findings, worktrunk };
}

/** Privacy category: tracked-required-path conflict and managed-exclude state. */
async function privacyCategory(context: RepositoryContext): Promise<Finding[]> {
  const findings: Finding[] = [];

  const privatePaths = [
    REQUIRED_INCLUDE_WT_TOML,
    REQUIRED_INCLUDE_WORKTREEINCLUDE,
    workspaceFileName(context.primaryPath),
  ];
  const tracked = await lsFilesTracked(context.primaryPath, privatePaths);
  if (tracked.size === 0) {
    findings.push(pass("No required private path is tracked by Git."));
  } else {
    const list = privatePaths.filter((p) => tracked.has(p)).join(", ");
    findings.push(
      fail(
        `Required private path(s) tracked by Git: ${list}. Local excludes cannot hide tracked files; untrack them (e.g. \`git rm --cached <path>\`).`,
      ),
    );
  }

  const excludePath = path.join(context.gitCommonDir, "info", "exclude");
  const excludeText = await readMaybe(excludePath);
  const scan =
    excludeText === null
      ? { present: false, malformed: false, entries: [] }
      : findManagedBlock(excludeText);
  if (scan.present) {
    findings.push(pass("Managed info/exclude block is present."));
  } else if (scan.malformed) {
    findings.push(
      fail(
        "Managed info/exclude block is malformed (an unpaired marker); run wtw init to repair it.",
      ),
    );
  } else {
    findings.push(
      fail(
        "Managed info/exclude block is missing; required private paths are not excluded. Run wtw init.",
      ),
    );
  }

  return findings;
}

/** Worktrunk category: version compatibility and reserved-hook state. */
async function worktrunkCategory(
  context: RepositoryContext,
  worktrunk: DependencyStatus | undefined,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  if (worktrunk === undefined || !worktrunk.found) {
    findings.push(
      skip(
        "Worktrunk version not checked because wt was not found on PATH (see Dependencies).",
      ),
    );
  } else {
    const version = await resolveWorktrunkVersion(resolveWtBinary());
    const verdict = evaluateWorktrunkVersion(version);
    findings.push({ outcome: verdict.severity, message: verdict.message });
  }

  const tomlPath = path.join(context.primaryPath, REQUIRED_INCLUDE_WT_TOML);
  const text = await readMaybe(tomlPath);
  if (text === null) {
    findings.push(
      fail(`${REQUIRED_INCLUDE_WT_TOML} is missing; run wtw init.`),
    );
  } else {
    const result = checkReservedHooks(text);
    if (result.compatible) {
      findings.push(
        pass(`${REQUIRED_INCLUDE_WT_TOML} carries the reserved wtw hooks.`),
      );
    } else if (result.parseError) {
      findings.push(fail(`${REQUIRED_INCLUDE_WT_TOML} is not valid TOML.`));
    } else {
      findings.push(
        fail(
          `${REQUIRED_INCLUDE_WT_TOML} is missing or conflicts with required wtw hooks; run wtw init for the exact additions.`,
        ),
      );
    }
  }

  return findings;
}

/** Copy-policy category: required/optional `.worktreeinclude` entry findings. */
async function copyPolicyCategory(
  context: RepositoryContext,
): Promise<Finding[]> {
  const includePath = path.join(
    context.primaryPath,
    REQUIRED_INCLUDE_WORKTREEINCLUDE,
  );
  const text = await readMaybe(includePath);
  if (text === null) {
    return [
      fail(`${REQUIRED_INCLUDE_WORKTREEINCLUDE} is missing; run wtw init.`),
    ];
  }

  // The ignored-candidate set comes from real Git so an optional user entry
  // that matches no currently ignored content is a meaningful WARN (AC-07.2).
  const ignoredCandidates = await lsFilesIgnored(context.primaryPath);
  const result = checkIncludeEntries(
    text,
    REQUIRED_INCLUDE_ENTRIES,
    ignoredCandidates,
  );
  if (result.findings.length === 0) {
    return [
      pass(
        `${REQUIRED_INCLUDE_WORKTREEINCLUDE} carries both required control entries.`,
      ),
    ];
  }
  return result.findings.map((finding) =>
    finding.severity === "fail" ? fail(finding.message) : warn(finding.message),
  );
}

/** Existence facts for the resolved worktrees, statted once for one snapshot. */
type ExistenceMap = ReadonlyMap<string, boolean>;

async function buildExistence(
  worktrees: readonly WorktreeRecord[],
): Promise<ExistenceMap> {
  const map = new Map<string, boolean>();
  for (const record of worktrees) {
    map.set(record.path, await directoryExists(record.path));
  }
  return map;
}

/**
 * Synchronization category: replay `runSync`'s READ-ONLY comparison to detect
 * (a) linked worktrees whose control files diverge from the primary's — which
 * includes a raw-`git worktree add` worktree that has none (AC-08.5 report
 * side) — and (b) workspace `folders` drift, i.e. whether an explicit `sync`
 * WOULD rewrite the managed `folders`. No lock is taken and nothing is written.
 */
async function synchronizationCategory(
  context: RepositoryContext,
  existence: ExistenceMap,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  let divergent = 0;
  for (const record of context.worktrees) {
    if (record.primary || record.bare || record.prunable) continue;
    if (!(existence.get(record.path) ?? false)) continue;
    for (const rel of CONTROL_FILES) {
      const primaryBytes = await readMaybe(path.join(context.primaryPath, rel));
      if (primaryBytes === null) continue;
      const linkedBytes = await readMaybe(path.join(record.path, rel));
      if (linkedBytes !== primaryBytes) {
        divergent += 1;
        break;
      }
    }
  }
  findings.push(
    divergent === 0
      ? pass("Linked worktree control files match the primary copies.")
      : fail(
          `${divergent} linked worktree(s) have missing or divergent control files; run wtw sync to repair.`,
        ),
  );

  const managedInputs: ManagedWorktreeInput[] = context.worktrees.map(
    (record) => ({ record, exists: existence.get(record.path) ?? false }),
  );
  const folders = computeManagedFolders(managedInputs);
  const workspaceText = await readMaybe(workspacePathFor(context.primaryPath));
  if (workspaceText === null) {
    findings.push(
      skip(
        "Workspace folder drift not checked because the workspace file is missing (see Cursor workspace).",
      ),
    );
  } else {
    const edit = applyFoldersEdit(workspaceText, folders);
    if (!edit.ok) {
      findings.push(
        skip(
          "Workspace folder drift not checked because the workspace JSONC is invalid (see Cursor workspace).",
        ),
      );
    } else if (edit.text !== workspaceText) {
      findings.push(
        fail(
          "Cursor workspace folders are out of date; run wtw sync to reconcile them.",
        ),
      );
    } else {
      findings.push(
        pass("Cursor workspace folders match the current worktrees."),
      );
    }
  }

  return findings;
}

/**
 * Cursor-workspace category: workspace-file presence, JSONC validity, and
 * stale/missing Git registrations reported as WARNINGS with native-cleanup
 * guidance (never pruned by `wtw`).
 */
async function cursorWorkspaceCategory(
  context: RepositoryContext,
  existence: ExistenceMap,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const name = workspaceFileName(context.primaryPath);
  const text = await readMaybe(workspacePathFor(context.primaryPath));
  if (text === null) {
    findings.push(
      fail(`Cursor workspace ${name} is missing; run wtw sync to recreate it.`),
    );
  } else {
    const edit = applyFoldersEdit(text, []);
    if (edit.ok) {
      findings.push(pass(`Cursor workspace ${name} is valid JSONC.`));
    } else if (edit.reason === "non_object_root") {
      findings.push(
        fail(`Cursor workspace ${name} must have a top-level JSON object.`),
      );
    } else {
      findings.push(fail(`Cursor workspace ${name} is not valid JSONC.`));
    }
  }

  const stale = context.worktrees.filter(
    (record) =>
      !record.primary &&
      !record.bare &&
      (record.prunable || !(existence.get(record.path) ?? false)),
  );
  findings.push(
    stale.length === 0
      ? pass("No stale Git worktree registrations.")
      : warn(
          `${stale.length} Git worktree registration(s) are missing or prunable; wtw never prunes them — use \`git worktree prune\` or \`git worktree remove\` to clean them up.`,
        ),
  );

  return findings;
}

/** Tally the pass/warn/fail/skip outcomes across every category. */
function tally(categories: readonly CategoryReport[]): DiagnosticsCounts {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const category of categories) {
    for (const finding of category.findings) {
      counts[finding.outcome] += 1;
    }
  }
  return counts;
}

/**
 * Run every read-only diagnostic and return the ordered category reports, the
 * deterministic counts, and whether any finding failed. Performs no writes,
 * acquires no lock, and never launches Cursor.
 */
export async function runDiagnostics(cwd: string): Promise<DiagnosticsReport> {
  const repository = await repositoryCategory(cwd);
  const dependencies = await dependenciesCategory();
  const context = repository.context;

  const existence =
    context === null
      ? new Map<string, boolean>()
      : await buildExistence(context.worktrees);

  const dependent = async (
    build: (context: RepositoryContext) => Promise<Finding[]>,
  ): Promise<Finding[]> =>
    context === null
      ? [skip("Skipped because the repository context is unavailable.")]
      : build(context);

  const categories: CategoryReport[] = [
    { name: "Repository", findings: repository.findings },
    { name: "Dependencies", findings: dependencies.findings },
    {
      name: "Privacy",
      findings: await dependent((ctx) => privacyCategory(ctx)),
    },
    {
      name: "Worktrunk",
      findings: await dependent((ctx) =>
        worktrunkCategory(ctx, dependencies.worktrunk),
      ),
    },
    {
      name: "Copy policy",
      findings: await dependent((ctx) => copyPolicyCategory(ctx)),
    },
    {
      name: "Synchronization",
      findings: await dependent((ctx) =>
        synchronizationCategory(ctx, existence),
      ),
    },
    {
      name: "Cursor workspace",
      findings: await dependent((ctx) =>
        cursorWorkspaceCategory(ctx, existence),
      ),
    },
  ];

  const counts = tally(categories);
  return { categories, counts, hasFailure: counts.fail > 0 };
}
