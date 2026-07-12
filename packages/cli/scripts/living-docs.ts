import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  type CaseManifest,
  type CaseMode,
  loadCases,
  type SetupStep,
} from "../test/e2e/harness/case-manifest";
import {
  acceptanceRef,
  type Requirement,
  validateRequirements,
} from "../test/e2e/harness/requirements";

export const OUTPUT_PATH = "docs/BEHAVIOR.md";

export type Area = {
  title: string;
  requirements: Requirement[];
};

/** One fixture/output file surfaced in the document: a project-relative POSIX
 * path paired with its verbatim contents. */
export type FixtureFile = {
  path: string;
  content: string;
};

/** A file-content constraint surfaced in the document: a project-relative path
 * and the substrings the case asserts the file must (or must not) contain. */
export type FileConstraint = {
  path: string;
  substrings: string[];
};

/** Per-tool evidence label describing which binary variant the case is wired
 * to. `real` means the genuine binary (never faked); `simulated` a declared
 * fake shim; `not-exercised` that the dependency is not wired into the case (a
 * pure surface case, or — for Worktrunk — a scenario modelled with raw Git so
 * no `wt` binary runs; the case description explains any such modelling). The
 * distinction is load-bearing: simulated evidence must never be read as real
 * lifecycle proof (spec "Executable behavior"). */
export type ToolEvidence = "real" | "simulated" | "not-exercised";

/** Real-vs-simulated evidence for the three external dependencies a case can
 * touch, derived deterministically from the case's `mode` and declared tool
 * usage (its `env` fake-binary sentinels and `run:` setup steps). */
export type CaseEvidence = {
  git: ToolEvidence;
  worktrunk: ToolEvidence;
  cursor: ToolEvidence;
};

/** A case flattened to exactly what the document renders. */
export type RenderCase = {
  id: string;
  title: string;
  description: string;
  /** The labelled automated suite the case runs under — its dependency mode. */
  mode: CaseMode;
  /** Real-vs-simulated evidence per external dependency. */
  evidence: CaseEvidence;
  cwd: string;
  command: string[];
  covers: string[];
  /** Human-readable one-line descriptions of the case's `setup` pre-steps (a
   * prior `wtw` invocation, a fixture copy, or a program run), in order. Empty
   * for cases with no `setup`. Surfaced so a stateful case does not look like
   * its observed state appeared from nowhere. */
  setupSteps: string[];
  exitCode: number;
  stdout: string;
  stdoutContains: string[];
  stderr: string;
  /** Every file under the case's `fixture/` folder — the command's inputs. */
  inputFiles: FixtureFile[];
  /** Files the command is expected to produce, resolved from `expect.files`. */
  outputFiles: FixtureFile[];
  /** Substrings each named output file must contain (`expect.fileContains`). */
  fileContains: FileConstraint[];
  /** Substrings each named output file must NOT contain
   * (`expect.fileNotContains`). */
  fileNotContains: FileConstraint[];
};

/** The `env` sentinels a case writes to request a checked-in fake executable.
 * The runner rewrites each to the shim's absolute path at run time, but the
 * loaded manifest still holds the sentinel — so it is the deterministic signal
 * for "this tool is simulated" (mirrors `case-runner.ts`'s `FAKE_SHIMS`). */
const FAKE_GIT_SENTINEL = "__FAKE_GIT_BIN__";
const FAKE_WT_SENTINEL = "__FAKE_WT_BIN__";
const FAKE_CURSOR_SENTINEL = "__FAKE_CURSOR_BIN__";

/** Whether any `run:` setup step invokes the real `git` binary directly (used to
 * build genuine Git fixtures like `git init` / `git worktree add`). */
function usesRealGit(setup: readonly SetupStep[]): boolean {
  return setup.some((step) => "run" in step && step.run.cmd[0] === "git");
}

