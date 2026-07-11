import { Command } from "@commander-js/extra-typings";
import { makeCheckCommand } from "./commands/check";
import { makeInitCommand } from "./commands/init";
import { makeSyncCommand } from "./commands/sync";
import { WTW_GIT_SHA_OR_DEV, WTW_VERSION } from "./version";

/**
 * Build the root `wtw` program. `.exitOverride()` and the silenced
 * `outputError` let `index.ts` own every exit code and the single-line failure
 * envelope; `.enablePositionalOptions()` keeps subcommand options from being
 * swallowed by the root.
 */
export function buildProgram(): Command {
  return new Command()
    .name("wtw")
    .description("Per-clone setup companion for Worktrunk worktrees")
    .version(`${WTW_VERSION} (${WTW_GIT_SHA_OR_DEV})`)
    .enablePositionalOptions()
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .addCommand(makeInitCommand())
    .addCommand(makeSyncCommand())
    .addCommand(makeCheckCommand());
}
