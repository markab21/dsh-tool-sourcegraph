/**
 * Shim: ambient declarations for globals the Sourcegraph web app injects.
 *
 * `filters.ts` reads `window.context.experimentalFeatures.structuralSearch` to
 * decide whether the `patterntype` filter offers `structural` as a completion.
 * That object is injected into the page by the Sourcegraph server; it is not
 * part of the DOM typings, so upstream declares it in its web-app ambient types.
 *
 * In this project the flag's real meaning is narrower: the `sourcegraph_search`
 * tool always accepts `structural`. Declaring the global keeps the vendored file
 * byte-for-byte (apart from import rewriting) rather than editing logic we do not
 * need. `context` is absent outside a browser, which the vendored code already
 * handles by falling back to `enabled`.
 *
 * This is one of the local shims described in ../PROVENANCE.md. It is our code,
 * not vendored code, and is licensed under this repository's MIT license.
 */

interface SourcegraphExperimentalFeatures {
  structuralSearch?: 'enabled' | 'disabled'
  [feature: string]: unknown
}

interface SourcegraphWindowContext {
  experimentalFeatures?: SourcegraphExperimentalFeatures
  [key: string]: unknown
}

declare global {
  interface Window {
    context?: SourcegraphWindowContext
  }
}

export {}
