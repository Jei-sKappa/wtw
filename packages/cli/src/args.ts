import { WtwError } from "@wtw/core";

// The `wtw` command surface is fixed and small, so a pre-parse argv-shape
// validator (run before Commander) owns the stable `invalid_command`
// diagnostics for unknown commands, unknown options, and unexpected
// positionals. This mirrors the Jastr `args.ts` per-command validator pattern.

const expectedCommandShape =
  "Expected command shape: wtw init, wtw sync [--open], or wtw check (plus --help and --version).";

function isHelpToken(arg: string | undefined): boolean {
  return arg === "--help" || arg === "-h";
}

function isRootHelpOrVersionToken(arg: string | undefined): boolean {
  return (
    isHelpToken(arg) || arg === "--version" || arg === "-V" || arg === "help"
  );
}

/**
 * Validate the raw argv shape (already stripped of `node` and the script path).
 * Accepts a bare invocation (root help), the root help/version tokens, `init`
 * and `check` with no command-specific options or positionals, and `sync` with
 * only `--open`. Every unknown command, unknown option, or unexpected
 * positional throws `WtwError("invalid_command", …)`.
 */
export function validateCliArgv(argv: string[]): void {
  const [command] = argv;

  if (!command) {
    return;
  }

  if (isRootHelpOrVersionToken(command)) {
    return;
  }

  if (command !== "init" && command !== "sync" && command !== "check") {
    throw new WtwError("invalid_command", expectedCommandShape);
  }

  const rest = argv.slice(1);

  if (command === "sync") {
    validateSyncArgs(rest);
    return;
  }

  // `init` and `check` take no command-specific options and no positionals.
  validateOptionlessCommand(command, rest);
}

/**
 * `sync` accepts only the boolean `--open`; any other option or a positional is
 * an `invalid_command`.
 */
function validateSyncArgs(rest: string[]): void {
  for (const arg of rest) {
    if (isHelpToken(arg)) {
      return;
    }
    if (arg === "--open") {
      continue;
    }
    if (arg.startsWith("-")) {
      throw new WtwError("invalid_command", `Unknown sync option ${arg}.`);
    }
    throw new WtwError(
      "invalid_command",
      `Unexpected argument ${arg} for sync.`,
    );
  }
}

/**
 * `init` and `check` reject every command-specific option and every positional.
 */
function validateOptionlessCommand(command: string, rest: string[]): void {
  for (const arg of rest) {
    if (isHelpToken(arg)) {
      return;
    }
    if (arg.startsWith("-")) {
      throw new WtwError(
        "invalid_command",
        `Unknown ${command} option ${arg}.`,
      );
    }
    throw new WtwError(
      "invalid_command",
      `Unexpected argument ${arg} for ${command}.`,
    );
  }
}
