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

`/.api/graphql` remains available for what streaming search does not cover
(repository metadata, commit ranges, diff/commit search, `src-cli`-style
operations). Keep it in reserve for a second phase.

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

## 8. Open questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Which deployment(s) must work: `sourcegraph.com` only, a self-hosted instance, or both? | Build for both; the instance URL is config, the token is a credential reference |
| 2 | Which tools ship in v1? | `sourcegraph_search` first; add a file-read tool when a real workflow needs it |
| 3 | Publish to npm, or install from git/checkout? | Keep the package name free and publishing-ready; decide before first release |
| 4 | Do we want a custom Client card? | Defer to v2; the generic card is enough to validate the tool |
| 5 | Multi-instance support in one profile? | Single instance in v1 |

## 9. Risks

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

### Note: npm dist-tags on the `@deepseek-ai` packages are misleading

`@deepseek-ai/dsh-tools@latest` is `0.0.1-rc.1`, while the real line lives under
`next` (`0.1.5-rc.2`) and the installed Harness is `0.1.5-rc.1`. Always resolve
the `next`/`alpha` tags or pin explicitly — never `latest`.

## 10. What exists in this repo today

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
