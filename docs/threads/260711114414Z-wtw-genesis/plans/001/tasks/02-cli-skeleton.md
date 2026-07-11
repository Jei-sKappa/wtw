### Task 2: CLI skeleton — program, argv validation, error envelope, version

**Objective:** Provide the runnable `wtw` entrypoint whose command surface is
exactly `init`, `sync [--open]`, and `check` plus help/version, with the
single-line `Error: <message>` failure envelope and the source-mode version
string, so every command task fills in a slot on a working program.

**Input / context:** Depends on Task 1's `@wtw/cli` package and toolchain. CLI
surface fixed by the spec's "Public CLI contract" section and decision log
`seed/discussions/260711115635Z-product-scope-and-mvp-decision-log.md` P15, P27;
version behavior by P14. Model the entrypoint on the Jastr reference:
`<jastr-ref>/src/index.ts` (top-level try/catch translating `CommanderError`
help/version codes to exit 0 and everything else to a one-line
`Error:` on stderr + exit 1), `src/program.ts` (`buildProgram()` with
`.exitOverride()`, `.configureOutput({ outputError: () => {} })`,
`.enablePositionalOptions()`), `src/args.ts` (pre-parse argv shape validator),
`src/errors.ts`, `src/version.ts`, and `src/globals.d.ts`.

**Steps:**
1. Add a `WtwError` class in `@wtw/core` (e.g. `packages/core/src/errors.ts`,
   re-exported from `index.ts`) carrying a string `code` and human message,
   mirroring `JastrError`. This is pure and boundary-safe. Export a
   `formatCliError(error): string` helper in `@wtw/cli`
   (`packages/cli/src/errors.ts`) that renders any error as
   `Error: <message>` and falls back to `Error: Unexpected failure.` for empty
   messages.
2. Create `packages/cli/src/version.ts`: import the CLI `package.json` version;
   export `WTW_VERSION` and `WTW_GIT_SHA_OR_DEV` = `WTW_GIT_SHA` when the
   injected global string is defined, else `"dev"`. Add
   `packages/cli/src/globals.d.ts` declaring `const WTW_GIT_SHA: string | undefined`.
3. Create `packages/cli/src/program.ts` exporting
   `buildProgram(): Command`. Configure `.name("wtw")`, a description,
   `.version(\`${WTW_VERSION} (${WTW_GIT_SHA_OR_DEV})\`)`,
   `.enablePositionalOptions()`, `.configureOutput({ outputError: () => {} })`,
   `.exitOverride()`, and add three subcommands `init`, `sync` (with a boolean
   `--open` option), and `check`. Wire each subcommand action to a command module
   under `packages/cli/src/commands/` that, for now, throws a
   `WtwError("not_implemented", …)`; later tasks replace each body.
4. Create `packages/cli/src/args.ts` exporting
   `validateCliArgv(argv: string[]): void`: accept bare invocation (root help),
   `-h`/`--help`/`help`/`-V`/`--version`; accept `init` and `check` with no
   command-specific options and no positionals; accept `sync` with only `--open`;
   reject every unknown command, unknown option, and unexpected positional with a
   `WtwError("invalid_command", …)` carrying a stable message. Follow the Jastr
   `args.ts` per-command validator pattern.
5. Create `packages/cli/src/index.ts`: build the program, call
   `validateCliArgv(process.argv.slice(2))`, `await program.parseAsync(process.argv)`
   inside a try/catch that maps Commander help/version codes to
   `process.exitCode = 0`, other `CommanderError`s and any thrown error to a
   one-line `Error:` on stderr with `process.exitCode = 1`, and writes nothing to
   stdout on failure.
6. Add unit tests at `packages/cli/test/args.test.ts` (each accept/reject branch
   of `validateCliArgv`) and `packages/cli/test/version.test.ts` (source mode
   yields `<version> (dev)`).

**Files modified:** `packages/core/src/errors.ts` (NEW),
`packages/core/src/index.ts`, `packages/cli/src/index.ts`,
`packages/cli/src/program.ts` (NEW), `packages/cli/src/args.ts` (NEW),
`packages/cli/src/errors.ts` (NEW), `packages/cli/src/version.ts` (NEW),
`packages/cli/src/globals.d.ts` (NEW),
`packages/cli/src/commands/init.ts` (NEW),
`packages/cli/src/commands/sync.ts` (NEW),
`packages/cli/src/commands/check.ts` (NEW),
`packages/cli/test/args.test.ts` (NEW),
`packages/cli/test/version.test.ts` (NEW)

**Verification:**
- `bun run typecheck` and `bun run check` exit 0.
- `bun run test packages/cli/test/args.test.ts packages/cli/test/version.test.ts`
  exits 0.
- Running the entrypoint via the runner (e.g.
  `bun packages/cli/src/index.ts --version`) prints exactly `<version> (dev)\n`
  and exits 0; `--help` and bare invocation exit 0; an unknown command prints one
  `Error: <message>` line to stderr, empty stdout, and exits 1.

**Acceptance criteria:**
- Bare `wtw`, root/command help, `-h`, and `--help` print help and exit 0.
  (AC-02.1)
- Only `init`, `sync [--open]`, and `check` are accepted; every excluded
  command/flag and unexpected positional exits 1 with exactly one
  `Error: <message>` on stderr and empty stdout. (AC-02.2)
- `init` and `check` reject every command-specific option; `sync` accepts only
  `--open`. (AC-02.3)
- Source-run `--version` and `-V` print exactly `<version> (dev)` and exit 0.
  (AC-15.1)

**Consumes:** `@wtw/cli`, `@wtw/core`, and the toolchain from Task 1.

**Produces:** `buildProgram(): Command` in `packages/cli/src/program.ts`;
`validateCliArgv(argv: string[]): void` in `packages/cli/src/args.ts`;
`formatCliError(error: unknown): string`; `WtwError` in `@wtw/core`; the runnable
`packages/cli/src/index.ts` entrypoint; stub command modules
`commands/{init,sync,check}.ts` for later tasks to fill.
