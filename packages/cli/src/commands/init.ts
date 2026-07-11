import { Command } from "@commander-js/extra-typings";
import { WtwError } from "@wtw/core";

/**
 * `wtw init` — initialize local automation for this repository. Stub for the
 * CLI skeleton; Task 12 replaces the action body.
 */
export function makeInitCommand() {
  return new Command("init")
    .description("Initialize wtw local automation for this repository")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(() => {
      throw new WtwError("not_implemented", "wtw init is not implemented yet.");
    });
}
