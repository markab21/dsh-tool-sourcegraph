# Provenance — vendored Sourcegraph query modules

## Upstream

| Field | Value |
|---|---|
| Repository | https://github.com/sourcegraph/sourcegraph-public-snapshot |
| Commit | `c864f15af264f0f456a6d8a83290b5c940715349` |
| Commit date | 2024-08-22 |
| Submodule path | `upstream/sourcegraph` (shallow, pinned to that commit) |
| Upstream status | Archived by Sourcegraph; last push 2024-09-02 |
| Source subtree | `client/shared/src/search/query/` |

## Why these files are vendored

Sourcegraph's search-query language is the substance of the `sourcegraph_search`
tool: passing a query through faithfully, and rejecting one the server would
reject, depends on their scanner and parser semantics. That code is TypeScript,
but it is **not published to npm** — `@sourcegraph/shared` is `"private": true`,
and `@sourcegraph/common`, `@sourcegraph/http-client`, and `@sourcegraph/search-client`
do not exist on the public registry. It cannot be consumed as a dependency.

The upstream tree is also frozen, so the usual objection to vendoring — silent
drift from a moving upstream — does not apply. The submodule keeps the exact
source revision that these files were copied from, so every vendored file can be
diffed against its origin.

## Files copied from upstream

All ten are under `client/shared/src/search/query/` at the pinned commit. Each
carries a header naming itself as vendored and summarizing its change; the
modifications themselves are listed below.

| Vendored path | Upstream path | Modified? |
|---|---|---|
| `query/token.ts` | `query/token.ts` | no |
| `query/scanner.ts` | `query/scanner.ts` | yes |
| `query/parser.ts` | `query/parser.ts` | yes |
| `query/printer.ts` | `query/printer.ts` | yes |
| `query/filters.ts` | `query/filters.ts` | yes |
| `query/predicates.ts` | `query/predicates.ts` | yes |
| `query/query.ts` | `query/query.ts` | yes |
| `query/validate.ts` | `query/validate.ts` | yes |
| `query/languageFilter.ts` | `query/languageFilter.ts` | yes |
| `query/selectFilter.ts` | `query/selectFilter.ts` | yes |

2,432 lines total, including the change-notice header on the nine modified
files. All ten sit at one level (`query/`), which is where upstream keeps them
too — there is no `query/completions/` directory upstream.

Four additional files in `query/` are ours, not upstream: `pattern-type.ts`,
`stream.ts`, `languages.ts`, and `window-context.d.ts`. They are described under
"Local shims" below.

## License

Upstream declares **Apache-2.0** for this package in
`client/shared/package.json` (`"license": "Apache-2.0"`).

That declaration is *not* unambiguous, and anyone reusing this directory should
know why. The repository root `LICENSE` states that the Sourcegraph Enterprise
License covers every file:

> LICENSE.enterprise (Enterprise License) applies to all files in this
> repository, except for files in or under any directory that contains a
> superseding license file.

`client/shared/` contains no such file — only `NOTICE`, which carries
third-party attributions (Microsoft/vscode, tapdigit) and is not a license
grant. The repository's GitHub license metadata is `NOASSERTION`. So the root
text points at a file that does not exist, while the package manifest asserts
Apache-2.0.

**Decision taken (2026-09-13, project owner):** proceed under the Apache-2.0
declaration, with full attribution and this ambiguity recorded here. The
enterprise text permits copying for development and testing without a
subscription but forbids redistribution; the manifest's Apache-2.0 is the
declared intent for this package. This question should be revisited before any
public release of a package containing this directory.

Both license texts travel with the code, in two places:

- Here, as the originals: `UPSTREAM-LICENSE-enterprise.txt` (the repository root
  license) and `UPSTREAM-NOTICE-client-shared.txt` (the upstream
  `client/shared/NOTICE`).
- In the published package as the assembled, always-shipped
  [`THIRD-PARTY-NOTICES.md`](../../../THIRD-PARTY-NOTICES.md) at the package root,
  which reproduces both in full plus the Apache-2.0 declaration. This directory is
  TypeScript source, so its `.txt` files are not copied into `dist/` by the
  compiler — the package-root file is what a consumer of the published artifact
  actually receives.

Apache-2.0 further requires that modified files carry prominent notices stating
that they were changed. **Every modified file now carries such a header**, and
the exact modification is recorded below. The upstream `NOTICE` and license texts
continue to ship alongside, both here and in the package-root
`THIRD-PARTY-NOTICES.md`.

## Modifications applied

The files are byte-for-byte upstream apart from the following. Everything is an
import or type-level change; **no parsing, scanning, or validation logic was
altered** except the one narrowing fix noted at the end.

### 1. Import specifiers rewritten to `.js`

`moduleResolution: NodeNext` requires an explicit extension on relative imports,
which upstream omits. Every relative specifier gained `.js`. This is also what
`rewriteRelativeImportExtensions` expects, so the emitted JavaScript resolves
correctly at runtime.

### 2. Three imports that pointed outside the tree

