### Task 14: Build, version SHA injection, and local install

**Objective:** Produce a self-contained Node-targeted CLI bundle containing
`@wtw/core`, inject `WTW_GIT_SHA` from `git rev-parse --short HEAD` so the built
binary prints `<version> (<short-sha>)`, fail a build with no resolvable SHA, and
document the symlink install procedure.

**Input / context:** Depends on Task 2's `version.ts`/`globals.d.ts` and the
`bin.wtw` declaration from Task 1. Behavior fixed by the spec's "Build, version,
and local installation" section and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P11, P14,
P26. Model the build command on `<jastr-ref>/packages/cli/package.json`'s
`bun build … --define` + `--banner='#!/usr/bin/env node'` pattern. Bun is the
bundler; the artifact targets Node and must not require Bun.

**Steps:**
1. Add the CLI `build` script to `packages/cli/package.json`:
   `bun build src/index.ts --target=node --outdir=dist` with a
   `--banner='#!/usr/bin/env node'` shebang and
   `--define WTW_GIT_SHA="\"$(git rev-parse --short HEAD)\""`. Bundle `@wtw/core`
   into the output (workspace source), so the artifact carries no unresolved
   `@wtw/core` runtime import.
2. Make a build with no resolvable Git SHA fail clearly (the define must not
   silently become empty/`dev`). There is no dirty-tree suffix. Add a root
   `build` script that builds core (if a separate build step is used) and the
   CLI, mirroring the Jastr `build`/`build:*` root scripts.
3. Add a build test at `packages/cli/test/build.test.ts` (or a script-driven
   test) that builds with a known injected short SHA and asserts the resulting
   bundle prints exactly `<package-version> (<known-sha>)`, has the Node shebang
   as its first line, and runs under the supported Node runtime without Bun on
   `PATH`. Add a negative check that a build with no resolvable SHA fails.
4. Add the local-install documentation: create/extend `README.md` (and/or
   `packages/cli/docs/INSTALL.md`) stating the direct symlink from
   `~/.local/bin/wtw` to the built bundle, that `~/.local/bin` must be on `PATH`,
   that rebuilding updates the command through the symlink, and that removing the
   symlink uninstalls it. Keep packages private.
5. Add an install-behavior test proving the symlink flow: build, symlink into a
   temp `bin` dir on `PATH`, run `wtw --version`, rebuild with a different
   injected SHA and confirm the reported SHA changes without reinstalling, then
   remove the symlink and confirm the command is gone.
6. Extend the FR-15 requirement manifest
   `packages/cli/requirements/functional/15-version.yml` (created in Task 3 with
   AC-15.1) with AC-15.2, AC-15.3, and AC-15.4, keeping one-to-one AC identifiers
   with the spec. AC-15.2/15.3/15.4 are established through the build/install
   tests above rather than the fast E2E harness — note that evidence path in the
   requirement file so the Task 16 traceability check treats them as covered.

**Files modified:** `packages/cli/package.json`, `package.json` (root `build`
scripts), `packages/cli/test/build.test.ts` (NEW),
`packages/cli/test/install.test.ts` (NEW),
`packages/cli/requirements/functional/15-version.yml`,
`README.md`, `packages/cli/docs/INSTALL.md` (NEW)

**Verification:**
- `bun run build` produces `packages/cli/dist/index.js` with `#!/usr/bin/env node`
  as its first line.
- Running the built bundle under Node (no Bun) prints `<version> (<short-sha>)`
  and exits 0.
- `bun run test packages/cli/test/build.test.ts packages/cli/test/install.test.ts`
  exits 0.
- A build invoked with no resolvable Git SHA fails with a clear error.

**Acceptance criteria:**
- A build test injects a known short SHA and the bundle prints exactly
  `<package-version> (<known-sha>)`; building with no resolvable Git SHA fails
  clearly. (AC-15.2)
- The bundle has a Node shebang, is self-contained (no unresolved `@wtw/core`
  runtime import), and runs under the supported Node runtime without Bun.
  (AC-15.3, AC-01.4)
- The documented symlink procedure makes `wtw` available on `PATH`, a rebuild
  changes the reported embedded SHA without reinstall, and removing the symlink
  removes the command. (AC-15.4)

**Consumes:** `version.ts`/`globals.d.ts` (Task 2); the `bin.wtw` declaration and
package layout (Task 1).

**Produces:** the `packages/cli/dist/index.js` Node bundle (self-contained,
shebang, injected SHA); the root and CLI `build` scripts; the install
documentation; the build and install tests; the FR-15 requirement manifest
extended with AC-15.2/15.3/15.4.
