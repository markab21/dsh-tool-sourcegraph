/*
 * VENDORED — modified from the upstream file of the same name.
 *
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 *           client/shared/src/search/query/scanner.ts
 * Changed:  import specifiers rewritten; the ScanResult narrowing in filterValue was bound to a local (see the inline comment).
 *
 * Apache-2.0 section 4(b) notice. See ../PROVENANCE.md for the full list
 * of modifications and the license terms this file is used under.
 */
import { SearchPatternType } from './pattern-type.js';
import { filterTypeKeysWithAliases } from './filters.js';
import { scanPredicate } from './predicates.js';
import { KeywordKind, PatternKind, createLiteral, } from './token.js';
/**
 * Returns a {@link Scanner} that succeeds if zero or more tokens are scanned
 * by the given `scanToken` scanners.
 */
const zeroOrMore = (scanToken) => (input, start) => {
    const tokens = [];
    let adjustedStart = start;
    let end = start + 1;
    while (input[adjustedStart] !== undefined) {
        const result = scanToken(input, adjustedStart);
        if (result.type === 'error') {
            return result;
        }
        if (Array.isArray(result.term)) {
            for (const token of result.term) {
                tokens.push(token);
                end = token.range.end;
            }
        }
        else {
            tokens.push(result.term);
            end = result.term.range.end;
        }
        adjustedStart = end;
    }
    return { type: 'success', term: tokens };
};
/**
 * Returns a {@link Scanner} that succeeds if any of the given scanner succeeds.
 */
export const oneOf = (...scanners) => (input, start) => {
    const expected = [];
    for (const scanner of scanners) {
        const result = scanner(input, start);
        if (result.type === 'success') {
            return result;
        }
        expected.push(result.expected);
    }
    return {
        type: 'error',
        expected: `One of: ${expected.join(', ')}`,
        at: start,
    };
};
/**
 * A {@link Scanner} that will attempt to scan delimited strings for an arbitrary
 * delimiter. `\` is treated as an escape character for the delimited string.
 */
export const quoted = (delimiter) => (input, start) => {
    if (input[start] !== delimiter) {
        return { type: 'error', expected: delimiter, at: start };
    }
    let end = start + 1;
    while (input[end] && (input[end] !== delimiter || input[end - 1] === '\\')) {
        end = end + 1;
    }
    if (!input[end]) {
        return { type: 'error', expected: delimiter, at: end };
    }
    return {
        type: 'success',
        // end + 1 as `end` is currently the index of the quote in the string.
        term: createLiteral(input.slice(start + 1, end), { start, end: end + 1 }, true, delimiter),
    };
};
/**
 * A {@link Scanner} that scans a ':' separator for fields.
 */
const filterSeparator = (input, start) => {
    if (input[start] !== ':') {
        return { type: 'error', expected: ':', at: start };
    }
    return {
        type: 'success',
        term: createLiteral(':', { start, end: start + 1 }),
    };
};
/**
 * A {@link Scanner} that will attempt to scan
 * tokens matching the given RegExp pattern in a search query.
 */