| File | Was | Now |
|---|---|---|
| `query/scanner.ts` | `SearchPatternType` from `../../graphql-operations` | `./pattern-type.js` (local shim) |
| `query/validate.ts` | same | same |
| `query/filters.ts` | `Omit` from `utility-types` | the TypeScript builtin `Omit` (import removed) |
| `query/filters.ts` | `SearchMatch` from `../stream` | `./stream.js` (local shim) |
| `query/languageFilter.ts` | `ALL_LANGUAGES`, `POPULAR_LANGUAGES` from `@sourcegraph/common` | `./languages.js` (local shim) |

### 3. Not a modification: the completion modules were never relocated

An earlier revision of this document claimed these two files were flattened
out of a `query/completions/` subdirectory into `query/`. That was wrong:
upstream keeps `languageFilter.ts` and `selectFilter.ts` at
`client/shared/src/search/query/`, the same level as the rest, and no
`completions/` directory exists there. Nothing was moved, and no edit was
saved. Recorded here because a provenance document that describes an edit
which did not happen is worse than one that omits it.

### 4. One narrowing fix in `scanner.ts`

In `filterValue`, the result object referred to `value.term` while `value` is
reassigned in a preceding branch, so this compiler cannot carry the union
narrowing into the object literal and reports `Property 'term' does not exist on
type 'ScanError'`. The narrowed term is now bound to a local (`const term = ...`)
before the literal is built — same behaviour, no logic change. This is the only
edit that touches a statement rather than an import, and it is marked inline.

### 5. Not a modification: the relaxed compiler settings

`tsconfig.vendor.json` disables `strictNullChecks`,
`noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` **for this directory
only**. Under this project's strict flags the vendored tree reports 16 errors,
all strictness complaints about possibly-undefined lookups rather than defects.
Rewriting third-party logic to satisfy our preferences would make the copy
drift from upstream and harder to audit; relaxing the flags keeps the code
identical. Our own source keeps every strict flag — the two configurations
exclude each other.

## Local shims (our code, not vendored)

| File | Provides | Why |
|---|---|---|
| `query/pattern-type.ts` | The `SearchPatternType` enum | Upstream generates it from `schema.graphql` at build time, so it is absent from the source tree. Values transcribed from `enum SearchPatternType` in `cmd/frontend/graphqlbackend/schema.graphql` at the pinned commit. |
| `query/stream.ts` | The `SearchMatch` discriminant union | Only `SearchMatch['type']` is used, by one property of `FilterDefinition`. The seven discriminants were read from upstream's interfaces rather than copied with the 737-line module. |
| `query/languages.ts` | `ALL_LANGUAGES`, `POPULAR_LANGUAGES` | Upstream's list is 796 lines generated from go-enry plus a lodash `uniq`. These hand-maintained lists affect only the labels offered for `lang:`/`select:` completions; the server still accepts any value and the parser does not validate against them. |
| `query/window-context.d.ts` | The `window.context` global | Injected by the Sourcegraph server, so it is not in the DOM typings. Declaring it keeps `filters.ts` unedited; the code already handles its absence outside a browser. |

These four files are MIT, like the rest of this repository, and are not subject
to the upstream license discussion above.

## Verified working

After the modifications, from a clean build:

```sh
pnpm run build      # tsc -b, both projects, zero errors
pnpm run typecheck  # zero errors in both configurations
```

and the compiled parser round-trips a real query:

```js
parseSearchQuery('repo:^github\\.com/kubernetes/kubernetes$ lang:go file:go.mod patternType:structural if err != nil { :[body] } count:5')
// -> { type: 'success', node: { type: 'sequence', nodes: [ ... ] } }
stringHuman(scanSearchQuery(query).term)  // -> the original query, unchanged
```

## What was deliberately not copied

| Upstream module | Reason |
|---|---|
| `stream.ts` (737 lines) | RxJS `Observable`-based. The tool needs a bounded reader on `AbortSignal`; adapting an Observable to that is more code than the ~120-line reader it would replace. |
| `analyze.ts` | Depends on `isDefined` from `@sourcegraph/common` for UI-level diagnostics we do not surface. |
| `completion-utils.ts` | Depends on `lodash`; UI completion only. |
| `decoratedToken.ts` (50 KB), `hover.ts`, `diagnostics.ts`, `metrics.ts`, `patternMatcher.ts`, `providers-utils.ts`, `transformer.ts`, `utils.ts` | Syntax-highlighting, hover, and web-app concerns. No model-facing use. |
| `*.test.ts` | Upstream tests are tied to their Jest setup. Behaviour worth porting selectively into our own vitest suite instead. |

## Refreshing the vendored files

The upstream commit is pinned by the submodule, so a plain checkout reproduces
the exact source. To re-extract:

```sh
git submodule update --init --depth 1
# copy again from upstream/sourcegraph/client/shared/src/search/query/
```

Adding the submodule without `--depth 1` clones roughly 1.3 GB; the shallow form
is 56 MB.
