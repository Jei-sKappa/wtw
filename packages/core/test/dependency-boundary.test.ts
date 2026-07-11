import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AC-01.2: @wtw/core is the pure domain package. This test statically scans the
// whole `packages/core/src` tree so the boundary keeps holding as core grows,
// and fails if any source file imports a CLI, process-argument, subprocess,
// terminal-output, or filesystem-effect surface.

const testDir = path.dirname(fileURLToPath(import.meta.url));
const coreSrcDir = path.resolve(testDir, "../src");

/** Recursively collect every `.ts` file under `dir`. */
async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

/** Module specifiers @wtw/core is forbidden from importing. */
const FORBIDDEN_MODULES = [
  "@wtw/cli",
  "commander",
  "@commander-js/extra-typings",
  "execa",
  "node:child_process",
  "child_process",
  "node:fs",
  "node:fs/promises",
  "fs",
  "fs/promises",
  "node:process",
  "process",
  "node:readline",
  "node:readline/promises",
  "node:tty",
];

/** Match `import ... from "<spec>"`, `import "<spec>"`, and `require("<spec>")`. */
function importedModules(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /import\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1];
      if (spec !== undefined) {
        specifiers.push(spec);
      }
    }
  }
  return specifiers;
}

/** Effect surfaces core must never touch, even without an explicit import. */
const FORBIDDEN_EFFECT_TOKENS = [
  "process.argv",
  "process.cwd",
  "process.exit",
  "process.exitCode",
  "process.stdout",
  "process.stderr",
  "process.stdin",
  "process.env",
  "console.",
];

describe("@wtw/core dependency boundary", () => {
  it("has source files to scan", async () => {
    const files = await collectTsFiles(coreSrcDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports no CLI, process, subprocess, terminal, or filesystem module", async () => {
    const files = await collectTsFiles(coreSrcDir);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const rel = path.relative(coreSrcDir, file);
      for (const spec of importedModules(source)) {
        if (FORBIDDEN_MODULES.includes(spec)) {
          violations.push(`${rel}: imports forbidden module "${spec}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("references no process-argument, exit-code, or terminal-output effect surface", async () => {
    const files = await collectTsFiles(coreSrcDir);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const rel = path.relative(coreSrcDir, file);
      for (const token of FORBIDDEN_EFFECT_TOKENS) {
        if (source.includes(token)) {
          violations.push(
            `${rel}: references forbidden effect surface "${token}"`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
