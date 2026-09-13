/**
 * Pre-flight check for a Sourcegraph query.
 *
 * A malformed query costs a full round trip to the instance before the server
 * rejects it. The vendored scanner and parser of Sourcegraph are already in this
 * package, so the check runs locally and reports both the parse error and how to
 * fix it.
 *
 * What this catches, verified against the vendored parser:
 *
 * | Input | Caught |
 * |---|---|
 * | `repo:a/b (unclosed` | yes, `no unbalanced parentheses` |
 * | a query with no search pattern | yes |
 * | a literal pattern with a patternType that cannot read it | yes |
 * | a filter the scanner does not know | indirectly. Sourcegraph's scanner only
 *   treats a known filter name as a filter, so an unknown name becomes ordinary
 *   pattern text, and the query then needs a pattern of its own |
 *
 * What it does not catch: a query that is syntactically valid but matches
 * nothing, and a `repo:` value naming a repository the instance does not have.
 * Only the server can answer those.
 *
 * @module dsh-tool-sourcegraph/validate
 */
import { SearchPatternType } from './vendor/sourcegraph-query/query/pattern-type.js';
/**
 * The pattern types the tool offers, which are the values of the vendored enum.
 *
 * The tool declares its own union so the parameter schema carries a plain
 * `enum`, and this bridges the two. The literal type keeps that bridge checked:
 * a value added here must exist on the enum.
 */
export type ToolPatternType = 'keyword' | 'standard' | 'regexp' | 'structural' | 'literal';
/**
 * Convert the tool's pattern type to the enum the vendored parser expects.
 *
 * @param value - the value from the tool call, when one was given.
 * @returns the matching enum member, or undefined.
 */
export declare function toPatternType(value: string | undefined): SearchPatternType | undefined;
/** The result of a pre-flight check. */
export type ValidationResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    /** What the parser objected to, in the words of Sourcegraph. */
    readonly reason: string;
    /** What the caller should change. */
    readonly advice: string;
};
/**
 * Check a query before it costs a request.
 *
 * @param query - the query text, exactly as it will be sent.
 * @param patternType - the pattern type the caller pinned, when any.
 * @returns a result naming the problem and the fix, or `ok`.
 */
export declare function validateQuery(query: string, rawPatternType?: string): ValidationResult;
