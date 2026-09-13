# dsh-tool-sourcegraph — Kickoff

Exploration notes from 2026-09-13, before any plugin code was written. Everything
under "Verified" was confirmed by running the installed Harness
(`@deepseek-ai/dsh@0.1.5-rc.1`) on this machine, not read from documentation
alone.

## 1. Goal

Give the DeepSeek Harness agent loop Sourcegraph-backed code search: find and
read code in repositories that are not cloned locally, across a large index.

The plugin is a **Harness plugin** (a Cordis plugin row) — not a Sourcegraph
extension, and not an MCP server. It ships as an npm package that a DSH profile
installs and mounts.

## 2. How DSH plugins actually work

Both reference pages describe the same model from different angles: the
[Harness plugin guide](https://github.com/deepseek-ai/deepseek-harness/discussions/3141)
and the community
[build-dsh-plugin](https://github.com/AI-Scarlett/build-dsh-plugin) skill.

A plugin is a module exporting `apply(ctx)` (plus optional `name` / `inject`).
Everything registered through `ctx` is fiber-scoped: unloading the plugin
disposes its tools, listeners, and timers automatically.

### Verified: three ways a plugin gets into a running Harness

| Route | Mechanism | Use |
|---|---|---|
| `--patch <file>` overlay | `- insert: [{ name: '/abs/path/to/plugin.mjs' }]` | Fastest iteration; no install step |
| Profile bundle | Package declares `dsh.bundle.patch`; `dsh plugin add` | The shipping path |
| Agent preset row | A row inside an agent preset composition | Session-scoped, not for a distribution |

Evidence: dumping the composed tree with an overlay showed the row normalized to
`- name: file:///tmp/dshprobe/plug/probe.mjs` (an absolute path becomes a
`file://` spec; the `id` is optional). Booting that profile printed
`[probe-plugin] registered probe_echo` — a real `defineTool` registration —
before the boot stopped only because port 3080 was already held by the running
GUI.

### Verified: profiles keep plugin resolution working

- A profile lives at `$DSH_HOME/profiles/<name>/`, with its own `package.json`
  (`dsh.profile.bundles` layer stack) and `cordis.patch.yml` user layer.
- `dsh plugin --profile <name> add <spec>` forwards to pnpm in the profile
  directory, then reconciles `dsh.profile.bundles` against what is installed: a
  dependency whose manifest declares `dsh.bundle.patch` joins the layer stack
  automatically. No manual wiring.
- Relative path specs (`add .`, `add ../plugin`) are rewritten against the
  **invoking** directory, so `add .` from a checkout links that checkout and not
  the profile.
- `$DSH_HOME/profiles/node_modules` mirrors the dsh installation's dependencies
  and is healed on boot, which is how a linked plugin's harness imports keep
  resolving without duplication.

### Verified: the plugin loader resolves TypeScript-style specifiers

The loader rewrites `.ts` / `.tsx` / `.mts` specifiers to their emitted `.js`
form at import time. This is the same convention
`tsconfig.json` → `rewriteRelativeImportExtensions: true` applies at build time,
so `import { x } from './search.ts'` written in `src/` executes correctly from
`dist/` with no other adjustment.

### Verified: HMR is mounted

The web profile tree mounts `@deepseek-ai/cordis-plugin-hmr` as row `hmr`.
Custom profiles default to `patchReload: "live"`. Editing a built plugin file
while a dev profile runs should reload the entry; editing **source** still
requires `pnpm run build` first.

## 3. Conventions taken from shipped community plugins

The closest sibling is [`lonelymoon87/dsh-code-intel`](https://github.com/lonelymoon87/dsh-code-intel)
(TypeScript, tested, published). Its shape is reproduced here, with versions
updated to what the installed Harness runs:

- `package.json` → `dsh.bundle.patch: ./cordis.patch.yml`; `main`/`types` in
  `dist/`; `files` ships `dist`, the patch file, README, LICENSE.
- `cordis.patch.yml` → one `insert` of `{ id, name: <bare package name> }`.
- **Harness packages are `peerDependencies`, never `dependencies`.** The host
  supplies them; bundling a second copy would split service identity.
  `devDependencies` pin exact versions for typecheck and tests.
- `tsconfig.json` → `module`/`moduleResolution: NodeNext`,
  `rewriteRelativeImportExtensions`, `strict`, `verbatimModuleSyntax`,
  `rootDir: src`, `outDir: dist`.
- `prepare` runs the build so git-hosted installs arrive compiled.
- `test` is vitest; `check` adds `publint` and `npm pack --dry-run`.

## 4. DSH services this plugin can use

| Service | Provides | Relevance |
|---|---|---|
| `ctx.tools` (`inject: ['tools']`) | Tool registry; `register(defineTool(...))` | The core of the plugin |
| `ctx.credentials` | Secret **references** resolved per operation; the value never enters config | Sourcegraph access token |
| `ctx.web` | Web provider registry + `web_search` / `web_fetch` seams | An alternative integration point (below) |
| `ctx.systemPrompt` | Ordered prompt sections and variables | Optional usage guidance |
| `ctx.settings` | Namespaced settings surface | Instance URL and defaults in the GUI |

`defineTool` requires a **canonical output declaration**: `output.schema` is
enforced against every successful return, and `output.render(args, value)`
projects that value into model-facing content blocks. `execute` returns the
canonical JSON value only. Optional: `timeoutMs`, `isConcurrencySafe`,
`finalizeContent`, `presentCall` / `presentResult`.

## 5. Two integration surfaces, and the choice between them

### (A) Its own model tools — recommended

`sourcegraph_search` + (optionally) `sourcegraph_fetch`. Full control over query
pass-through, result shaping, truncation, and cancellation.

Sourcegraph's [streaming search API](https://sourcegraph.com/docs/api/stream-api)
(`GET /.api/search/stream?q=…&v=V3`, SSE) is the right substrate: it returns
results incrementally, supports `count:`, `display:`, and `cl=` (context lines),
and reports server-side limits as `alert`, `progress.skipped[]`, and `filters`
events — so a truncated search can say *why* it was truncated.

**Verified on this machine:** anonymous search against `sourcegraph.com` works
with no token, and returns real `matches` events (content and `type:repo`
results, with `repository`, `path`, `lineMatches[].lineNumber`, `repoStars`,
`skipped[]` limit explanations). A token is required for private instances;
the same endpoint accepts `Authorization: token <token>`.

### (B) Register a `ctx.web` provider

`registerSearchProvider({ id, available(), search() })` would make Sourcegraph
one option behind the existing `web_search` tool, selectable per deployment.
Cheaper in code, but it collapses code search into an 8-source generic search
shape (`WebSearchResult`) and loses query semantics. Better as a *later*
addition than as the primary design — and note it must not collide with the
already-installed DeepSeek search provider (`WEB_DUPLICATE_PROVIDER`).

### GraphQL

`/.api/graphql` covers what streaming search does not: single-repository
metadata, the resolved default branch, and file content at a revision. Verified
working anonymously against `sourcegraph.com` and used by `sourcegraph_fetch` —
see section 9. Diff and commit search remain on the streaming endpoint.

## 6. Tool cards

The shipped Web Client does **not** consume `presentCall` / `presentResult`;
those are Host-local and exist for other consumers. The Web Client selects a
renderer through `tool.call.toolview` and derives card props from raw arguments,
result content, failure state, and persisted metadata — so a plugin gets a
generic card for free, and a custom card only by registering a **Client** half.
That decision can be deferred: the Host tool works in the GUI without it.

## 7. Dev loop

Full detail in [`development.md`](development.md). The short version:

```sh
pnpm run build
export DSH_HOME=$(mktemp -d)
dsh plugin --profile dev add .              # links this checkout as a bundle
dsh --profile dev --port 3081 --no-open     # a second GUI, your own untouched
```

## 8. Decisions (confirmed 2026-09-13)

| # | Decision |
|---|---|
| 1 | **Both** `sourcegraph.com` and self-hosted instances must work. Instance URL is plugin config; the access token is a credential reference resolved per operation, and its absence means anonymous mode rather than a failure. |
| 2 | **Three tools in v1:** `sourcegraph_search`, `sourcegraph_fetch`, `sourcegraph_repo`. |
| 3 | **Local checkout / private install** for now. The manifest stays publish-ready, `private: true` prevents an accidental release, and nothing public is locked in. |
| 4 | No custom Client card in v1 — the generic card carries it. |
| 5 | Single instance per profile in v1. |

### What this scope implies

Three tools means three canonical output schemas, three truncation stories, and
one shared client. The unifying decision below keeps that tractable.

## 9. Verified API surface

All three tools rest on endpoints verified by hand on 2026-09-13.

### Streaming search — `GET /.api/search/stream?q=…&v=V3` (SSE)

Anonymous against `sourcegraph.com`; `Authorization: token <token>` for a
private instance. Confirmed working: `patternType:keyword`, `patternType:structural`
(a real structural query returned a match), `count:`, `select:repo`
(repository enumeration), and `type:repo` matches carrying `description`,
`repoStars`, and `topics`. Limit conditions arrive as `progress.skipped[]` and
`alert` events, so truncation can be reported honestly.

Two operational notes:

- The stream must be read **incrementally**. Buffering a whole response defeats
  the endpoint and risks unbounded memory on a broad query.
- `event: done` terminates; a client must also handle the connection closing
  early with matches already received.

### GraphQL — `POST /.api/graphql`

Anonymous against `sourcegraph.com`; a token is required on a private instance.
Verified:

```graphql
{ repository(name: "github.com/kubernetes/kubernetes") {
    commit(rev: "HEAD") { oid file(path: "go.mod") { content } } } }
```

returns the resolved commit `oid` **and** the file content in one call — which is
what `sourcegraph_fetch` needs, together with `defaultBranch { abbrevName }`,
`url`, `description`, and `stars`.

A caveat worth remembering: `repository(name:)` returns `null` for a repository
the instance does not have (a de-indexed private repo behaved exactly like a
typo), so the tool must report "not found or not indexed" rather than crash.

### Raw file content — `/<repo>@<commit>/-/raw/<path>`

Returns a **301 to `/r/<repo>@<commit>/-/raw/<path>`**. Any fallback path that
uses this endpoint must follow the redirect. GraphQL `file.content` is the
primary source; the raw endpoint is the fallback when the API is unavailable.

### No new HTTP dependency

The streaming endpoint is plain SSE over `fetch`, and GraphQL is a POST. Node's
built-in `fetch` plus `AbortSignal` covers all of it, so the plugin adds no
runtime dependencies — an SSE line parser and the GraphQL calls are ours to own.

### Rejected: the `ctx.web` provider route

`ctx.web.registerSearchProvider()` was considered in section 5 and is **not** the
design. A code-search result does not fit `WebSearchResult`, and structural
search, `select:`, and file fetch have no place in that shape.

## 10. Proposed tool contracts

Names are `sourcegraph_*` to read as siblings of the built-in `web_search` /
`web_fetch`, avoid colliding with a generic search, and stay unambiguous if a
GitHub or grep tool is added later.

### `sourcegraph_search`

| Arg | Type | Notes |
|---|---|---|
| `query` | string, required | Full Sourcegraph query syntax — `repo:`, `lang:`, `file:`, `type:`, boolean operators, `select:` |
| `patternType` | enum `keyword` \| `standard` \| `regexp` \| `structural` | Structural search lives here rather than in a separate tool; it is the same endpoint and the same result shape |
| `count` | integer | Result cap |
| `contextLines` | integer | Lines of context around each match |

Output: matches grouped by repository and path, each with line numbers and
context, plus the resolved commit, and an explicit truncation record when the
server reported limits. `select:repo` queries return repository rows in the same
canonical shape.

### `sourcegraph_fetch`

| Arg | Type | Notes |
|---|---|---|
| `repo` | string, required | `github.com/owner/name` |
| `path` | string, required | File path in the repository |
| `rev` | string | Commit or branch; defaults to the repository's default branch |
| `startLine` / `endLine` | integer | Optional range window |

Output: the file text, its resolved commit, its path, and whether the content was
truncated. A directory path returns a listing instead of failing.

### `sourcegraph_repo`

Discover repositories rather than read one. Backed by `select:repo` over the
streaming endpoint.

| Arg | Type | Notes |
|---|---|---|
| `query` | string, required | Repository filters — `repo:`, `repo:has.topic()`, `repo:has.file()`, `lang:`, `count:` |
| `count` | integer | Result cap |

Output: repository name, description, stars, topics, and the default branch when
available.

**Open sub-question (6):** whether `sourcegraph_repo` also carries a
`kind: metadata \| list` switch for single-repository metadata via GraphQL, or
stays purely a discovery tool. Leaning toward keeping it a discovery tool and
letting `sourcegraph_fetch` handle the single-repository case.

## 11. Remaining open questions

| # | Question | Recommendation |
|---|---|---|
| 6 | `sourcegraph_repo` as pure discovery, or with a `kind` switch for metadata? | Pure discovery in v1 |
| 7 | Hard caps for returned matches / characters per match / total output | Set defaults in config, exposed per deployment |
| 8 | When HMR reloads a plugin, options are preserved — does the `hmr` row need a `reload` config for the dev loop? | Confirm during implementation |

## 12. Verified: hot-reload options

The `hmr` row accepts a `reload` option (`@deepseek-ai/cordis-plugin-hmr`), so
options registered before a hot reload can either be preserved or reset. Worth
configuring deliberately in the dev profile once the plugin has state.

## 13. Risks

- **Anonymous rate limits.** `sourcegraph.com` needs no token but is not
  unlimited; an unauthenticated deployment must degrade with a clear message
  rather than a mystery failure.
- **Result size.** A broad query can return a lot; the tool needs a hard cap on
  returned matches, characters per match, and total output, plus honest
  truncation reporting.
- **query pass-through.** The value of this plugin is Sourcegraph's real query
  language. Simplifying it into "a search string" would waste the integration.
- **Live/replay consistency.** Tool output must render identically from the
  session log as it did live; keep `render` pure and depend on no clock, random
  value, or ambient state.
- **Version drift.** Harness packages move fast and carry `latest` dist-tags on
  stale versions (see below). Pin dev versions exactly and keep peer ranges
  narrow.
- **Three-tool scope.** Three schemas means three truncation stories. The shared
  client and one canonical match shape are what keep this from tripling the
  work — a second ad-hoc shape per tool is the failure mode to avoid.
- **Self-hosted variance.** Field availability differs across Sourcegraph
  versions and licences (anonymous GraphQL in particular is not guaranteed off
  `sourcegraph.com`). A failed capability must surface as a clear structured
  error, not an empty result.
- **Untrusted input in the query.** A model-built query is data, not an
  instruction: put it in a URL parameter properly, never into a shell, and never
  into a URL that is logged with a token attached.
- **Token leakage.** The token must never reach model-facing content, logs, or
  error text; resolve it per operation through `ctx.credentials` and keep it out
  of every value the tool returns.

### Note: npm dist-tags on the `@deepseek-ai` packages are misleading

`@deepseek-ai/dsh-tools@latest` is `0.0.1-rc.1`, while the real line lives under
`next` (`0.1.5-rc.2`) and the installed Harness is `0.1.5-rc.1`. Always resolve
the `next`/`alpha` tags or pin explicitly — never `latest`.

## 14. What exists in this repo today

| Path | Purpose |
|---|---|
| `package.json` | Bundle manifest, scripts, peer/dev dependency split |
| `cordis.patch.yml` | The single bundle insert |
| `tsconfig.json` | NodeNext + `rewriteRelativeImportExtensions` build config |
| `README.md` | Project overview |
| `docs/kickoff.md` | This document |
| `docs/development.md` | The local dev loop against a live Harness |
| `LICENSE` | MIT |

`src/` is intentionally absent: no plugin code has been written yet.
