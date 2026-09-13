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
export const POPULAR_LANGUAGES: string[] = [
  'Assembly',
  'Bash',
  'C',
  'C++',
  'C#',
  'CSS',
  'Dart',
  'Elixir',
  'Go',
  'GraphQL',
  'Groovy',
  'Haskell',
  'HTML',
  'Java',
  'JavaScript',
  'JSON',
  'Kotlin',
  'Lua',
  'Markdown',
  'Objective-C',
  'OCaml',
  'Perl',
  'PHP',
  'Protocol Buffer',
  'Python',
  'R',
  'Ruby',
  'Rust',
  'Scala',
  'SCSS',
  'Shell',
  'SQL',
  'Swift',
  'Terraform',
  'TypeScript',
  'Vue',
  'XML',
  'YAML',
  'Zig',
]

/** Full set offered once the user has typed at least one character. */
export const ALL_LANGUAGES: string[] = [
  ...POPULAR_LANGUAGES,
  'ABAP',
  'Ada',
  'Apex',
  'Clojure',
  'COBOL',
  'CoffeeScript',
  'Common Lisp',
  'Crystal',
  'CUDA',
  'D',
  'Delphi',
  'Dockerfile',
  'Erlang',
  'F#',
  'Fortran',
  'HCL',
  'Julia',
  'Makefile',
  'MATLAB',
  'Nim',
  'Nix',
  'Pascal',
  'PowerShell',
  'Prolog',
  'Racket',
  'Scheme',
  'Solidity',
  'Svelte',
  'SystemVerilog',
  'Tcl',
  'Thrift',
  'TOML',
  'Verilog',
  'VHDL',
  'Visual Basic .NET',
  'WebAssembly',
]
