// Canonical Worktrunk `.config/wt.toml` scaffold and the reserved-hook contract.
//
// This module is part of `@wtw/core` and must stay effect-free: it exposes the
// scaffold text and the fixed reserved-hook records as pure data. It never reads
// the filesystem, spawns commands, or formats terminal output.
//
// The three reserved hooks below are the `wtw` contract (spec's "`.config/wt.toml`"
// section and review-findings decision log P7): their table names, keys, and
// command strings are fixed verbatim and must not drift. `hooks.ts` verifies an
// existing TOML against these same records, so this is the single source of truth.

/** One reserved Worktrunk hook: its table, key, and exact command string. */
export interface ReservedHook {
  /** The Worktrunk hook table the hook belongs to (e.g. `pre-start`). */
  readonly table: string;
  /** The hook key inside that table (e.g. `wtw-copy`). */
  readonly key: string;
  /** The exact command string the hook must carry. */
  readonly command: string;
}

/**
 * The three reserved hooks that make up the `wtw` contract, in scaffold order.
 * Keys and command strings are fixed verbatim by the spec and must not change.
 */
export const RESERVED_HOOKS: readonly ReservedHook[] = [
  {
    table: "pre-start",
    key: "wtw-copy",
    command: "wt step copy-ignored --require-include",
  },
  {
    table: "post-start",
    key: "wtw-sync",
    command: "wtw sync --open",
  },
  {
    table: "post-remove",
    key: "wtw-sync",
    command: "wtw sync",
  },
];

/**
 * Render a set of reserved hooks as TOML blocks, one `[table]` header per table
 * (in first-seen order) followed by its `key = "command"` lines, blocks joined by
 * a blank line. Used both to build the scaffold and to emit the exact manual
 * additions on a preflight conflict.
 */
export function renderReservedHooks(hooks: readonly ReservedHook[]): string {
  const order: string[] = [];
  const byTable = new Map<string, ReservedHook[]>();
  for (const hook of hooks) {
    let bucket = byTable.get(hook.table);
    if (bucket === undefined) {
      bucket = [];
      byTable.set(hook.table, bucket);
      order.push(hook.table);
    }
    bucket.push(hook);
  }
  return order
    .map((table) => {
      const bucket = byTable.get(table) ?? [];
      const lines = [
        `[${table}]`,
        ...bucket.map((hook) => `${hook.key} = "${hook.command}"`),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * The canonical `.config/wt.toml` scaffold text `wtw init` writes when the file
 * is absent: the three reserved hooks verbatim, terminated by a trailing newline.
 */
export const WT_TOML_SCAFFOLD = `${renderReservedHooks(RESERVED_HOOKS)}\n`;
