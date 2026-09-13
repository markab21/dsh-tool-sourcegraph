import { SearchPatternType } from './pattern-type.js';
import { type Token, type Literal, type Pattern, PatternKind } from './token.js';
/**
 * A scanner produces a term, which is either a token or a list of tokens.
 */
export type Term = Token | Token[];
/**
 * Represents the failed result of running a {@link Scanner} on a search query.
 */
interface ScanError {
    type: 'error';
    /**
     * A string representing the token that would have been expected
     * for successful scanning at {@link ScannerError#at}.
     */
    expected: string;
    /**
     * The index in the search query string where scanning failed.
     */
    at: number;
}
/**
 * Represents the successful result of running a {@link Scannerer} on a search query.
 */
export interface ScanSuccess<T = Term> {
    type: 'success';
    /**
     * The resulting term.
     */
    term: T;
}
/**
 * Represents the result of running a {@link Scanner} on a search query.
 */
export type ScanResult<T = Term> = ScanError | ScanSuccess<T>;
type Scanner<T = Term> = (input: string, start: number) => ScanResult<T>;
/**
 * Returns a {@link Scanner} that succeeds if any of the given scanner succeeds.
 */
export declare const oneOf: <T>(...scanners: Scanner<T>[]) => Scanner<T>;
/**
 * A {@link Scanner} that will attempt to scan delimited strings for an arbitrary
 * delimiter. `\` is treated as an escape character for the delimited string.
 */
export declare const quoted: (delimiter: string) => Scanner<Literal>;
/**
 * ScanBalancedLiteral attempts to scan balanced parentheses as literal strings. This
 * ensures that we interpret patterns containing parentheses _as patterns_ and not
 * groups. For example, it accepts these patterns:
 *
 * ((a|b)|c)              - a regular expression with balanced parentheses for grouping
 * myFunction(arg1, arg2) - a literal string with parens that should be literally interpreted
 * foo(...)               - a structural search pattern
 *
 * If it weren't for this scanner, the above parentheses would have to be
 * interpreted as part of the query language group syntax, like these:
 *
 * (foo or (bar and baz))
 *
 * So, this scanner detects parentheses as patterns without needing the user to
 * explicitly escape them. As such, there are cases where this scanner should
 * not succeed:
 *
 * (foo or (bar and baz)) - a valid query with and/or expression groups in the query langugae
 * (repo:foo bar baz)     - a valid query containing a recognized repo: field. Here parentheses are interpreted as a group, not a pattern.
 */
export declare const scanBalancedLiteral: Scanner<Literal>;
/**
 * Scan predicate syntax like repo:contains.file(path:README.md). Predicate scanning
 * takes precedence over other value scanners like scanBalancedLiteral.
 */
export declare const scanPredicateValue: (input: string, start: number, field: Literal) => ScanResult<Literal>;
/**
 * A helper function that maps a {@link Literal} scanner result to a {@link Pattern} scanner.
 *
 * @param scanner The literal scanner.
 * @param kind The {@link PatternKind} label to apply to the resulting pattern scanner.
 */
export declare const toPatternResult: (scanner: Scanner<Literal>, kind: PatternKind) => Scanner<Pattern>;
export declare function detectPatternType(query: string): SearchPatternType | undefined;
/**
 * Scans a search query string.
 */
export declare const scanSearchQuery: (query: string, interpretComments?: boolean, searchPatternType?: SearchPatternType) => ScanResult<Token[]>;
export declare const succeedScan: (query: string) => Token[];
/**
 * Scans the search query as a sequence of patterns only. This is used in situations where we don't want
 * to interpret filters or keywords.
 */
export declare function scanSearchQueryAsPatterns(query: string): ScanResult<Token[]>;
export {};
