# Worktrunk wrapper

Coming soon...

<!-- TODO: Mention official worktrunk repo/website -->

## Local installation

`wtw` is not published to a registry (both workspace packages are `private`), so
there is no global registry install. To use the `wtw` command outside the
repository, build the self-contained Node bundle and symlink it onto your `PATH`.

```bash
bun run build
ln -sf "$PWD/packages/cli/dist/index.js" ~/.local/bin/wtw
```

`bun run build` bundles `@wtw/core` into `packages/cli/dist/index.js`, so that
file is self-contained (it imports only Node built-ins) and runs directly via its
`#!/usr/bin/env node` shebang — no Bun required at runtime. The build injects the
current Git short SHA; a build with no resolvable SHA fails rather than shipping a
version string without one.

`~/.local/bin` must be on your `PATH`. Because the installed command is a symlink
to `dist/index.js`, every later `bun run build` updates it automatically — no
reinstall. Uninstall with `rm ~/.local/bin/wtw`.

See [`packages/cli/docs/INSTALL.md`](packages/cli/docs/INSTALL.md) for the full
procedure.
