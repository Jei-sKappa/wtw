import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// The external-contract suite (`contract.test.ts`) needs the built artifact and
// a pinned real Worktrunk, so it belongs ONLY to the separate `test:contract`
// gate (which sets `WTW_CONTRACT=1` after building). Every other run — `test`
// and the fast `test:e2e` gate — excludes it so those gates stay fast and never
// demand the real binary. Traceability still spans its case.yml manifests.
const includeContract = process.env.WTW_CONTRACT === "1";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace core package to its source during tests so the
      // suite runs against current source without requiring a prior build.
      // (Mirrors the tsconfig `paths` mapping; vite does not read tsconfig paths.)
      "@wtw/core": path.resolve(root, "packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    exclude: [
      ...configDefaults.exclude,
      ...(includeContract ? [] : ["**/contract.test.ts"]),
    ],
  },
});
