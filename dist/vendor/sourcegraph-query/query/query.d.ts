import type { Filter, Token } from './token.js';
export declare enum FilterKind {
    Global = "Global",
    Subexpression = "Subexpression"
}
/**
 * Returns the first filter for a field in a query, if any. A FilterKind
 * specifies what kind of filter to look for.
 *
 * A Global filter is found iff (1) it is specified once and (2) it is at
 * the top-level of a query.
 *
 * A Subexpression filter is found if a non-global filter exists. For
 * example, `case:yes` is not global, but are part of subexpressions in
 * the following queries:
 *
 * `(case:yes some subexpression) case:no multiple cases`
 * `(case:yes not at top level; inside a parentheses of a grouped expression)`
 *
 * @param query the query string
 * @param field the field of the filter to find
 * @param kind the kind of filter to find
 */
export declare const findFilter: (query: string, field: string, kind: FilterKind) => Filter | undefined;
/**
 * Returns all filters that match field.
 */
export declare const findFilters: (tokens: Token[], field: string) => Filter[];
/**
 * Helper function to extract context filter info.
 */
export declare function getGlobalSearchContextFilter(query: string): {
    filter: Filter;
    spec: string;
} | null;
