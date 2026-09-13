/**
 * Shim: the subset of upstream's `search/stream.ts` types that the vendored
 * query modules depend on.
 *
 * `filters.ts` imports `SearchMatch` and uses exactly one property of it —
 * `SearchMatch['type']`, to annotate which filter suggestions are resolved by
 * the server. Vendoring the whole 737-line RxJS-based stream module to obtain
 * six string literals would be a poor trade, so only the discriminants are
 * reproduced here. The full result shapes belong to this project's own result
 * types, derived from the live API rather than copied.
 *
 * This is one of the local shims described in ../PROVENANCE.md. It is our code,
 * not vendored code, and is licensed under this repository's MIT license.
 */
/**
 * Discriminants of upstream `SearchMatch` — the union of its content, repo,
 * commit, symbol, path, person, and team match interfaces.
 */
export type SearchMatch = {
    type: 'content';
} | {
    type: 'repo';
} | {
    type: 'commit';
} | {
    type: 'symbol';
} | {
    type: 'path';
} | {
    type: 'person';
} | {
    type: 'team';
};