/**
 * Derive real-vs-simulated evidence for a case from its `mode` and declared
 * tool usage. This is the single deterministic authority the document uses to
 * label evidence; it never inspects prose.
 *
 * - `contract`/`scenario` cases run under the external-contract suite
 *   (`contract-env.ts`), which ALWAYS injects real Git, the pinned real
 *   Worktrunk v0.67.0, and the fake Cursor — so every such case is real Git,
 *   real Worktrunk, simulated Cursor.
 * - `fast` cases are labelled per tool from their `env` fake-binary sentinels
 *   and `run:` steps. Worktrunk/Cursor are strict and binary-based: a faked
 *   `WTW_WT_BIN`/`WTW_CURSOR_BIN` is simulated, otherwise that tool is not
 *   exercised (deliberately conservative — the lifecycle-critical Worktrunk is
 *   never labelled real outside the contract suite). Git is labelled by the
 *   variant it is wired to: a faked `WTW_GIT_BIN` is simulated Git; otherwise a
 *   case that builds a real repository (a `git` setup step) or drives the real
 *   product pipeline (any command wired against a fake Worktrunk/Cursor) is
 *   wired to real Git; a pure surface case (no Git, Worktrunk, or Cursor wired)
 *   does not exercise Git.
 */
export function caseEvidence(
  manifest: Pick<CaseManifest, "mode" | "env" | "setup">,
): CaseEvidence {
  const mode = manifest.mode ?? "fast";
  if (mode === "contract" || mode === "scenario") {
    return { git: "real", worktrunk: "real", cursor: "simulated" };
  }
  const env = manifest.env;
  const worktrunk: ToolEvidence =
    env.WTW_WT_BIN === FAKE_WT_SENTINEL ? "simulated" : "not-exercised";
  const cursor: ToolEvidence =
    env.WTW_CURSOR_BIN === FAKE_CURSOR_SENTINEL ? "simulated" : "not-exercised";
  const git: ToolEvidence =
    env.WTW_GIT_BIN === FAKE_GIT_SENTINEL
      ? "simulated"
      : usesRealGit(manifest.setup) ||
          worktrunk === "simulated" ||
          cursor === "simulated"
        ? "real"
        : "not-exercised";
  return { git, worktrunk, cursor };
}

