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
import { parseSearchQuery } from './vendor/sourcegraph-query/query/parser.js';
import { scanSearchQuery } from './vendor/sourcegraph-query/query/scanner.js';
import { SearchPatternType } from './vendor/sourcegraph-query/query/pattern-type.js';
/**
 * Convert the tool's pattern type to the enum the vendored parser expects.
 *
 * @param value - the value from the tool call, when one was given.
 * @returns the matching enum member, or undefined.
 */
export function toPatternType(value) {
    switch (value) {
        case 'keyword':
            return SearchPatternType.keyword;
        case 'standard':
            return SearchPatternType.standard;
        case 'regexp':
            return SearchPatternType.regexp;
        case 'structural':
            return SearchPatternType.structural;
        case 'literal':
            return SearchPatternType.literal;
        default:
            return undefined;
    }
}
/**
 * Describe a query with the vendored scanner.
 *
 * @param query - the query text.
 * @param patternType - the pattern type in force, when the caller pinned one.
 * @returns what the query carries.
 */
function describeQuery(query, patternType) {
    const scanned = scanSearchQuery(query, undefined, patternType);
    if (scanned.type !== 'success')
        return { hasPattern: false, fields: [] };
    let hasPattern = false;
    const fields = [];
    for (const term of scanned.term) {
        if (term.type === 'literal' || term.type === 'pattern')
            hasPattern = true;
        else if (term.type === 'filter') {
            fields.push(term.field.value.replace(/^-/, '').toLowerCase());
        }
    }
    return { hasPattern, fields };
}
/**
 * Whether the query carries a pattern in slash delimiters, which the literal
 * pattern type cannot read.
 *
 * @param query - the query text.
 * @param patternType - the pattern type in force, which the scanner needs to
 *   classify the delimited text as a pattern rather than as a literal.
 * @returns true when a slash-quoted pattern is present.
 */
function hasSlashPattern(query, patternType) {
    const scanned = scanSearchQuery(query, undefined, patternType);
    if (scanned.type !== 'success')
        return false;
    return scanned.term.some((term) => term.type === 'pattern' && term.value.startsWith('/') && term.value.endsWith('/'));
}
/**
 * Check a query before it costs a request.
 *
 * @param query - the query text, exactly as it will be sent.
 * @param patternType - the pattern type the caller pinned, when any.
 * @returns a result naming the problem and the fix, or `ok`.
 */
export function validateQuery(query, rawPatternType) {
    const patternType = toPatternType(rawPatternType);
    const trimmed = query.trim();
    if (trimmed === '') {
        return {
            ok: false,
            reason: 'the query is empty',
            advice: 'Pass a search pattern, for example `func Name repo:^github\\.com/owner/name$`.',
        };
    }
    const parsed = parseSearchQuery(trimmed);
    if (parsed.type === 'error') {
        // The parser reports a required token rather than a position, so the advice
        // names the two shapes that produce this error in practice.
        return {
            ok: false,
            reason: `Sourcegraph rejected the query syntax: ${parsed.expected}`,
            advice: 'Check the parentheses and any quoted value. A `(` without a matching `)` ' +
                'and a pattern such as `content:"unterminated` are the usual causes.',
        };
    }
    const shape = describeQuery(trimmed, patternType);
    if (!shape.hasPattern) {
        // A filter that selects results on its own makes a pattern unnecessary.
        // `type:` chooses a result class, and `select:` picks the facet to return.
        const selectsOnItsOwn = shape.fields.some((field) => field === 'type' || field === 'select');
        if (!selectsOnItsOwn) {
            return {
                ok: false,
                reason: 'the query has filters but no search pattern',
                advice: 'Add what to look for, or use a filter that selects results on its own ' +
                    'such as `type:repo` or `select:repo`.',
            };
        }
    }
    // The parser keeps the delimiters in the pattern text, so this reads the
    // parsed value rather than re-scanning the raw string.
    if (patternType === SearchPatternType.literal && hasSlashPattern(trimmed, patternType)) {
        return {
            ok: false,
            reason: 'the query looks like a regular expression but patternType is literal',
            advice: 'Use `patternType:regexp`, or remove the surrounding slashes.',
        };
    }
    return { ok: true };
}
//# sourceMappingURL=preflight.js.map