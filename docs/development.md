# Development loop

How to run this plugin against a live DeepSeek Harness without touching the
`~/.dsh` installation the user is currently working in.

## Ground rules

- **Never boot a second server on port 3080.** That is the running GUI. A dev
  instance uses `--port 3081`.
- **Never let a dev boot write to the real `$DSH_HOME`.** Always set `DSH_HOME`
  to a scratch directory for the duration of the command.
- The profile's `cordis.yml` is rewritten on **every** boot (the composed tree is
  materialized there), so a boot against the real home is a write to a live
  configuration file. Scratch home avoids the question entirely.

## One-time setup

```sh
cd /path/to/dsh-sourcegraph
pnpm install          # harness packages land as devDependencies
pnpm run build        # tsc -b -> dist/
```

The submodule is optional for building — the vendored files are committed — but
is needed to diff them against upstream:

```sh
git submodule update --init --depth 1   # ~56 MB; without --depth 1 it is ~1.3 GB
```

### Why the project pins its own store and workspace

`pnpm-workspace.yaml` marks this directory as its own workspace root and
`.npmrc` keeps the content-addressable store inside the project
(`.pnpm-store/`). Both exist because a `pnpm-workspace.yaml` in `$HOME` would
otherwise make pnpm treat the home directory as the workspace root and try to
manage `~/node_modules` instead of this project's.

If an install is interrupted, pnpm can be left wanting to purge
`node_modules` and, without a TTY, refusing:

```sh
CI=true pnpm install --ignore-scripts   # then re-run without CI
```

If the package manager cache itself is not writable, point it somewhere
writable for the command rather than changing global config:

```sh
npm_config_cache=$(mktemp -d) pnpm install
```

## The two TypeScript configurations

The build is split, because third-party code and our code have different
standards:

| Config | Covers | Strictness |
|---|---|---|
| `tsconfig.json` | everything under `src/` **except** `src/vendor` | all strict flags on |
| `tsconfig.vendor.json` | `src/vendor/**` only | `strict` **on**; `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` off |
| `tsconfig.test.json` | `src/**` (except vendor) **and** `tests/**` | extends `tsconfig.json`, so the same flags as our own code |

`tsconfig.json` references the vendor project, so `tsc -b tsconfig.json` builds
both, emitting `dist/vendor/...` and `dist/...` side by side. `pnpm run typecheck`
checks each independently.

The relaxed flags are documented in `tsconfig.vendor.json` and
`src/vendor/sourcegraph-query/PROVENANCE.md`. In short: the vendored tree produces
16 errors under our strict flags, all of them strictness complaints in upstream's
own logic. Rewriting third-party code to satisfy our preferences would make the
copy drift from upstream and harder to audit.

Exactly two flags are relaxed — `strict` itself stays on, so everything it covers
still applies to that tree. This matters because `tsconfig.test.json` checks our
own code: it extends `tsconfig.json` rather than the vendor config on purpose. An
earlier revision extended the vendor config, which silently weakened the check for
`src/**` and `tests/**` — a false-negative channel inside `pnpm run typecheck`.

Both configs exclude `upstream/` deliberately. Without that, `tsc` walks into the
submodule and emits `.js` next to its `.ts` sources, polluting a checkout that
must stay pristine for provenance diffs. If that ever happens, clean it with:

```sh
git -C upstream/sourcegraph reset --hard && git -C upstream/sourcegraph clean -fd
```

## Option A — overlay patch (fastest, no install)

An overlay can load a built entry straight from the absolute path:

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

Useful non-destructive checks:

```sh
# Show the composed tree (includes the normalized plugin row) and exit.
dsh --profile dev --patch "$PWD/.scratch/dev-patch.yml" --dump-config

# Verify the built module's exports without booting anything.
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m), m.name, m.inject))"
```

The plugin entry should be the package root (`dist/index.js`), not a source
file: the loader executes JavaScript.

## Option B — install into a scratch profile (matches the shipping path)

This exercises exactly what a user will do:

```sh
export DSH_HOME=$(mktemp -d)
dsh plugin --profile dev add .          # relative spec is anchored to $PWD
dsh --profile dev --port 3081 --no-open
```

`dsh plugin add <spec>` forwards to pnpm inside `$DSH_HOME/profiles/dev`, then
appends the bundle to `dsh.profile.bundles` because the manifest declares
`dsh.bundle.patch`. Remove it with `dsh plugin --profile dev remove dsh-tool-sourcegraph`.

