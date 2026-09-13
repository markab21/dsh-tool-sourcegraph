# dsh-tool-sourcegraph

Sourcegraph code search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The plugin gives the agent one tool, `sourcegraph_search`. The tool sends a full
Sourcegraph query to a public or private instance. It finds code in repositories
that are not on your disk.

## Install

```sh
dsh plugin --profile web add github:markab21/dsh-tool-sourcegraph
```

This is the only install command that works today. The package is not on npm, so
`dsh plugin add dsh-tool-sourcegraph` stops with `ERR_PNPM_FETCH_404`. The install
from git needs no build step and no pnpm approval. The repository contains the
built `dist/` directory, and the package declares no `prepare` script.

Restart the profile after the install. The bundle declares `dsh.bundle.patch`, so
the package joins the profile layer stack by itself. You do not wire up anything
else.

### Point the plugin at your instance

You must do this step for a private instance. The contributed row carries
`endpoint: https://sourcegraph.com` and `tokenRef: SOURCEGRAPH_TOKEN` by default.
Without a patch, every query goes to the public instance.

Edit the profile patch file. On a default install, the file is
`~/.dsh/profiles/web/cordis.patch.yml`.

A new profile ships that file with a comment header and one line that contains an
empty list: `[]`. Replace the `[]` with the entry below and keep the comments. Do
not add the entry after the `[]`, because the result is not valid YAML and dsh
stops with `failed to parse` and exit code 1.

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: tool-sourcegraph
  config:
    endpoint: https://sourcegraph.example.com   # default: https://sourcegraph.com
    tokenRef: SOURCEGRAPH_TOKEN                 # a credential name, not the token
    maxMatches: 30                             # the count argument cannot go higher
    maxCharsPerMatch: 600
    search: true
```

Make sure that the patch took effect. A wrong `id` is not an error. dsh writes
`patch: entry "tool-sourcegraphx" not found` to stderr, exits with code 0, and
keeps the default endpoint. Look at the composed row before you use the tool:

```sh
dsh --profile web --dump-config | grep -A5 tool-sourcegraph
# expect:  # == dsh-tool-sourcegraph, patched by …/cordis.patch.yml
```

A `tokenRef` that does not resolve does not become an anonymous request on a
private instance. The instance answers `401` and adds the hint
`the instance rejected the credential; check that the configured token reference
resolves`.

### Where the token lives

`tokenRef` names a credential. The plugin reads the value for each request, so a
new token is active on the next call. No restart is necessary. The order of
resolution is:

| Source | How to set it |
|---|---|
| inherited environment | export `SOURCEGRAPH_TOKEN=…` before you start dsh |
| the credential store | `~/.dsh/.credentials.yaml` (mode 600): `version: 1`, then a `refs:` map from the name to the value |
| `.env` in the invocation directory | a fallback with lower precedence |

The store belongs to the harness. It is the option that needs nothing exported at
start:

```yaml
# ~/.dsh/.credentials.yaml
version: 1
refs:
  SOURCEGRAPH_TOKEN: <token>
```

You can omit `tokenRef` when you use the default name.

As an alternative, put the token in the settings instead of the credential store.
Set `apiToken` in place of `tokenRef`. It wins when you set both:

```yaml
- id: tool-sourcegraph
  config:
    endpoint: https://sourcegraph.example.com
    apiToken: <token>   # stored in your settings document, not the credential store
