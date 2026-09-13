/**
 * Shim: the language lists that upstream's `languageFilter.ts` imports from
 * `@sourcegraph/common`.
 *
 * Upstream derives `ALL_LANGUAGES` from a 796-line generated list sourced from
 * go-enry's `alias.go`, and imports lodash to deduplicate it. That data exists to
 * power `lang:` autocompletion in the web UI; it is not used to parse, validate,
 * or execute a query.
 *
 * The lists below are hand-maintained instead: the popular set is the languages
 * a code-search user actually types, and the full set adds other widely used
 * languages. This keeps the vendored `filters.ts` API intact with one import
 * change rather than a structural edit.
 *
 * Completeness here affects only the labels offered for `lang:` and `select:`
 * completions. An unknown language is still accepted by the server, and the
 * parser does not validate against this list.
 *
 * This is one of the local shims described in ../PROVENANCE.md. It is our code,
 * not vendored code, and is licensed under this repository's MIT license.
 */
/** Languages offered before the user has typed anything. */
export declare const POPULAR_LANGUAGES: string[];
/** Full set offered once the user has typed at least one character. */
export declare const ALL_LANGUAGES: string[];
