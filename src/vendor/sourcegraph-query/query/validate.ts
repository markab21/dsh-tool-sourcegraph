/*
 * VENDORED — modified from the upstream file of the same name.
 *
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 *           client/shared/src/search/query/validate.ts
 * Changed:  import specifiers rewritten.
 *
 * Apache-2.0 section 4(b) notice. See ../PROVENANCE.md for the full list
 * of modifications and the license terms this file is used under.
 */
import type { SearchPatternType } from './pattern-type.js'

import {
    type AliasedFilterType,
    FILTERS,
    FilterType,
    isNegatedFilter,
    resolveFieldAlias,
    resolveNegatedFilter,
} from './filters.js'
import { scanSearchQuery } from './scanner.js'
import type { Filter, Token } from './token.js'

/**
 * Returns true if the query contains a pattern.
 */
/*
 * VENDORED — modified from the upstream file of the same name.
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 * Apache-2.0 section 4(b) change notice; see ../PROVENANCE.md.
 */
export const containsLiteralOrPattern = (query: string, searchPatternType?: SearchPatternType): boolean => {
    const result = scanSearchQuery(query, undefined, searchPatternType)
    return result.type === 'success' && result.term.some(term => term.type === 'literal' || term.type === 'pattern')
}

/**
 * Type guard for repo: filter token.
 *
 * @param token - query parsed lexical token
 */
export const isRepoFilter = (token: Token): token is Filter =>
    token.type === 'filter' &&
    (token.field.value === FilterType.repo || token.field.value === FILTERS[FilterType.repo].alias)

/**
 * Type guard for arbitrary filter type. Also handles aliased and negated filters.
 *
 * @param token - query parsed lexical token
 */
export const isFilterType = (token: Token, filterType: FilterType): token is Filter =>
    token.type === 'filter' &&
    (token.field.value === filterType ||
        resolveFieldAlias(token.field.value) === filterType ||
        (isNegatedFilter(token.field.value) && resolveNegatedFilter(token.field.value) === filterType))

export function filterExists(
    query: string,
    filter: FilterType | keyof typeof AliasedFilterType,
    negated: boolean = false
): boolean {
    const scannedQuery = scanSearchQuery(query)
    return (
        scannedQuery.type === 'success' &&
        scannedQuery.term.some(
            token => token.type === 'filter' && token.field.value.toLowerCase() === `${negated ? '-' : ''}${filter}`
        )
    )
}
