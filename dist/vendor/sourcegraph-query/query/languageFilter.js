/*
 * VENDORED — modified from the upstream file of the same name.
 *
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 *           client/shared/src/search/query/languageFilter.ts
 * Changed:  import specifiers rewritten; the language lists now come from the local ./languages.js shim.
 *
 * Apache-2.0 section 4(b) notice. See ../PROVENANCE.md for the full list
 * of modifications and the license terms this file is used under.
 */
import { ALL_LANGUAGES, POPULAR_LANGUAGES } from './languages.js';
// Returns a list of popular languages initially and a complete list when the
// user has provided input.
export const languageCompletion = (value) => value?.value ? ALL_LANGUAGES : POPULAR_LANGUAGES;
//# sourceMappingURL=languageFilter.js.map