/** Turn `02-cli-surface.yml` into a chapter title like `Cli Surface`. */
function areaTitle(fileName: string): string {
  return fileName
    .replace(/\.yml$/, "")
    .replace(/^\d+-/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Load requirements grouped by their source file so the generated document
 * keeps the curated chapter order. Reuses the harness validator so the schema
 * stays single-sourced.
 */
export async function loadAreas(root: string): Promise<Area[]> {
  const dirPath = "requirements/functional";
  const absoluteDir = path.join(root, dirPath);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
    .map((entry) => entry.name)
    .sort();

  const areas: Area[] = [];
  for (const name of files) {
    const filePath = `${dirPath}/${name}`;
    const source = await readFile(path.join(absoluteDir, name), "utf8");
    const requirements = validateRequirements(YAML.parse(source), { filePath });
    areas.push({ title: areaTitle(name), requirements });
  }
  return areas;
}

/** Read whichever stream a case stored inline or in a sidecar file. */
async function readStream(
  inline: string | undefined,
  file: string | undefined,
  dirPath: string,
): Promise<string> {
  if (inline !== undefined) return inline;
  if (file !== undefined) return readFile(path.join(dirPath, file), "utf8");
  return "";
}

/**
 * Recursively read every file under a case's `fixture/` folder, returning
 * root-relative POSIX paths with verbatim contents, sorted by path. A case with
 * no `fixture/` (an intentionally empty workspace) yields an empty list rather
 * than throwing, so the renderer can state the workspace is empty — and so
 * generation stays deterministic whether or not an untracked empty directory
 * happens to exist locally.
 */
async function loadFixtureFiles(fixtureDir: string): Promise<FixtureFile[]> {
  const files: FixtureFile[] = [];
  const walk = async (dir: string, relative: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const childPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(childPath, childRelative);
      } else if (entry.isFile()) {
        files.push({
          path: childRelative,
          content: await readFile(childPath, "utf8"),
        });
      }
    }
  };
  await walk(fixtureDir, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** Resolve a case's `expect.files` map to the contents the command produces. */
async function loadOutputFiles(
  dirPath: string,
  files: Record<string, string> | undefined,
): Promise<FixtureFile[]> {
  if (files === undefined) return [];
  const resolved = await Promise.all(
    Object.entries(files).map(async ([actualPath, fixturePath]) => ({
      path: actualPath,
      content: await readFile(path.join(dirPath, fixturePath), "utf8"),
    })),
  );
  resolved.sort((a, b) => a.path.localeCompare(b.path));
  return resolved;
}

/** Flatten a `Record<path, substrings>` constraint map to a sorted list. */
function toConstraints(
  map: Record<string, string[]> | undefined,
): FileConstraint[] {
  if (map === undefined) return [];
  return Object.entries(map)
    .map(([filePath, substrings]) => ({ path: filePath, substrings }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** One-line, deterministic description of a `setup` pre-step for the document.
 * A `cli:` step renders as the `wtw …` command it runs; a `cp:` step as the
 * fixture copy it performs; a `run:` step as the program it executes (with the
 * `__WTW__` entrypoint token rendered as `wtw`, and `background`/`allowFailure`
 * flags surfaced so a modelled hook or fault-injection run reads honestly). The
 * per-step `env` map is intentionally not surfaced: its fake-shim sentinels are
 * test plumbing, not observable behavior. */
function describeSetupStep(step: SetupStep): string {
  if ("cli" in step) return `Runs \`${formatCommand(step.cli)}\``;
  if ("cp" in step) return `Copies \`${step.cp.from}\` → \`${step.cp.to}\``;
  const { cmd, background, allowFailure } = step.run;
  const rendered =
    cmd[0] === "__WTW__" ? formatCommand(cmd.slice(1)) : cmd.join(" ");
  const flags: string[] = [];
  if (background === true) flags.push("in the background");
  if (allowFailure === true) flags.push("tolerating failure");
  const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
  return `Runs \`${rendered}\`${suffix}`;
}

/**
 * Load cases and resolve their expected streams to strings so the renderer can
 * stay pure (and therefore unit-testable without touching the filesystem).
 */
export async function loadRenderCases(root: string): Promise<RenderCase[]> {
  const cases = await loadCases(root);
  return Promise.all(
    cases.map(async ({ manifest, dirPath }) => ({
      id: manifest.id,
      title: manifest.title,
      description: manifest.description,
      mode: manifest.mode ?? "fast",
      evidence: caseEvidence(manifest),
      cwd: manifest.cwd,
      command: manifest.command,
      covers: manifest.covers,
      setupSteps: manifest.setup.map(describeSetupStep),
      exitCode: manifest.expect.exitCode,
      stdout: await readStream(
        manifest.expect.stdout,
        manifest.expect.stdoutFile,
        dirPath,
      ),
      stdoutContains: manifest.expect.stdoutContains ?? [],
      stderr: await readStream(
        manifest.expect.stderr,
        manifest.expect.stderrFile,
        dirPath,
      ),
      inputFiles: await loadFixtureFiles(path.join(dirPath, "fixture")),
      outputFiles: await loadOutputFiles(dirPath, manifest.expect.files),
      fileContains: toConstraints(manifest.expect.fileContains),
      fileNotContains: toConstraints(manifest.expect.fileNotContains),
    })),
  );
}

function formatCommand(command: string[]): string {
  const args = command.map((arg) =>
    arg.length === 0 || /\s/.test(arg) ? `"${arg}"` : arg,
  );
  return ["wtw", ...args].join(" ");
}

function trimOneTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

const MODE_LABELS: Record<CaseMode, string> = {
  fast: "fast — real `wtw` entrypoint in an isolated temp environment",
  contract:
    "external contract — built `wtw` artifact against the pinned real Worktrunk v0.67.0",
  scenario:
    "scenario — bespoke ordered external-contract proof (real Worktrunk v0.67.0)",
};

const EVIDENCE_LABELS: Record<ToolEvidence, string> = {
  real: "Real",
  simulated: "Simulated",
  "not-exercised": "Not exercised",
};

/** The dependency-evidence section: the labelled mode plus per-tool real vs
 * simulated evidence. This is the render that keeps simulated evidence from
 * being mistaken for real lifecycle proof. */
function renderEvidenceSection(entry: RenderCase): string {
  return [
    `**Evidence** — dependency mode: ${MODE_LABELS[entry.mode]}`,
    "",
    `- Git: ${EVIDENCE_LABELS[entry.evidence.git]}`,
    `- Worktrunk: ${EVIDENCE_LABELS[entry.evidence.worktrunk]}`,
    `- Cursor: ${EVIDENCE_LABELS[entry.evidence.cursor]}`,
  ].join("\n");
}

/** The invoked command, as its own console block. */
function renderCommandSection(entry: RenderCase): string {
  return [
    "**Command**",
    "",
    "```console",
    `$ ${formatCommand(entry.command)}`,
    "```",
  ].join("\n");
}

/** Captured stdout/stderr as its own console block, with the exit code in the
 * section label rather than inside the block — so it can't be mistaken for a
 * line the command actually printed. */
function renderCliOutputSection(entry: RenderCase): string {
  const heading = `**CLI output** — exit ${entry.exitCode}`;
  const streams: string[] = [];
  if (entry.stdout.length > 0)
    streams.push(trimOneTrailingNewline(entry.stdout));
  if (entry.stderr.length > 0)
    streams.push(trimOneTrailingNewline(entry.stderr));

  const blocks =
    streams.length === 0
      ? [`${heading}\n\n_No exact stdout or stderr asserted._`]
      : [heading, "", "```console", ...streams, "```"];

  if (entry.stdoutContains.length > 0) {
    blocks.push(
      "",
      "**Required stdout substrings**",
      "",
      "```text",
      ...entry.stdoutContains,
      "```",
    );
  }

  return blocks.join("\n");
}

type TreeNode = {
  name: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
};

function appendTreeLines(
  node: TreeNode,
  prefix: string,
  lines: string[],
): void {
  const children = [...node.children.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    const label = child.isFile ? child.name : `${child.name}/`;
    lines.push(`${prefix}${isLast ? "└─ " : "├─ "}${label}`);
    appendTreeLines(child, `${prefix}${isLast ? "   " : "│  "}`, lines);
  });
}

/**
 * Render a sorted list of project-root-relative file paths as an ASCII tree
 * rooted at `./` (the project root the command runs in). Pure and
 * deterministic: paths are folded into a node trie and each level is emitted in
 * locale order.
 */
export function buildFileTree(paths: string[]): string {
  const root: TreeNode = {
    name: ".",
    isFile: false,
    children: new Map(),
  };
  for (const filePath of paths) {
    let node = root;
    const segments = filePath.split("/");
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { name: segment, isFile, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    });
  }
  const lines = ["./"];
  appendTreeLines(root, "", lines);
  return lines.join("\n");
}

/** Best-effort fenced-code language hint from a file extension. */
function languageHint(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const extension = dot === -1 ? "" : filePath.slice(dot + 1).toLowerCase();
  if (extension === "md" || extension === "markdown") return "md";
  if (extension === "yml" || extension === "yaml") return "yaml";
  if (extension === "toml") return "toml";
  if (extension === "json" || extension === "jsonc") return "json";
  if (extension === "jsonl") return "json";
  return "text";
}

/** Longest run of consecutive backticks anywhere in the content. */
function longestBacktickRun(content: string): number {
  let longest = 0;
  let current = 0;
  for (const char of content) {
    if (char === "`") {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

/** Wrap a fixture file in a path label plus a fence long enough to survive any
 * backticks inside it (file contents themselves may contain ``` fences). */
function renderFileBlock(file: FixtureFile): string {
  const ticks = "`".repeat(Math.max(3, longestBacktickRun(file.content) + 1));
  return [
    `\`${file.path}\``,
    "",
    `${ticks}${languageHint(file.path)}`,
    trimOneTrailingNewline(file.content),
    ticks,
  ].join("\n");
}

/** Wrap a body in a GitHub-rendered collapsible `<details>` block. */
function renderCollapsible(summary: string, body: string): string {
  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    body,
    "",
    "</details>",
  ].join("\n");
}

function describeCwd(cwd: string): string {
  return cwd === "." ? "the project root" : `\`${cwd}/\``;
}

/** One labelled root: its ASCII tree followed by every file's contents. */
function renderRootTree(label: string, files: FixtureFile[]): string {
  const tree = [
    "```text",
    buildFileTree(files.map((file) => file.path)),
    "```",
  ].join("\n");
  const fileBlocks = files.map(renderFileBlock).join("\n\n");
  return `${label}\n\n${tree}\n\n${fileBlocks}`;
}

/**
 * Input section: the local project (`fixture/`) the command sees, plus any
 * ordered `setup` pre-steps. An empty local root is still labelled with an
 * explicit Empty note so a case whose observed state is built entirely by setup
 * steps does not look like its output came from nowhere.
 */
function renderInputSection(entry: RenderCase): string {
  const localLabel = `**Local project** — ran from ${describeCwd(entry.cwd)}`;
  const blocks: string[] = [];

  if (entry.inputFiles.length > 0) {
    blocks.push(renderRootTree(localLabel, entry.inputFiles));
  } else {
    blocks.push(`${localLabel}\n\n_Empty — no committed workspace files._`);
  }

  if (entry.setupSteps.length > 0) {
    blocks.push(
      [
        "**Setup steps** — run before the command",
        "",
        ...entry.setupSteps.map((step) => `1. ${step}`),
      ].join("\n"),
    );
  }

  return blocks.join("\n\n");
}

/** Output section: the files the command leaves on disk (exact contents) and
 * any substring must/must-not constraints, when the case declares them. */
function renderOutputSection(entry: RenderCase): string | null {
  const blocks: string[] = [];
  if (entry.outputFiles.length > 0) {
    blocks.push(
      `**Output files**\n\n${entry.outputFiles.map(renderFileBlock).join("\n\n")}`,
    );
  }
  const constraintLines: string[] = [];
  for (const { path: filePath, substrings } of entry.fileContains) {
    for (const substring of substrings) {
      constraintLines.push(`- \`${filePath}\` contains \`${substring}\``);
    }
  }
  for (const { path: filePath, substrings } of entry.fileNotContains) {
    for (const substring of substrings) {
      constraintLines.push(
        `- \`${filePath}\` does not contain \`${substring}\``,
      );
    }
  }
  if (constraintLines.length > 0) {
    blocks.push(`**Output file constraints**\n\n${constraintLines.join("\n")}`);
  }
  return blocks.length === 0 ? null : blocks.join("\n\n");
}

/** GitHub-compatible heading anchor for ASCII headings: lowercase, drop
 * punctuation other than hyphens/underscores, spaces become hyphens. */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replace(/ /g, "-");
}

function requirementBadge(requirement: Requirement): string {
  return requirement.status === "active" ? "" : ` _(${requirement.status})_`;
}

/** The exact heading text used for a requirement; shared by the section
 * heading and its table-of-contents anchor so the two never drift. */
function requirementHeading(requirement: Requirement): string {
  return `${requirement.id} — ${requirement.title}${requirementBadge(requirement)}`;
}

/** Active, non-removed criteria — the ones the contract still asserts. */
function liveAcceptance(requirement: Requirement) {
  return requirement.acceptance.filter((ac) => ac.status !== "removed");
}

function renderAcceptanceTable(
  requirement: Requirement,
  byRef: Map<string, RenderCase[]>,
): string {
  const rows = liveAcceptance(requirement).map((ac) => {
    const cases = byRef.get(acceptanceRef(requirement.id, ac.id)) ?? [];
    const coverage =
      cases.length === 0
        ? "❌ uncovered"
        : `✅ ${cases.map((c) => `\`${c.id}\``).join(", ")}`;
    return `| ${ac.id} | ${ac.statement.trim()} | ${coverage} |`;
  });
  return [
    "| Criterion | Statement | Coverage |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Distinct covering cases for a requirement, in stable case-id order. */
function coveringCases(
  requirement: Requirement,
  byRef: Map<string, RenderCase[]>,
): RenderCase[] {
  const seen = new Map<string, RenderCase>();
  for (const ac of liveAcceptance(requirement)) {
    for (const entry of byRef.get(acceptanceRef(requirement.id, ac.id)) ?? []) {
      seen.set(entry.id, entry);
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Which of this requirement's criteria a given case demonstrates. */
function demonstratedRefs(
  requirement: Requirement,
  entry: RenderCase,
): string[] {
  const live = new Set(
    liveAcceptance(requirement).map((ac) =>
      acceptanceRef(requirement.id, ac.id),
    ),
  );
  return entry.covers.filter((ref) => live.has(ref));
}

function renderRequirement(
  requirement: Requirement,
  byRef: Map<string, RenderCase[]>,
): string {
  const blocks = [
    `### ${requirementHeading(requirement)}`,
    "",
    requirement.description.trim(),
    "",
    renderAcceptanceTable(requirement, byRef),
  ];

  if (requirement.status === "deferred" && requirement.coverage !== undefined) {
    blocks.push("", `> Deferred: ${requirement.coverage.trim()}`);
  }

  for (const entry of coveringCases(requirement, byRef)) {
    const acIds = demonstratedRefs(requirement, entry).map((ref) =>
      ref.slice(requirement.id.length + 1),
    );
    const sections = [
      renderEvidenceSection(entry),
      renderInputSection(entry),
      renderCommandSection(entry),
      renderOutputSection(entry),
      renderCliOutputSection(entry),
    ].filter((section): section is string => section !== null);
    blocks.push(
      "",
      `#### Case: ${entry.title}`,
      "",
      `Description: ${entry.description.trim()}`,
      "",
      `Covers: ${acIds.join(", ")}`,
      "",
      renderCollapsible(
        "Evidence, input, command & output",
        sections.join("\n\n"),
      ),
    );
  }

  return blocks.join("\n");
}

/** Map every acceptance-criterion ref to the cases that cover it. */
function indexCasesByRef(cases: RenderCase[]): Map<string, RenderCase[]> {
  const byRef = new Map<string, RenderCase[]>();
  for (const entry of cases) {
    for (const ref of entry.covers) {
      const existing = byRef.get(ref);
      if (existing === undefined) byRef.set(ref, [entry]);
      else existing.push(entry);
    }
  }
  return byRef;
}

/** Render the full behavior reference. Pure: same inputs always yield the same
 * Markdown, so a committed copy can be drift-checked with `--check`. */
export function renderDocument(areas: Area[], cases: RenderCase[]): string {
  const byRef = indexCasesByRef(cases);

  const visibleAreas = areas
    .map((area) => ({
      ...area,
      requirements: area.requirements.filter((r) => r.status !== "removed"),
    }))
    .filter((area) => area.requirements.length > 0);

  const requirementCount = visibleAreas.reduce(
    (sum, area) => sum + area.requirements.length,
    0,
  );
  const acceptanceCount = visibleAreas.reduce(
    (sum, area) =>
      sum + area.requirements.reduce((n, r) => n + liveAcceptance(r).length, 0),
    0,
  );

  const sections: string[] = [
    "<!-- Generated by `bun run docs:living`. Do not edit by hand. -->",
    "",
    "# Behavior reference",
    "",
    "Living documentation generated from the functional requirements in",
    "`packages/cli/requirements/functional/` and the end-to-end cases in",
    "`packages/cli/test/e2e/cases/`. Every example below is the expected output",
    "asserted by the e2e suite, so a passing gate (`bun run test:e2e` for fast",
    "cases, `bun run test:contract` for the external-contract suite) is also",
    "proof this document is accurate.",
    "",
    `**${requirementCount}** requirements · **${acceptanceCount}** acceptance ` +
      `criteria · **${cases.length}** end-to-end cases.`,
    "",
    "Each case declares its **dependency mode** and, per external dependency,",
    "whether it is wired to the **Real** genuine binary, a **Simulated** declared",
    "fake shim, or **Not exercised** (the dependency is not wired into the case —",
    "a pure surface case, or a Worktrunk scenario modelled with raw Git so no",
    "`wt` binary runs). Simulated evidence is never real lifecycle proof:",
    "real-Worktrunk evidence comes only from the external-contract suite, so the",
    "verified Worktrunk range `>=0.67.0 <0.68.0` is represented as supported",
    "solely because that suite passes against the pinned real v0.67.0 binary",
    "(see `WTW-FR-0012`).",
  ];

  sections.push("", "## Contents");
  for (const area of visibleAreas) {
    sections.push("", `- [${area.title}](#${slugify(area.title)})`);
    for (const requirement of area.requirements) {
      sections.push(
        `  - [${requirement.id} — ${requirement.title}](#${slugify(requirementHeading(requirement))})`,
      );
    }
  }

  for (const area of visibleAreas) {
    sections.push("", `## ${area.title}`);
    for (const requirement of area.requirements) {
      sections.push("", renderRequirement(requirement, byRef));
    }
  }

  return `${sections.join("\n")}\n`;
}
