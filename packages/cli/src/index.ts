// @wtw/cli owns every effect and interface: process arguments, working-directory
// resolution, subprocesses, filesystem writes, terminal output, and exit codes.
// The built CLI targets Node via a `#!/usr/bin/env node` shebang injected at
// build time.
import { CommanderError } from "@commander-js/extra-typings";
import { validateCliArgv } from "./args";
import { formatCliError } from "./errors";
import { buildProgram } from "./program";

const program = buildProgram();

try {
  validateCliArgv(process.argv.slice(2));
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    if (
      error.code === "commander.helpDisplayed" ||
      error.code === "commander.help" ||
      error.code === "commander.version"
    ) {
      process.exitCode = 0;
    } else {
      process.stderr.write(`Error: ${error.message.replace(/^error: /, "")}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stderr.write(`${formatCliError(error)}\n`);
    process.exitCode = 1;
  }
}
