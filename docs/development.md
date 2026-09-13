# Development loop

This document describes how to run the plugin against a live DeepSeek Harness
without a change to the `~/.dsh` installation that you use every day.

## Rules

- Do not start a second server on port 3080. The running interface uses that port.
  A development instance uses `--port 3081`.
- Do not let a development start write to the real `$DSH_HOME`. Set `DSH_HOME` to
  a temporary directory for the duration of the command.
- DSH writes the file `cordis.yml` of the profile at each start, because it
  materializes the composed tree there. A start against the real home is therefore
  a write to a live configuration file. A temporary home removes the problem.

## One-time setup

```sh
cd /path/to/dsh-sourcegraph
pnpm install          # harness packages land as devDependencies
pnpm run build        # tsc -b -> dist/
```

The submodule is not necessary for a build, because the repository contains the
vendored files. You need it to compare those files with upstream:

```sh
git submodule update --init --depth 1   # ~56 MB; without --depth 1 it is ~1.3 GB
```

### Why the project pins its own store and workspace

The file `pnpm-workspace.yaml` makes this directory its own workspace root, and
`.npmrc` keeps the content-addressable store inside the project at
`.pnpm-store/`. Both files are necessary because a `pnpm-workspace.yaml` in `$HOME`
makes pnpm treat the home directory as the workspace root. pnpm then manages
`~/node_modules` in place of the `node_modules` of this project.

An interrupted install can leave pnpm in a state where it wants to remove
`node_modules`. Without a terminal, pnpm refuses and stops:

```sh
CI=true pnpm install --ignore-scripts   # then re-run without CI
```

If the cache of the package manager is not writable, point it at a writable
directory for that command. Do not change the global configuration:

```sh
npm_config_cache=$(mktemp -d) pnpm install
```

## The three TypeScript configurations

The build is split, because third-party code and our code need different settings.

