import type { SearchPatternType } from './pattern-type.js';
import { type AliasedFilterType, FilterType } from './filters.js';
import type { Filter, Token } from './token.js';
/**
 * Returns true if the query contains a pattern.
 */
export declare const containsLiteralOrPattern: (query: string, searchPatternType?: SearchPatternType) => boolean;
/**
 * Type guard for repo: filter token.
 *
 * @param token - query parsed lexical token
 */
export declare const isRepoFilter: (token: Token) => token is Filter;
/**
 * Type guard for arbitrary filter type. Also handles aliased and negated filters.
 *
 * @param token - query parsed lexical token
 */
export declare const isFilterType: (token: Token, filterType: FilterType) => token is Filter;
export declare function filterExists(query: string, filter: FilterType | keyof typeof AliasedFilterType, negated?: boolean): boolean;
