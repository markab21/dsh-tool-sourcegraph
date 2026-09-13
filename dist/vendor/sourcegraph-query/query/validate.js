import { FILTERS, FilterType, isNegatedFilter, resolveFieldAlias, resolveNegatedFilter, } from './filters.js';
import { scanSearchQuery } from './scanner.js';
/**
 * Returns true if the query contains a pattern.
 */
export const containsLiteralOrPattern = (query, searchPatternType) => {
    const result = scanSearchQuery(query, undefined, searchPatternType);
    return result.type === 'success' && result.term.some(term => term.type === 'literal' || term.type === 'pattern');
};
/**
 * Type guard for repo: filter token.
 *
 * @param token - query parsed lexical token
 */
export const isRepoFilter = (token) => token.type === 'filter' &&
    (token.field.value === FilterType.repo || token.field.value === FILTERS[FilterType.repo].alias);
/**
 * Type guard for arbitrary filter type. Also handles aliased and negated filters.
 *
 * @param token - query parsed lexical token
 */
export const isFilterType = (token, filterType) => token.type === 'filter' &&
    (token.field.value === filterType ||
        resolveFieldAlias(token.field.value) === filterType ||
        (isNegatedFilter(token.field.value) && resolveNegatedFilter(token.field.value) === filterType));
export function filterExists(query, filter, negated = false) {
    const scannedQuery = scanSearchQuery(query);
    return (scannedQuery.type === 'success' &&
        scannedQuery.term.some(token => token.type === 'filter' && token.field.value.toLowerCase() === `${negated ? '-' : ''}${filter}`));
}
//# sourceMappingURL=validate.js.map