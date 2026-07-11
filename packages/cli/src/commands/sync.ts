import { Command } from "@commander-js/extra-typings";
import { WtwError } from "@wtw/core";

/**
 * `wtw sync [--open]` — propagate control files and reconcile the workspace
 * across worktrees. Stub for the CLI skeleton; Tasks 10–11 replace the action
 * body.
 */
export function makeSyncCommand() {
  return new Command("sync")
    .description("Synchronize control files and the workspace across worktrees")
    .option("--open", "Open the synchronized workspace in Cursor")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(() => {
      throw new WtwError("not_implemented", "wtw sync is not implemented yet.");
    });
}
