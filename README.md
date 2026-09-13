# dsh-tool-sourcegraph

Sourcegraph code search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Gives the agent loop `sourcegraph_search`: full Sourcegraph query syntax against
public `sourcegraph.com` or a private/self-hosted instance, including code in
repositories that are not cloned locally.

## Install

```sh
dsh plugin --profile web add dsh-tool-sourcegraph
```

Or straight from this repository — no build step, `dist/` is committed:

```sh
dsh plugin --profile web add github:markab21/dsh-tool-sourcegraph
```

Then restart the profile. The bundle declares `dsh.bundle.patch`, so the package
joins the profile's layer stack automatically; nothing else to wire up.

### Configure the instance

Override the contributed row's config in the profile's `cordis.patch.yml`:

```yaml
- id: tool-sourcegraph
  config:
    endpoint: https://sourcegraph.example.com   # default: https://sourcegraph.com
    tokenRef: SOURCEGRAPH_TOKEN                 # env-var NAME, not the token
    maxMatches: 30
    maxCharsPerMatch: 600
    search: true
```

`tokenRef` names an environment variable. The value is resolved **per request**
through the harness credential seam, so a rotated token reaches the next call
without a restart, and the secret never appears in configuration. An unresolved
reference means anonymous access, which is what a public instance expects.

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