const scanToken = (regexp, output, expected) => {
    if (!regexp.source.startsWith('^')) {
        regexp = new RegExp(`^${regexp.source}`, regexp.flags);
    }
    return (input, start) => {
        const matchTarget = input.slice(Math.max(0, start));
        if (!matchTarget) {
            return { type: 'error', expected: expected || `/${regexp.source}/`, at: start };
        }
        const match = matchTarget.match(regexp);
        if (!match) {
            return { type: 'error', expected: expected || `/${regexp.source}/`, at: start };
        }
        const range = { start, end: start + match[0].length };
        return {
            type: 'success',
            term: output
                ? typeof output === 'function'
                    ? output(match[0], range)
                    : output
                : { type: 'literal', value: match[0], range },
        };
    };
};
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
export const scanBalancedLiteral = (input, start) => {
    let adjustedStart = start;
    let balanced = 0;
    let current = '';
    const result = [];
    const nextChar = () => {
        current = input[adjustedStart];
        adjustedStart += 1;
    };
    if (!keepScanning(input, start)) {
        return {
            type: 'error',
            expected: 'no recognized filter or keyword',
            at: start,
        };
    }
    while (input[adjustedStart] !== undefined) {
        nextChar();
        if (current.match(/\s/) && balanced === 0) {
            // Stop scanning a potential pattern when we see whitespace in a balanced state.
            adjustedStart -= 1; // Backtrack.
            break;
        }
        else if (current === '(') {
            if (!keepScanning(input, adjustedStart)) {
                return {
                    type: 'error',
                    expected: 'no recognized filter or keyword',
                    at: adjustedStart,
                };
            }
            balanced += 1;
            result.push(current);
        }
        else if (current === ')') {
            balanced -= 1;
            if (balanced < 0 && adjustedStart > 1) {
                // This paren is an unmatched closing paren, so we stop treating it as a potential
                // pattern here--it might be closing a group.
                adjustedStart -= 1; // Backtrack.
                balanced = 0; // Pattern is balanced up to this point
                break;
            }
            result.push(current);
        }
        else if (current === ' ') {
            if (!keepScanning(input, adjustedStart)) {
                return {
                    type: 'error',
                    expected: 'no recognized filter or keyword',
                    at: adjustedStart,
                };
            }
            result.push(current);
        }
        else if (current === '\\') {
            if (input[adjustedStart] !== undefined) {
                nextChar();
                // Accept anything anything escaped. The point is to consume escaped spaces like "\ "
                // so that we don't recognize it as terminating a pattern.
                result.push('\\', current);
                continue;
            }
            result.push(current);
        }
        else {
            result.push(current);
        }
    }
    if (balanced !== 0) {
        return {
            type: 'error',
            expected: 'no unbalanced parentheses',
            at: adjustedStart,
        };
    }
    return {
        type: 'success',
        term: createLiteral(result.join(''), { start, end: adjustedStart }),
    };
};
/**
 * Scan predicate syntax like repo:contains.file(path:README.md). Predicate scanning
 * takes precedence over other value scanners like scanBalancedLiteral.
 */
export const scanPredicateValue = (input, start, field) => {
    const result = scanPredicate(field.value, input.slice(start));
    if (!result) {
        return {
            type: 'error',
            expected: 'recognized predicate',
            at: start,
        };
    }
    const value = `${result.name}${result.parameters}`;
    return {
        type: 'success',
        term: createLiteral(value, { start, end: start + value.length }),
    };
};
const whitespace = scanToken(/\s+/, (_value, range) => ({
    type: 'whitespace',
    range,
}));
const literal = scanToken(/[^\s)]+/);
const keywordNot = scanToken(/(not|NOT)/, (value, { start, end }) => ({
    type: 'keyword',
    value,
    range: { start, end },
    kind: KeywordKind.Not,
}));
const keywordAnd = scanToken(/(and|AND)/, (value, { start, end }) => ({
    type: 'keyword',
    value,
    range: { start, end },
    kind: KeywordKind.And,
}));
const keywordOr = scanToken(/(or|OR)/, (value, { start, end }) => ({
    type: 'keyword',
    value,
    range: { start, end },
    kind: KeywordKind.Or,
}));
const keyword = oneOf(keywordAnd, keywordOr, keywordNot);
const comment = scanToken(/\/\/.*/, (value, { start, end }) => ({ type: 'comment', value, range: { start, end } }));
const filterField = scanToken(new RegExp(`-?(${filterTypeKeysWithAliases.join('|')})+(?=:)`, 'i'));
const filterValue = oneOf(quoted('"'), quoted("'"), scanBalancedLiteral, literal);
const openingParen = scanToken(/\(/, (_input, range) => ({ type: 'openingParen', range }));
const closingParen = scanToken(/\)/, (_input, range) => ({ type: 'closingParen', range }));
const scanBalancedParens = (input, start) => {
    const scanner = scanToken(/\(\s*\)/, (value, range) => ({ type: 'literal', value, quoted: false, range }));
    const result = scanner(input, start);
    if (result.type === 'success') {
        // Hack: hard code '()' as this is how the backend interprets parenthesis without content. This only affects
        // the tooltip.
        return createPattern('()', result.term.range, PatternKind.Literal, result.term.quoted, result.term.quotes);
    }
    return result;
};
/**
 * Returns a {@link Scanner} that succeeds if `scanTerm` succeeds,
 * followed by `scanNext`.
 */
