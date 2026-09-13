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

## Files copied verbatim

| Vendored path | Upstream path |
|---|---|
| `query/token.ts` | `client/shared/src/search/query/token.ts` |
| `query/scanner.ts` | `client/shared/src/search/query/scanner.ts` |
| `query/parser.ts` | `client/shared/src/search/query/parser.ts` |
| `query/printer.ts` | `client/shared/src/search/query/printer.ts` |
| `query/filters.ts` | `client/shared/src/search/query/filters.ts` |
| `query/predicates.ts` | `client/shared/src/search/query/predicates.ts` |
| `query/query.ts` | `client/shared/src/search/query/query.ts` |
| `query/validate.ts` | `client/shared/src/search/query/validate.ts` |
| `query/completions/languageFilter.ts` | `client/shared/src/search/query/languageFilter.ts` |
| `query/completions/selectFilter.ts` | `client/shared/src/search/query/selectFilter.ts` |

2,128 lines total. The two files under `query/completions/` were moved down one
directory to keep the completion-only surface separate from the parser.

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

Both license texts travel with the code:

- `UPSTREAM-LICENSE-enterprise.txt` — the repository root license.
- `UPSTREAM-NOTICE-client-shared.txt` — the upstream `client/shared/NOTICE`.

Apache-2.0 further requires that modified files carry prominent notices stating
that they were changed. **The copies here are currently verbatim** — the
imports listed below still point outside the tree and have not been rewritten
yet. The moment they are, each edited file needs a header stating the change,
this file needs the modification recorded, and the upstream `NOTICE`/license
texts must continue to ship alongside.

## Known modifications still required

Three imports reference code outside this directory. Until they are rewritten,
the tree does not typecheck in isolation:

| File | Import | Resolution |
|---|---|---|
| `query/scanner.ts` | `SearchPatternType` from `../../graphql-operations` | Local enum shim. Upstream generates it from GraphQL; the values are a small fixed set. |
| `query/validate.ts` | `SearchPatternType` from `../../graphql-operations` | Same shim. |
| `query/filters.ts` | `Omit` from `utility-types` | Replace with the TypeScript builtin `Omit`. |
| `query/filters.ts` | `SearchMatch` from `../stream` | Minimal local type. Only `SearchMatch['type']` is used (one property, in `FilterDefinition.suggestions`). |
| `query/completions/languageFilter.ts` | `ALL_LANGUAGES`, `POPULAR_LANGUAGES` from `@sourcegraph/common` | Supply language data locally. This is the largest remaining gap. |
| `query/completions/selectFilter.ts` | — | No external dependency. |

Additionally, `filters.ts` pulls `languageFilter` and `selectFilter` for UI
autocompletion — a capability a model-facing tool does not need. **Alternative
worth considering during implementation:** drop the two `completions/` files and
the `Completion` plumbing in `filters.ts`, which would also remove the language-data
problem entirely and avoid shipping completion tables that are never called.

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
