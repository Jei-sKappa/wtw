import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadCases } from "../test/e2e/harness/case-manifest";
import { loadRequirements } from "../test/e2e/harness/requirements";
import {
  type TraceabilityContext,
  validateTraceability,
} from "../test/e2e/harness/traceability";
import {
  loadAreas,
  loadRenderCases,
  OUTPUT_PATH,
  renderDocument,
} from "./living-docs";

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export type GenerateResult = {
  /** Whether this was a drift-check run (no write) or a write. */
  checked: boolean;
  /** The human-readable outcome line. */
  message: string;
};

/**
 * Enforce traceability, render `BEHAVIOR.md`, and either write it or (in
 * `check` mode) exact-compare bytes against the on-disk file. A drift check
 * throws and writes NOTHING; a write returns after replacing the file. Exposed
 * so the regression test can exercise the exact `--check` path in-process
 * without spawning a heavyweight subprocess.
 */
export async function generateLivingDocs(options: {
  root: string;
  check: boolean;
}): Promise<GenerateResult> {
  const { root, check } = options;

  // Enforce full traceability as part of generation (the same single authority
  // the e2e suite calls): every active acceptance criterion must be proven by
  // its declared evidence before the document can be written or drift-checked.
  // Evidence resolution is disk-derived — the git repo root is two levels above
  // this package root (`unit` refs are repo-root-relative), and `manual` refs
  // resolve against the release checklist.
  const [requirements, loadedCases, checklistContent] = await Promise.all([
    loadRequirements(root),
    loadCases(root),
    readFile(path.join(root, "docs/RELEASE-CHECKLIST.md"), "utf8"),
  ]);
  const gitRepoRoot = path.resolve(root, "../..");
  const traceabilityContext: TraceabilityContext = {
    repoFileExists: (repoRelativePath) =>
      existsSync(path.join(gitRepoRoot, repoRelativePath)),
    checklistContent,
  };
  validateTraceability(
    requirements,
    loadedCases.map((entry) => entry.manifest),
    traceabilityContext,
  );

  const [areas, cases] = await Promise.all([
    loadAreas(root),
    loadRenderCases(root),
  ]);
  const document = renderDocument(areas, cases);
  const absolutePath = path.join(root, OUTPUT_PATH);

  if (check) {
    const current = await readIfExists(absolutePath);
    if (current !== document) {
      throw new Error(
        `${OUTPUT_PATH} is out of date. Run \`bun run docs:living\` to regenerate.`,
      );
    }
    return { checked: true, message: `${OUTPUT_PATH} is up to date.` };
  }

  await writeFile(absolutePath, document, "utf8");
  return { checked: false, message: `Wrote ${OUTPUT_PATH}` };
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.slice(2).includes("--check");
  const result = await generateLivingDocs({ root, check });
  process.stdout.write(`${result.message}\n`);
}

// Run only when executed as the entry (via `tsx generate-living-docs.ts`),
// never on import — so the regression test can import `generateLivingDocs`
// without triggering a write.
const entryArg = process.argv[1];
if (
  entryArg !== undefined &&
  import.meta.url === pathToFileURL(entryArg).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