const followedBy = (scanTerm, scanNext) => (input, start) => {
    const result = scanTerm(input, start);
    if (result.type === 'error') {
        return result;
    }
    let end;
    const tokens = [];
    if (Array.isArray(result.term)) {
        for (const token of result.term) {
            tokens.push(token);
            end = token.range.end;
        }
    }
    else {
        tokens.push(result.term);
        end = result.term.range.end;
    }
    // Invariant: end is defined.
    if (end && input[end] !== undefined) {
        const next = scanNext(input, end);
        if (next.type === 'error') {
            return next;
        }
        tokens.push(next.term);
        end = next.term.range.end;
    }
    return {
        type: 'success',
        term: tokens,
    };
};
/**
 * A {@link Scanner} that will attempt to scan {@link Filter} tokens
 * (consisting a of a filter type and a filter value, separated by a colon)
 * in a search query.
 */
const filter = (input, start) => {
    const scanPrefix = followedBy(filterField, filterSeparator);
    const result = scanPrefix(input, start);
    if (result.type === 'error') {
        return result;
    }
    const [field, separator] = result.term;
    let value;
    if (input[separator.range.end] === undefined) {
        value = undefined;
    }
    else {
        value = scanPredicateValue(input, separator.range.end, field);
        if (value.type === 'error') {
            value = filterValue(input, separator.range.end);
        }
    }
    if (value && value.type === 'error') {
        return value;
    }
    // Vendored modification: bind the narrowed term before building the result.
    // TypeScript does not carry the union narrowing above through the object
    // literal below (`value` is reassigned inside the preceding else-branch),
    // which this compiler flags and upstream's does not.
    const term = value?.type === 'error' ? undefined : value?.term;
    return {
        type: 'success',
        term: {
            type: 'filter',
            range: { start, end: term ? term.range.end : separator.range.end },
            field,
            value: term,
            negated: field.value.startsWith('-'),
        },
    };
};
const createPattern = (value, range, kind, delimited, delimiter) => ({
    type: 'success',
    term: {
        type: 'pattern',
        range,
        kind,
        value,
        delimited,
        delimiter,
    },
});
const scanFilterOrKeyword = oneOf(filterField, followedBy(keyword, whitespace));
const keepScanning = (input, start) => scanFilterOrKeyword(input, start).type !== 'success';
/**
 * A helper function that maps a {@link Literal} scanner result to a {@link Pattern} scanner.
 *
 * @param scanner The literal scanner.
 * @param kind The {@link PatternKind} label to apply to the resulting pattern scanner.
 */
export const toPatternResult = (scanner, kind) => (input, start) => {
    const result = scanner(input, start);
    if (result.type === 'success') {
        return createPattern(result.term.value, result.term.range, kind, result.term.quoted, result.term.quotes);
    }
    return result;
};
const scanPattern = (kind) => toPatternResult(oneOf(scanBalancedLiteral, literal), kind);
const whitespaceOrClosingParen = oneOf(whitespace, closingParen);
/**
 * A {@link Scanner} for a Sourcegraph search query, interpreting patterns for {@link PatternKind}.
 *
 * @param interpretComments Interpets C-style line comments for multiline queries.
 */