| Configuration | Covers | Strictness |
|---|---|---|
| `tsconfig.json` | Everything under `src/` except `src/vendor` | All strict flags on |
| `tsconfig.vendor.json` | `src/vendor/**` only | `strict` on. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` off |
| `tsconfig.test.json` | `src/**` except the vendor tree, and `tests/**` | Extends `tsconfig.json`, so the same flags as our own code |

`tsconfig.json` refers to the vendor project, so `tsc -b tsconfig.json` builds
both and writes `dist/vendor/...` next to `dist/...`. The command
`pnpm run typecheck` checks each one on its own.

The relaxed flags are recorded in `tsconfig.vendor.json` and in
`src/vendor/sourcegraph-query/PROVENANCE.md`. The vendored tree reports 16 errors
under our strict flags, and each error is a strictness complaint in the logic of
upstream rather than a defect. A rewrite of third-party code to satisfy our
preferences moves the copy away from upstream and makes it harder to audit.

The configuration relaxes exactly two flags. The flag `strict` stays on, so
everything that it covers still applies to the vendored tree. This point is
important, because `tsconfig.test.json` checks our own code. That file extends
`tsconfig.json` and not the vendor configuration, for this reason. An earlier
revision extended the vendor configuration, and that weakened the check for
`src/**` and `tests/**` without a warning. The result was a false negative inside
`pnpm run typecheck`.

Both configurations exclude `upstream/`, by design. Without that line, `tsc` walks
into the submodule and writes `.js` files next to its `.ts` sources. That pollutes
a checkout which must stay clean for the provenance comparison. If it occurs,
clean the checkout with:

```sh
git -C upstream/sourcegraph reset --hard && git -C upstream/sourcegraph clean -fd
```

## Option A: an overlay patch

An overlay loads a built entry from an absolute path. This is the fastest method
and needs no install.

```sh
mkdir -p .scratch
cat > .scratch/dev-patch.yml <<'YAML'
- insert:
    - name: '/absolute/path/to/dsh-sourcegraph/dist/index.js'
YAML

export DSH_HOME=$(mktemp -d)
dsh --profile dev --from-default-profile web \
  --patch "$PWD/.scratch/dev-patch.yml" \
  --port 3081 --no-open
```

These checks do not change anything:

```sh
# Show the composed tree, with the normalized plugin row, and exit.
dsh --profile dev --patch "$PWD/.scratch/dev-patch.yml" --dump-config

# Show the exports of the built module without a start.
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m), m.name, m.inject))"
```

The plugin entry must be the package root, `dist/index.js`. It must not be a
source file, because the loader runs JavaScript.

## Option B: install into a temporary profile

This option uses the same steps as a user.

```sh
export DSH_HOME=$(mktemp -d)
dsh plugin --profile dev add .          # relative spec is anchored to $PWD
dsh --profile dev --port 3081 --no-open
```

The command `dsh plugin add <spec>` sends the request to pnpm inside
`$DSH_HOME/profiles/dev`. It then adds the bundle to `dsh.profile.bundles`,
because the manifest declares `dsh.bundle.patch`. To remove the plugin, run
`dsh plugin --profile dev remove dsh-tool-sourcegraph`.

Two problems occur on a new profile:

- Credentials. A temporary home has none, so the agent cannot call a model and the
  tool never runs. Link the credential store from the real home, or give the key
  through the environment for that command.
- A package from git. A package that declares a `prepare` script runs that script
  at install time. pnpm blocks the script until you add its key to `allowBuilds`
  in the `pnpm-workspace.yaml` file of the profile. This package declares no
  `prepare` script, because the repository contains `dist/`. An install from
  `github:` therefore completes with no build step and no approval. The block
  still applies to other plugins from git.

## Rebuild while the plugin runs

The profile tree contains `@deepseek-ai/cordis-plugin-hmr`, and a custom profile
uses `patchReload: "live"` by default. The method is:

1. Change a file under `src/**`.
2. Run `pnpm run build`.
3. DSH sees the changed file under `dist/**` and reloads the plugin entry.

A change to a harness package is different. Those packages are dependencies at the
framework level, so a change to one needs a restart of the process. That behavior
is expected.

## Make sure that the plugin loaded

No silent failure mode here is safe to trust. Use these checks in this order:

1. `--dump-config` shows the plugin row under the `insert` of the overlay.
2. The boot log contains no line with `failed to apply loader entry`.
3. A temporary `console.log('[dsh-tool-sourcegraph] loaded')` in `apply` appears in
   the terminal. Remove it before you commit.
4. The model receives the tool in the development interface at
   `http://127.0.0.1:3081`.

## Common failures

| Symptom | Cause |
|---|---|
| `listen EADDRINUSE: address already in use 127.0.0.1:3080` | A development start without `--port`. The real interface holds port 3080 |
| `EPERM: operation not permitted, open '…/.dsh/profiles/web/cordis.yml'` | No `DSH_HOME`, so the start tried to write the live profile. A sandbox can also refuse the write |
| `failed to apply loader entry … cannot resolve entry` | A wrong path in the overlay, or the entry was not built |
| `Error: … plugin tree failed to load` with a stack inside the plugin | The module stopped during the import or during `apply`. Run the entry on its own with `node -e import(...)` to see the full error |
| A dependency that is installed but not active as a layer | Its manifest has no `dsh.bundle.patch`, so DSH installed it as a usual dependency |
| `pnpm not found on PATH` | `dsh plugin` sends the request to pnpm. Install pnpm, or use the overlay method |

## Packaging problem: the harness packages must resolve

When you mount the plugin by absolute path, Node resolves its `@deepseek-ai/*`
imports from the `node_modules` of this checkout, and not from the host. Each
transitive dependency of `@deepseek-ai/dsh-tools` must therefore also be installed
here. Without it, the load stops with an error that names the host package:

```
Cannot find package '@deepseek-ai/dsh-scope'
  imported from .../dsh-sourcegraph/node_modules/@deepseek-ai/dsh-tools/lib/index.js
```

The failure is in our tree, although the message names the host. To look at the
chain directly, run:

```sh
for p in $(grep -ohE '^import [^;]*from "[^"]+"' \
    node_modules/@deepseek-ai/dsh-tools/lib/index.js \
  | grep -oE '"[^"]+"' | tr -d '"' | sort -u); do
  [ -e "node_modules/$p" ] || echo "MISSING: $p"
done
```

The package `@deepseek-ai/dsh-scope` is the one that this project needed, and it
was absent until the first real start. The plugin declares its
`peerDependencies`, but a plugin that you mount by path must still load on its own
from start to end.

A published plugin, or one installed into a profile, resolves these packages from
the `node_modules` of the profile, which contains the full harness. The dependency
list above is what makes the development path work, so keep it current when the
imports of the harness change.

## Prove that the plugin runs

The command `--dump-config` shows only that the row composes. To prove that the
tool runs, drive the real registry. The file `.scratch/integration-check.mjs` is a
working example.

1. Build a `Context` and mount `ToolRuntime`. It also needs a `systemPrompt`
   service, because it connects the tool schemas to the prompt assembly.
2. Call `ctx.provide('credentials', …)` with a value that returns the reference
   that the profile configures. Cordis needs `provide` before you can read the
   property.
3. Call `await ctx.plugin(pluginModule, config)`. This is the same call that the
   loader makes.
4. Call `ctx.tools.execute({ callId, signal, name, arguments })`. The `signal`
   argument is necessary. Without it, the call fails inside the registry and not
   in your code.

A successful run prints the content that the agent loop receives.