Two things that will bite on a fresh profile:

- **Credentials.** The scratch home has none, so the agent cannot call a model
  and the tool never runs. Either symlink the credential store from the real
  home, or provide the key through the environment for that command.
- **Git-hosted installs.** A git-hosted package that declares a `prepare` script
  runs it on install, and pnpm blocks that until its exact key is added under
  `allowBuilds` in the profile's `pnpm-workspace.yaml`. **This package is not one
  of those**: it declares no `prepare`, because `dist/` is committed, and a
  `github:` install completes with no build step and no approval prompt. The gate
  still applies to any *other* git-hosted plugin you try.

## Rebuilding while it runs

Host-side HMR (`@deepseek-ai/cordis-plugin-hmr`) is mounted in the profile tree,
and a custom profile defaults to `patchReload: "live"`. In practice:

1. edit `src/**`
2. `pnpm run build`
3. the changed `dist/**` file is watched and the plugin entry reloads

Harness packages themselves are framework-level dependencies: changing those
falls back to a process restart, which is expected.

## Verifying the plugin actually loaded

There is no silent failure mode worth trusting — check, in this order:

1. `--dump-config` shows the plugin row under the overlay's `insert`.
2. The boot log has no `failed to apply loader entry` line.
3. A temporary `console.log('[dsh-tool-sourcegraph] loaded')` in `apply` appears
   in the terminal (remove before committing).
4. The tool is offered to the model in the dev GUI at
   `http://127.0.0.1:3081`.

## Common failures

| Symptom | Cause |
|---|---|
| `listen EADDRINUSE: address already in use 127.0.0.1:3080` | A dev boot without `--port`; the real GUI holds 3080 |
| `EPERM: operation not permitted, open '…/.dsh/profiles/web/cordis.yml'` | No `DSH_HOME` set, so the boot tried to rewrite the live profile (or a sandbox denied the write) |
| `failed to apply loader entry … cannot resolve entry` | Wrong path in the overlay, or the entry was not built |
| `Error: … plugin tree failed to load` with a stack inside the plugin | The module threw during import or `apply`; run the entry directly with `node -e import(...)` to see the raw error |
| Dependency installed but not activated as a layer | Its manifest lacks `dsh.bundle.patch`, so it was installed as a plain dependency |
| `pnpm not found on PATH` | `dsh plugin` forwards to pnpm; install it or use the overlay route |

## Packaging gotcha: harness packages must resolve completely

Mounting the plugin by absolute path makes Node resolve its `@deepseek-ai/*`
imports from *this checkout's* `node_modules` — not the host's. That means every
transitive dependency of `@deepseek-ai/dsh-tools` must also be installed here, or
the load fails with a confusing error that points at the host package:

```
Cannot find package '@deepseek-ai/dsh-scope'
  imported from .../dsh-sourcegraph/node_modules/@deepseek-ai/dsh-tools/lib/index.js
```

The failure is about *our* tree, even though the message names the host's. Check
the chain directly:

```sh
for p in $(grep -ohE '^import [^;]*from "[^"]+"' \
    node_modules/@deepseek-ai/dsh-tools/lib/index.js \
  | grep -oE '"[^"]+"' | tr -d '"' | sort -u); do
  [ -e "node_modules/$p" ] || echo "MISSING: $p"
done
```

`@deepseek-ai/dsh-scope` is the one this project needed and did not have until
the first real boot. The plugin's `peerDependencies` are declared, but a
path-mounted plugin still has to be loadable end to end on its own.

A published or profile-installed plugin resolves these from the profile's
`node_modules` instead, which carries the whole harness. The dependency list
above is what makes the *development* path work, so keep it in sync when the
harness's own imports change.

## Proving the plugin actually runs

`--dump-config` only proves the row composes. To prove the tool executes, drive
the real registry (`.scratch/integration-check.mjs` is a working example):

1. build a `Context` and mount `ToolRuntime` — it also requires a
   `systemPrompt` service, because it wires tool schemas into prompt assembly;
2. `ctx.provide('credentials', …)` returning the reference the profile configures
   — Cordis requires `provide` before the property is readable;
3. `await ctx.plugin(pluginModule, config)` — the same call the loader makes;
4. `ctx.tools.execute({ callId, signal, name, arguments })` — `signal` is
   required, and omitting it fails inside the registry rather than in your code.

A passing run prints the model-facing content the agent loop would receive.
