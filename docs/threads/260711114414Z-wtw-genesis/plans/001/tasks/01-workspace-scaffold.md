### Task 1: Workspace and toolchain scaffold

**Objective:** Stand up the private Bun workspace with `@wtw/core` and
`@wtw/cli`, the shared Jastr-derived toolchain, aggregate root scripts, and the
dependency-boundary test, so every later task builds on a typechecking,
lintable, testable foundation.

**Input / context:** Empty repository (no `packages/` yet). Architecture and
toolchain fixed by the spec's "Repository and package architecture" section and
genesis decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P9–P11,
P15. Model every config on the Jastr reference:
`<jastr-ref>/package.json`, `tsconfig.base.json`, `tsconfig.json`, `biome.json`,
`vitest.config.ts`, and the two package `package.json` files. Path aliasing and
the vitest source-alias trick that lets the suite run against `@wtw/core` source
without a prior build are shown in `<jastr-ref>/vitest.config.ts` and
`tsconfig.base.json`.

**Steps:**
1. Create the root `package.json`: `private: true`, `type: "module"`,
   `workspaces: ["packages/*"]`, an `engines.node` floor (choose and document the
   supported Node baseline — a Degree of freedom), and `devDependencies` for
   `@biomejs/biome`, `@types/node`, `execa`, `typescript`, `vitest`, and a
   TypeScript runner for scripts (`tsx` or equivalent). Pin versions and record
   them as the documented, tested toolchain.
2. Add root aggregate scripts covering the stages available now: `format`
   (`biome format --write .`), `check`/lint (`biome check .`), `typecheck`
   (`tsc --noEmit`), `test` (`vitest run`), and `test:e2e`
   (`vitest run packages/cli/test/e2e`). Leave `build`, contract, living-doc, and
   full-report scripts for the tasks that introduce them.
3. Create `tsconfig.base.json` mirroring the Jastr strict options
   (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
   `isolatedModules`, `moduleResolution: "Bundler"`, `ESNext` module, ES2023
   target/lib, `types: ["node", "vitest/globals"]`) and a `paths` entry mapping
   `@wtw/core` to `packages/core/src/index.ts`. Create `tsconfig.json` extending
   it with the `include` globs for `packages/*/src`, `packages/*/test`,
   `packages/*/scripts`, and `vitest.config.ts`.
4. Create `biome.json` (formatter + linter + organize-imports assist) matching
   the Jastr settings, scoped to `packages/**/*.ts` and root JSON.
5. Create `vitest.config.ts` with `test.include` for
   `packages/*/test/**/*.test.ts` and a `resolve.alias` mapping `@wtw/core` to
   its `src/index.ts` (mirrors the tsconfig path so tests run against source).
6. Create `packages/core/package.json` (`@wtw/core`, private, `type: module`,
   `exports` → `dist`, `files: ["dist"]`, a `typecheck` script) and
   `packages/core/src/index.ts` with a placeholder export. Do not add effectful
   dependencies here.
7. Create `packages/cli/package.json` (`@wtw/cli`, private, `type: module`,
   `bin.wtw` → `./dist/index.js`, `files: ["dist"]`, dependency on `@wtw/core`
   via `workspace:*`, plus `commander` and `@commander-js/extra-typings`). Add a
   placeholder `packages/cli/src/index.ts`.
8. Choose the initial semantic version (a Degree of freedom) and set it in
   `packages/cli/package.json`.
9. Add the dependency-boundary test at
   `packages/core/test/dependency-boundary.test.ts`: statically read every
   `packages/core/src/**/*.ts` file and assert none import from `@wtw/cli`,
   `node:child_process`, `node:fs`/`node:fs/promises`, `node:process`,
   `process.argv`, `process.cwd`, `commander`, or any terminal/exit-code effect
   surface. The test must scan the directory tree so it keeps holding as core
   grows.
10. Run `bun install` and confirm the workspace resolves both packages.

**Files modified:** `package.json` (NEW), `tsconfig.base.json` (NEW),
`tsconfig.json` (NEW), `biome.json` (NEW), `vitest.config.ts` (NEW),
`packages/core/package.json` (NEW), `packages/core/src/index.ts` (NEW),
`packages/core/test/dependency-boundary.test.ts` (NEW),
`packages/cli/package.json` (NEW), `packages/cli/src/index.ts` (NEW),
`bun.lock` (NEW), `.gitignore` (append `dist` and `node_modules` if not covered)

**Verification:**
- `bun install` completes and lists `@wtw/core` and `@wtw/cli` as workspace
  packages.
- `bun run typecheck` exits 0.
- `bun run check` (biome) exits 0.
- `bun run test` exits 0 and the dependency-boundary test runs and passes.
- `test -f packages/core/package.json && test -f packages/cli/package.json`.

**Acceptance criteria:**
- A clean install recognizes a private Bun workspace containing `packages/core`
  and `packages/cli`, and `@wtw/cli` declares `@wtw/core` as a workspace
  dependency. (AC-01.1)
- The dependency-boundary test passes and proves `@wtw/core` imports no CLI,
  process-argument, subprocess, terminal-output, or filesystem-effect module.
  (AC-01.2)
- Formatting/linting, strict type checking, and tests all run green through root
  aggregate scripts using the Jastr-derived toolchain. (AC-01.3)

**Consumes:** none

**Produces:** the `@wtw/core` and `@wtw/cli` packages; root scripts `format`,
`check`, `typecheck`, `test`, `test:e2e`; `tsconfig.base.json` with the
`@wtw/core` path alias; the dependency-boundary test at
`packages/core/test/dependency-boundary.test.ts`.
