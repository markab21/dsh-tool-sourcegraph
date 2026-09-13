# Provenance: the vendored Sourcegraph query modules

## Upstream

| Field | Value |
|---|---|
| Repository | https://github.com/sourcegraph/sourcegraph-public-snapshot |
| Commit | `c864f15af264f0f456a6d8a83290b5c940715349` |
| Commit date | 2024-08-22 |
| Submodule path | `upstream/sourcegraph`, shallow and pinned to that commit |
| Upstream status | Archived by Sourcegraph. The last push was 2024-09-02 |
| Source subtree | `client/shared/src/search/query/` |

## Status: the tree compiles and ships, but no code imports it

No runtime code imports this tree today. The file `src/index.ts` imports only
`./client.js`, and the tool sends its query to the server without a change. The
vendored modules compile into `dist/vendor/` and they ship, but no code path
reaches them.

This position is deliberate and not an oversight. The rest of this document
explains why the copy exists, so the status belongs here. The intended use is
query validation: run `validate.ts` before the request, and reject a bad query
locally instead of spending a round trip on it. The tools `sourcegraph_fetch` and
`sourcegraph_repo` will also use the tree. Until that work lands, treat this
directory as a copy that is present for later. It is also the largest part of the
package.

## Why these files are vendored

The intended validation needs the search-query language of Sourcegraph. It must
reject the queries that the server rejects, and it must use the scanner and parser
semantics of Sourcegraph rather than an approximation of them.

That code is TypeScript, but it is not on npm. The package `@sourcegraph/shared`
declares `"private": true`, and the packages `@sourcegraph/common`,
`@sourcegraph/http-client`, and `@sourcegraph/search-client` are absent from the
public registry. You cannot use the code as a dependency.

The upstream tree is also frozen, so the usual objection to vendoring does not
apply. An upstream that moves causes silent drift, and this one does not move. The
submodule holds the exact source revision that these files came from, so you can
compare each vendored file with its origin.

## Files copied from upstream

All ten files are under `client/shared/src/search/query/` at the pinned commit.
Each of the nine modified files has a header that names it as vendored and
summarizes its change. The file `token.ts` is unmodified and has no such header,
which is why the table above records it as "no". The next section lists the
changes.

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

The fourteen files under `query/` are 2,432 lines total. That figure includes the
four local shims and the change-notice header on each of the nine modified files.
The ten files copied from upstream are 2,242 lines. All ten files are at one
level, `query/`, and upstream also keeps them at that level. No
`query/completions/` directory exists upstream.

Four more files in `query/` are ours and not from upstream: `pattern-type.ts`,
`stream.ts`, `languages.ts`, and `window-context.d.ts`. The section "Local shims"
below describes them.

## License

Upstream declares Apache-2.0 for this package in `client/shared/package.json`,
which contains `"license": "Apache-2.0"`.

That declaration is not clear, and each person who reuses this directory must know
why. The root `LICENSE` of the repository states that the Sourcegraph Enterprise
License covers every file:

> LICENSE.enterprise (Enterprise License) applies to all files in this
> repository, except for files in or under any directory that contains a
> superseding license file.

The directory `client/shared/` contains no such file. It contains only `NOTICE`,
which carries third-party attributions for Microsoft/vscode and tapdigit. That
file is not a license grant. The license metadata on GitHub is `NOASSERTION`. The
root text therefore points at a file that is absent, while the package manifest
declares Apache-2.0.

The project owner decided on 2026-09-13 to continue under the Apache-2.0
declaration, with full attribution and with this ambiguity recorded here. The
enterprise text permits a copy for development and for testing without a
subscription, but it forbids redistribution. The Apache-2.0 declaration in the
manifest is the stated intent for this package. This question needs a new
examination before a public release of a package that contains this directory.

Both license texts travel with the code, in two places:

- Here, as the originals: `UPSTREAM-LICENSE-enterprise.txt` contains the root
  license of the repository, and `UPSTREAM-NOTICE-client-shared.txt` contains the
  `NOTICE` file from `client/shared/`.
- In the published package, in the assembled file
  [`THIRD-PARTY-NOTICES.md`](../../../THIRD-PARTY-NOTICES.md) at the package root.
  That file reproduces both texts in full and adds the Apache-2.0 declaration.
  This directory contains TypeScript source, so the compiler does not copy its
  `.txt` files into `dist/`. The package-root file is therefore what a consumer of
  the published artifact receives.

Apache-2.0 also requires a prominent notice in each modified file, to state that
the file changed. Each modified file has that notice, and the sections below
record each change. The upstream `NOTICE` and the license texts continue to ship
in both places.

## Modifications applied

Apart from the changes below, the files are identical to upstream. Each change is
an import change or a type-level change. No parsing, scanning, or validation logic
changed, with the single exception of the narrowing fix that the last item
describes.

### 1. Import specifiers rewritten to `.js`

The setting `moduleResolution: NodeNext` needs an explicit extension on a relative
import, and upstream omits it. Each relative specifier received `.js`. The setting
`rewriteRelativeImportExtensions` also expects this form, so the emitted
JavaScript resolves at runtime.

### 2. Imports that pointed outside the tree

