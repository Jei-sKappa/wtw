import { Command } from "@commander-js/extra-typings";
import { WtwError } from "@wtw/core";

/**
 * `wtw check` — read-only diagnostics for configuration drift. Stub for the
 * CLI skeleton; Task 13 replaces the action body.
 */
export function makeCheckCommand() {
  return new Command("check")
    .description("Diagnose wtw configuration drift without making changes")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(() => {
      throw new WtwError(
        "not_implemented",
        "wtw check is not implemented yet.",
      );
    });
}