```

Unlike `tokenRef`, this option puts the secret in the configuration. That is why
`tokenRef` is the default. Both fields belong to the plugin settings namespace,
so you can also write them through the settings API:
`ctx.remote.settings.update('tool-sourcegraph', patch, revision)`.

There is no form for these fields in the Settings screen yet. The plugin
registers its settings namespace on the Host. The tab named Plugin configuration
shows only the cards that a plugin ships a browser half for, and this plugin has
no browser half. The plugin therefore appears under Plugin list as Running and
Enabled, with nothing to edit. Refer to
[docs/settings-ui.md](docs/settings-ui.md).

## The tool

`sourcegraph_search` sends your query without a change, so the full query language
is available: `repo:`, `lang:`, `file:`, `type:`, `select:`, boolean operators,
and all pattern types.

| Argument | Type | Notes |
|---|---|---|
| `query` | string, required | Full Sourcegraph query, sent without a change |
| `patternType` | `keyword` \| `standard` \| `regexp` \| `structural` | Structural search uses the same endpoint and the same result shape |
| `count` | integer | The largest number of matches to return |
| `contextLines` | integer | Lines of context around each match |

The results are grouped by repository and path, with line numbers. The tool also
tells you why a result set stopped early. It reports the `progress.skipped`
entries from the server, the `alert` messages, and the filters that the server
offered. The client reads the stream as it arrives and stops when it has the
number of matches that you asked for, so a wide query stays bounded.

### The order of tools

The agent tries `sourcegraph_search` before it scans the local filesystem. The
plugin states this in two places, because a tool description competes with `glob`
and `grep` for the same task.

The description of the tool says to try it first when the local file is not known
already, and to use `glob` when the path is known and `grep` for a search that
must stay in the working directory.

The plugin also registers a system-prompt section named
`tool:sourcegraph_search`. The section sorts before the sections for `glob` (1400)
and `grep` (1500), so the model reads the order before it reads those tools. The
section returns empty text when the tool is not visible in the current scope, so a
deployment that sets `search: false` ships no guidance about a tool that it does
not have.

The instruction matters because the two tools answer different questions.
`sourcegraph_search` reaches repositories that are not on this machine, which
includes a dependency, a sibling service, and every repository in the index. `glob`
and `grep` see only the working directory. A search for a symbol that exists in
another repository returns nothing from `grep`, and the empty result looks like
proof that the symbol does not exist.

`tests/guidance.test.ts` fails if either statement loses the instruction.

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
| `src/index.ts` | Plugin entry: configuration, `sourcegraph_search`, credential resolution |
| `src/client.ts` | Server-Sent-Events reader for `/.api/search/stream`, with a limit |
| `src/vendor/sourcegraph-query/` | The query scanner and parser from Sourcegraph, vendored. Refer to its `PROVENANCE.md` |
| `upstream/sourcegraph/` | Git submodule, pinned to the commit that the vendored files came from |
| `dist/` | Build output, committed as the release artifact |
| `tests/` | Vitest suite for the client and the build artifacts |

### Why the repository contains `dist/`

`dsh plugin add <git-url>` runs through pnpm. pnpm does not run the `prepare`
script of a package until you add the package to `allowBuilds`. A committed build
removes both the build step and the approval prompt. Run `pnpm run release` before
you commit, so that the artifact matches the source.

### The vendored tree is present but not connected

`src/vendor/sourcegraph-query/` holds the query scanner and parser from
Sourcegraph. No runtime code imports it yet. The tool sends the query to the
server without a change. The copy is there so that a future version can reject a
bad query locally, before a round trip. That work is pending, together with the
`sourcegraph_fetch` and `sourcegraph_repo` tools. The directory is the largest
part of the package, which is important to know before you redistribute it.

`tsc` compiles the tree to `dist/vendor/...`, so it ships without a copy step. The
compiler settings stay separate. `tsconfig.json` holds every strict flag for this
project and excludes `src/vendor`. `tsconfig.vendor.json` covers `src/vendor` with
`strict` on and only `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` relaxed, because the upstream code reports 15
strictness problems that are not defects. A rewrite of third-party logic to
satisfy our preferences moves the copy away from upstream and makes it harder to
audit.

## Docs

| Document | What it covers |
|---|---|
| [`docs/development.md`](docs/development.md) | The local development loop, the three tsconfig files, the resolution problem with an installed plugin, and how to make sure that a mount works |
| [`docs/verification.md`](docs/verification.md) | The evidence log: what works, and how each claim was checked |
| [`docs/settings-ui.md`](docs/settings-ui.md) | The settings namespace, precedence, the browser settings API, and why no form exists yet |
| [`src/vendor/sourcegraph-query/PROVENANCE.md`](src/vendor/sourcegraph-query/PROVENANCE.md) | The vendored code: the upstream commit, each modification, and the license reading |
| [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) | Both upstream license texts, shipped with the package |
| [`docs/kickoff.md`](docs/kickoff.md) | Historical. The exploration before the implementation. Superseded decisions are marked, not removed |

### Make sure that a mount works

`--dump-config` shows that the row composes. It does not show that the tool runs.
`docs/development.md` contains a registry-level test that mounts the built plugin
and sends a real call. It also names the two problems that you can meet:
`ToolRuntime` needs a `systemPrompt` service, and `ctx.tools.execute` needs a
caller `signal`.

## Licensing

The project uses the MIT license. Refer to `LICENSE`. The package also contains
third-party code: `src/vendor/sourcegraph-query/` comes from the Sourcegraph
client, which declares Apache-2.0 in its package manifest while the root of that
repository carries an enterprise license. The record in
[`src/vendor/sourcegraph-query/PROVENANCE.md`](src/vendor/sourcegraph-query/PROVENANCE.md)
describes the ambiguity, the upstream commit, and each modification. Both upstream
license texts ship in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Read them
before you redistribute the package.
