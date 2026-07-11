// @wtw/cli owns every effect and interface: process arguments, working-directory
// resolution, subprocesses, filesystem writes, terminal output, and exit codes.
// The built CLI targets Node via a `#!/usr/bin/env node` shebang injected at
// build time.
//
// Placeholder entrypoint; the real program is introduced by later tasks.
import { WTW_CORE_PACKAGE } from "@wtw/core";

export const WTW_CLI_PACKAGE = "@wtw/cli";
export const WTW_CLI_CORE_DEPENDENCY = WTW_CORE_PACKAGE;
