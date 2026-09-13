# dsh-tool-sourcegraph

Sourcegraph code search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Gives the agent loop `sourcegraph_search`: full Sourcegraph query syntax against
public `sourcegraph.com` or a private/self-hosted instance, including code in
repositories that are not cloned locally.

## Install

```sh
dsh plugin --profile web add github:markab21/dsh-tool-sourcegraph
```

This is the only install path today — the package is **not published to npm**, so
`dsh plugin add dsh-tool-sourcegraph` fails with `ERR_PNPM_FETCH_404`. The git
install needs no build step and no pnpm approval prompt: `dist/` is committed and
the package declares no `prepare` script.

Then restart the profile. The bundle declares `dsh.bundle.patch`, so the package
joins the profile's layer stack automatically; nothing else to wire up.

### Configure the instance

**This step is required for a private instance.** The contributed row carries
`endpoint: https://sourcegraph.com` and `tokenRef: SOURCEGRAPH_TOKEN` by default,
so without a patch every query goes to the *public* instance.

Append to your profile's patch file — on a default install,
`~/.dsh/profiles/web/cordis.patch.yml`. A fresh profile ships that file as a bare
`[]` with a comment header, so you are appending an entry, not replacing one:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: tool-sourcegraph
  config:
    endpoint: https://sourcegraph.example.com   # default: https://sourcegraph.com
    tokenRef: SOURCEGRAPH_TOKEN                 # a credential NAME, not the token
    maxMatches: 30                             # count: is capped by this
    maxCharsPerMatch: 600
    search: true
```

**Check that the patch took effect.** An unknown `id` is not an error: dsh prints
`patch: entry "tool-sourcegraphx" not found` to stderr and continues with exit 0,
leaving the default endpoint in place. Confirm the row before using the tool:

```sh
dsh --profile web --dump-config | grep -A5 tool-sourcegraph
# expect:  # == dsh-tool-sourcegraph, patched by …/cordis.patch.yml
```

An unresolvable `tokenRef` does *not* fall back to anonymous access on a private
instance — it answers `401` with the hint
`the instance rejected the credential; check that the configured token reference
resolves`.

### Where the token lives

`tokenRef` names a credential, resolved per request, so a rotated token reaches
the next call without a restart. Resolution order, highest precedence first:

| Source | How |
|---|---|
| inherited environment | export `SOURCEGRAPH_TOKEN=…` before launching dsh |
| the credential store | `~/.dsh/.credentials.yaml` (mode 600): `version: 1`, then `refs:` mapping the name to the value |
| `.env` in the invocation directory | a lower-precedence fallback |

The store is the file the harness owns and is the option that needs nothing
exported at launch:

```yaml
# ~/.dsh/.credentials.yaml
version: 1
refs:
  SOURCEGRAPH_TOKEN: <token>
```

`tokenRef` can be omitted entirely when you use the default name.

**Alternative — enter the token in settings instead.** Set `apiToken` rather than
`tokenRef`; it wins when both are present and needs no credential store:

```yaml
- id: tool-sourcegraph
  config:
    endpoint: https://sourcegraph.example.com
    apiToken: <token>   # stored in your settings document, not the credential store
```

Unlike `tokenRef`, this deliberately puts the secret in configuration, which is
why `tokenRef` is the default. Both are fields of the plugin's settings
namespace, so either can also be written through the settings API —
`ctx.remote.settings.update('tool-sourcegraph', patch, revision)`.

> There is no form for these fields in the Settings screen yet. The plugin
> registers its settings namespace on the Host, but the **Plugin configuration**
> tab renders only cards a plugin ships a browser half for, and this one does not
> — so it appears under **Plugin list** as Running/Enabled with nothing to edit.
> See [docs/settings-ui.md](docs/settings-ui.md).


## The tool

`sourcegraph_search` passes its query through unchanged, so the whole query
language works — `repo:`, `lang:`, `file:`, `type:`, `select:`, boolean
operators, and every `patternType`:

| Argument | Type | Notes |
|---|---|---|
| `query` | string, required | Full Sourcegraph query, passed through unchanged |
| `patternType` | `keyword` \| `standard` \| `regexp` \| `structural` | Structural search is the same endpoint and result shape |
| `count` | integer | Maximum matches returned |
| `contextLines` | integer | Lines of context around each match |

Results come back grouped by repository and path with line numbers, and the tool
reports **why** a result set was truncated: the server's own `progress.skipped`
explanations, `alert` messages, and the narrowing filters it offered. The stream
is read incrementally and stops as soon as the requested match count is
satisfied, so a broad query stays bounded.

## Development

```sh
pnpm install
pnpm run release     # typecheck + test + build
pnpm run test
pnpm run check       # release + publint + pack dry-run
```

### Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Plugin entry: config, `sourcegraph_search`, credential resolution |
| `src/client.ts` | Bounded Server-Sent-Events reader for `/.api/search/stream` |
| `src/vendor/sourcegraph-query/` | Sourcegraph's own query scanner/parser, vendored — see its `PROVENANCE.md` |
| `upstream/sourcegraph/` | Git submodule pinned to the commit the vendored files came from |
| `dist/` | Build output, committed as the release artifact |
| `tests/` | Vitest suite over the client |

### Why `dist/` is committed

`dsh plugin add <git-url>` routes through pnpm, which refuses to run a package's
`prepare` script until the user allow-lists it. Committing the build keeps the
install free of both a build step and an approval prompt. Run `pnpm run release`
before committing so the artifact matches the source.

### Why the vendored tree is under `src/`

`tsc` compiles it to `dist/vendor/...`, so it ships with the plugin without a
separate copy step. Two configurations keep the standards separate:
`tsconfig.json` holds every strict flag for this project's code and excludes
`src/vendor`; `tsconfig.vendor.json` covers `src/vendor` with three strict flags
off, because upstream's code produces 16 strictness complaints that are not
defects. Rewriting third-party logic to satisfy our preferences would make the
copy drift from upstream and harder to audit.

### Verifying a mount by hand

`--dump-config` proves the row composes; it does not prove the tool executes.
`docs/development.md` has a registry-level check that mounts the built plugin and
dispatches a real call, plus the two gotchas: `ToolRuntime` requires a
`systemPrompt` service, and `ctx.tools.execute` requires a caller `signal`.

## Licensing

MIT (see `LICENSE`). This package **also contains third-party code**:
`src/vendor/sourcegraph-query/` is copied from Sourcegraph's client, which
declares Apache-2.0 in its package manifest while that repository's root carries
an enterprise license. The ambiguity, the exact upstream commit, and every
modification are recorded in
[`src/vendor/sourcegraph-query/PROVENANCE.md`](src/vendor/sourcegraph-query/PROVENANCE.md),
and both upstream license texts ship in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Read them before
redistributing.
