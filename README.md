# dsh-tool-sourcegraph

Sourcegraph code search inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The plugin exposes Sourcegraph's indexed code search to the agent loop as a
model tool, so the agent can find code across repositories it does not have on
disk — public code on `sourcegraph.com`, or a private/self-hosted instance.

> **Status: pre-implementation.** The repository holds project scaffolding, the
> bundle manifest, and the exploration notes only. No plugin code exists yet.
> See [`docs/kickoff.md`](docs/kickoff.md) for the design and open questions.

## What it will do

Three tools, all over Sourcegraph's real API:

| Tool | Purpose |
|---|---|
| `sourcegraph_search` | Full query syntax (`repo:`, `lang:`, `file:`, `type:`, boolean operators, `select:`) plus `patternType: structural` for structural search |
| `sourcegraph_fetch` | Read a file, or a line range, from a repository at a revision — including repositories not cloned locally |
| `sourcegraph_repo` | Discover repositories with filters such as `repo:has.topic()` and `repo:has.file()` |

Works against public `sourcegraph.com` with no token, and against a
private/self-hosted instance with an access token resolved through the Harness
credential seam rather than read from the environment directly.

## Install (once implemented)

```sh
dsh plugin --profile web add dsh-tool-sourcegraph   # from the registry
dsh plugin --profile web add /path/to/this/checkout # local checkout
```

## Layout

| Path | Purpose |
|---|---|
| `src/` | Plugin source (not yet written) |
| `src/vendor/sourcegraph-query/` | Sourcegraph's search-query scanner and parser, vendored — see its `PROVENANCE.md` |
| `upstream/sourcegraph/` | Git submodule pinned to the commit the vendored files were copied from |
| `THIRD-PARTY-NOTICES.md` | Upstream license texts, shipped with the package |
| `docs/` | Exploration notes and the development loop |

The vendored tree sits under `src/` deliberately: `tsc` compiles it to
`dist/vendor/sourcegraph-query/`, so it ships with the plugin without a separate
build step or a `files` entry.

## Licensing note

This project is MIT (see `LICENSE`). It **also contains third-party code**:
`src/vendor/sourcegraph-query/` is copied from Sourcegraph's client, which declares
Apache-2.0 in its package manifest while the repository root carries an
enterprise license. That ambiguity, the exact upstream commit, and the
modifications still required are all recorded in
[`src/vendor/sourcegraph-query/PROVENANCE.md`](src/vendor/sourcegraph-query/PROVENANCE.md),
and both upstream license texts are reproduced in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Read them before
redistributing this package.

## Development

```sh
pnpm install
pnpm run build      # tsc -b -> dist/ (strict src + relaxed src/vendor)
pnpm run typecheck
pnpm run test
pnpm run check      # typecheck + test + build + publint + pack dry-run
```

The development loop against a live Harness is described in
[`docs/development.md`](docs/development.md).

## License

MIT
