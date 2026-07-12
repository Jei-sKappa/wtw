import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Architecture and toolchain invariants that the source-run E2E harness cannot
// observe: the two-package Bun workspace membership and its dependency wiring,
// the root aggregate scripts that gate formatting/linting, type checking, and
// tests, and the fail-fast composition of the aggregate gate script. These back
// the ARCH workspace/toolchain criteria and the HARNESS aggregate-gate
// criterion.

const repoRoot = path.resolve(import.meta.dirname, "../../..");

type PackageJson = {
  name?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

const GATE_STAGES = [
  "check",
  "typecheck",
  "test",
  "test:e2e",
  "test:contract",
  "docs:living:check",
  "build",
];

async function readPackageJson(relativePath: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(path.join(repoRoot, relativePath), "utf8"),
  ) as PackageJson;
}

describe("workspace shape", () => {
  it("declares a two-package Bun workspace consumed by the CLI via a workspace dependency", async () => {
    const root = await readPackageJson("package.json");
    expect(root.workspaces).toContain("packages/*");

    const cli = await readPackageJson("packages/cli/package.json");
    const core = await readPackageJson("packages/core/package.json");
    expect(cli.name).toBe("@wtw/cli");
    expect(core.name).toBe("@wtw/core");
    expect(cli.dependencies?.["@wtw/core"]).toMatch(/^workspace:/);
  });
});

describe("toolchain gates", () => {
  it("wires formatting, linting, type checking, and tests through root aggregate scripts", async () => {
    const scripts = (await readPackageJson("package.json")).scripts ?? {};
    for (const name of GATE_STAGES) {
      expect(typeof scripts[name]).toBe("string");
    }
    expect(scripts.check).toContain("biome");
    expect(scripts.typecheck).toContain("tsc");
    expect(scripts.test).toContain("vitest");
  });

  it("composes the aggregate gate so any failing stage aborts the run", async () => {
    const gate = (await readPackageJson("package.json")).scripts?.[
      "test-and-report"
    ];
    expect(typeof gate).toBe("string");
    const script = gate as string;
    for (const stage of GATE_STAGES) {
      expect(script).toContain(`bun run ${stage}`);
    }
    // `&&` chaining is what makes the gate fail-fast: a nonzero stage aborts the
    // rest. Loose separators (`;`, `||`) would let a failing stage be skipped.
    expect(script).toContain("&&");
    expect(script).not.toContain(";");
    expect(script).not.toContain("||");
  });
});