const createScanner = (kind, interpretComments) => {
    const quotedPatternScanner = kind === PatternKind.Regexp ? [quoted('"'), quoted("'"), quoted('/')] : [];
    const baseScanner = [keyword, filter, ...quotedPatternScanner, scanPattern(kind)];
    const tokenScanner = interpretComments ? [comment, ...baseScanner] : baseScanner;
    const baseEarlyPatternScanner = [...quotedPatternScanner, toPatternResult(scanBalancedLiteral, kind)];
    const earlyPatternScanner = interpretComments ? [comment, ...baseEarlyPatternScanner] : baseEarlyPatternScanner;
    return zeroOrMore(oneOf(whitespace, ...earlyPatternScanner.map(token => followedBy(token, whitespaceOrClosingParen)), openingParen, closingParen, ...tokenScanner.map(token => followedBy(token, whitespaceOrClosingParen))));
};
const scanStandard = (query) => {
    const tokenScanner = [
        keyword,
        filter,
        toPatternResult(quoted('/'), PatternKind.Regexp),
        scanPattern(PatternKind.Literal),
    ];
    const earlyPatternScanner = [
        toPatternResult(quoted('/'), PatternKind.Regexp),
        toPatternResult(scanBalancedLiteral, PatternKind.Literal),
    ];
    const scan = zeroOrMore(oneOf(whitespace, ...earlyPatternScanner.map(token => followedBy(token, whitespaceOrClosingParen)), openingParen, closingParen, ...tokenScanner.map(token => followedBy(token, whitespaceOrClosingParen))));
    return scan(query, 0);
};
/**
 * scanKeyword is like {@LINK scanStandard} except that quoted tokens are interpreted literally.
 */
const scanKeyword = (query) => {
    const tokenScanner = [
        keyword,
        filter,
        toPatternResult(quoted('"'), PatternKind.Literal),
        toPatternResult(quoted("'"), PatternKind.Literal),
        toPatternResult(quoted('/'), PatternKind.Regexp),
        scanPattern(PatternKind.Literal),
    ];
    const earlyPatternScanner = [
        toPatternResult(quoted('"'), PatternKind.Literal),
        toPatternResult(quoted("'"), PatternKind.Literal),
        toPatternResult(quoted('/'), PatternKind.Regexp),
        scanBalancedParens,
    ];
    const scan = zeroOrMore(oneOf(whitespace, ...earlyPatternScanner.map(token => followedBy(token, whitespaceOrClosingParen)), openingParen, closingParen, ...tokenScanner.map(token => followedBy(token, whitespaceOrClosingParen))));
    return scan(query, 0);
};
export function detectPatternType(query) {
    const result = scanStandard(query);
    const tokens = result.type === 'success'
        ? result.term.filter(token => !!(token.type === 'filter' && token.field.value.toLowerCase() === 'patterntype'))
        : undefined;
    if (tokens && tokens.length > 0) {
        return tokens[0].value?.value;
    }
    return undefined;
}
/**
 * Scans a search query string.
 */
export const scanSearchQuery = (query, interpretComments, searchPatternType = SearchPatternType.literal) => {
    const patternType = detectPatternType(query) || searchPatternType;
    let patternKind;
    switch (patternType) {
        case SearchPatternType.standard:
        case SearchPatternType.lucky:
        case SearchPatternType.codycontext: {
            return scanStandard(query);
        }
        case SearchPatternType.keyword: {
            return scanKeyword(query);
        }
        case SearchPatternType.literal: {
            patternKind = PatternKind.Literal;
            break;
        }
        case SearchPatternType.regexp: {
            patternKind = PatternKind.Regexp;
            break;
        }
        case SearchPatternType.structural: {
            patternKind = PatternKind.Structural;
            break;
        }
    }
    const scanner = createScanner(patternKind, interpretComments);
    return scanner(query, 0);
};
export const succeedScan = (query) => {
    const result = scanSearchQuery(query);
    if (result.type !== 'success') {
        throw new Error('Internal error: invariant broken: succeedScan callers must be called with a valid query');
    }
    return result.term;
};
const patternScanner = zeroOrMore(oneOf(whitespace, toPatternResult(quoted('/'), PatternKind.Regexp), 
// We don't use scanPattern or literal here because we want to treat parenthesis as regular characters
toPatternResult(scanToken(/\S+/), PatternKind.Literal)));
/**
 * Scans the search query as a sequence of patterns only. This is used in situations where we don't want
 * to interpret filters or keywords.
 */
export function scanSearchQueryAsPatterns(query) {
    return patternScanner(query, 0);
}
//# sourceMappingURL=scanner.js.map