| File | Before | After |
|---|---|---|
| `query/scanner.ts` | `SearchPatternType` from `../../graphql-operations` | `./pattern-type.js`, a local shim |
| `query/validate.ts` | The same import | The same change |
| `query/filters.ts` | `Omit` from `utility-types` | The builtin `Omit` of TypeScript. The import is removed |
| `query/filters.ts` | `SearchMatch` from `../stream` | `./stream.js`, a local shim |
| `query/languageFilter.ts` | `ALL_LANGUAGES` and `POPULAR_LANGUAGES` from `@sourcegraph/common` | `./languages.js`, a local shim |

### 3. No relocation of the completion modules

An earlier revision of this document stated that these two files came from a
`query/completions/` subdirectory that was flattened into `query/`. That statement
was wrong. Upstream keeps `languageFilter.ts` and `selectFilter.ts` at
`client/shared/src/search/query/`, at the same level as the other files, and no
`completions/` directory exists there. Nothing moved, and no change was necessary.
The correction stays in this document because a provenance record that describes a
change which did not occur is worse than a record that omits it.

### 4. One narrowing fix in `scanner.ts`

In the function `filterValue`, the result object refers to `value.term`, and the
code assigns a new value to `value` in an earlier branch. This compiler therefore
cannot carry the union narrowing into the object literal, and it reports
`Property 'term' does not exist on type 'ScanError'`. The narrowed term is now
assigned to a local constant, `const term = ...`, before the code builds the
literal. The behavior is the same. This is the only change that touches a
statement rather than an import, and the file marks it in a comment.

Upstream does not need this change, because upstream compiles with
`strictNullChecks` off. An earlier revision of this fix compared `value?.type`
against `'error'`, which also compiled only without `strictNullChecks`. The
current form compares against `'success'` and compiles under the strict settings
of this project.

### 5. The compiler settings for this directory

The file `tsconfig.vendor.json` relaxes two settings for this directory only:
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. The setting `strict`
stays on.

Under the strict settings of this project, the vendored tree reports 15 errors.
Each error is a strictness complaint about a possibly-undefined lookup, and not a
defect. A rewrite of third-party logic to satisfy our preferences moves the copy
away from upstream and makes it harder to audit. The relaxed settings keep the code
the same. Our own source keeps each strict flag, because the two configurations
exclude each other.

## Local shims

These four files are our code. They are not vendored.

| File | It provides | Why it exists |
|---|---|---|
| `query/pattern-type.ts` | The enum `SearchPatternType` | Upstream generates this enum from `schema.graphql` at build time, so the source tree does not contain it. The values come from `enum SearchPatternType` in `cmd/frontend/graphqlbackend/schema.graphql` at the pinned commit |
| `query/stream.ts` | The union of `SearchMatch` discriminants | One property of `FilterDefinition` uses `SearchMatch['type']` and nothing else. The seven discriminants come from the interfaces of upstream, not from a copy of the 737-line module |
| `query/languages.ts` | `ALL_LANGUAGES` and `POPULAR_LANGUAGES` | The list of upstream is 796 lines, generated from go-enry, and it uses `uniq` from lodash. These lists control only the labels that the `lang:` and `select:` completions offer. The server accepts each value, and the parser does not make sure that a value is in the list |
| `query/window-context.d.ts` | The global `window.context` | The Sourcegraph server adds this value, so the DOM typings do not contain it. The declaration keeps `filters.ts` without a change. The code already handles the absence of the value outside a browser |

The file `query/languages.ts` needs a note. Its `POPULAR_LANGUAGES` list repeats
34 of the 39 entries of `client/common/src/languages.ts` upstream, in the same
order. That upstream file also declares Apache-2.0. The list is therefore closer
to a modified copy of an upstream list than to a hand-written list, and it belongs
to the same license discussion as the rest of this directory. The other three
files are original work.

## Verified working

After the modifications, from a clean build:

```sh
pnpm run build      # tsc -b, both projects, zero errors
pnpm run typecheck  # zero errors in both configurations
```

The compiled parser also sends a real query through a full cycle:

```js
parseSearchQuery('repo:^github\\.com/kubernetes/kubernetes$ lang:go file:go.mod patternType:structural if err != nil { :[body] } count:5')
// -> { type: 'success', node: { type: 'sequence', nodes: [ ... ] } }
stringHuman(scanSearchQuery(query).term)  // -> the original query, unchanged
```

## Files that were not copied

| Upstream module | Reason |
|---|---|
| `stream.ts` (737 lines) | It uses RxJS `Observable`. The tool needs a reader with a limit on an `AbortSignal`. To adapt an Observable is more code than the reader of about 120 lines that replaces it |
| `analyze.ts` | It uses `isDefined` from `@sourcegraph/common` for diagnostics at the interface level, which this plugin does not show |
| `completion-utils.ts` | It uses `lodash`, and it serves the interface completion only |
| `decoratedToken.ts` (50 KB), `hover.ts`, `diagnostics.ts`, `metrics.ts`, `patternMatcher.ts`, `providers-utils.ts`, `transformer.ts`, `utils.ts` | These files concern syntax highlighting, hover, and the web application. The model has no use for them |
| `*.test.ts` | The tests of upstream need their Jest setup. Their behavior is worth moving into the vitest suite of this project, one case at a time |

## Refresh the vendored files

The submodule pins the upstream commit, so a usual checkout gives the exact
source. To extract the files again:

```sh
git submodule update --init --depth 1
# copy again from upstream/sourcegraph/client/shared/src/search/query/
```

A submodule without `--depth 1` downloads about 1.3 GB. The shallow form needs
56 MB.
