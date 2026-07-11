# wtw CLI — local installation

`wtw` is not published to any registry. Both workspace packages (`@wtw/cli` and
`@wtw/core`) are `private`, and `@wtw/cli` declares `@wtw/core` as a
`workspace:*` dependency — a protocol that only resolves inside this workspace.
A global registry install or `npm link` would therefore fail trying to fetch
`@wtw/core`. The supported install is a direct symlink to the built bundle.

## Build the bundle

```bash
bun run build
```

This runs `bun build` with `--target=node`, bundling `@wtw/core` (and its
dependencies) into a single self-contained file at
`packages/cli/dist/index.js`. The bundle:

- imports only Node built-ins at runtime, so it carries **no unresolved
  `@wtw/core` import** and needs **no Bun** installed to run;
- begins with a `#!/usr/bin/env node` shebang, so it executes directly under the
  supported Node runtime;
- embeds the current Git short SHA (`git rev-parse --short HEAD`) as its version
  suffix, so `wtw --version` prints `<version> (<short-sha>)`.

A build that cannot resolve a Git short SHA **fails** with a clear error rather
than embedding an empty or placeholder SHA. There is no dirty-tree suffix.

## Install with a symlink

Symlink the bundle into a directory on your `PATH` (`~/.local/bin` is the
documented choice):

```bash
ln -sf "$PWD/packages/cli/dist/index.js" ~/.local/bin/wtw
```

Requirements and behavior:

- **`~/.local/bin` must be on your `PATH`.** Add it (e.g.
  `export PATH="$HOME/.local/bin:$PATH"`) if it is not already.
- **Rebuilding updates the command.** Because `wtw` is a symlink to
  `dist/index.js`, every later `bun run build` refreshes the installed command
  in place — no reinstall, and the reported embedded SHA changes accordingly.
- **Removing the symlink uninstalls it:**

  ```bash
  rm ~/.local/bin/wtw
  ```

  After removal, `wtw` is no longer found on `PATH`.
