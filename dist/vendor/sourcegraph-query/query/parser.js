/*
 * VENDORED — modified from the upstream file of the same name.
 *
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 *           client/shared/src/search/query/parser.ts
 * Changed:  import specifiers rewritten.
 *
 * Apache-2.0 section 4(b) notice. See ../PROVENANCE.md for the full list
 * of modifications and the license terms this file is used under.
 */
import { scanSearchQuery } from './scanner.js';
import { KeywordKind } from './token.js';
export var OperatorKind;
(function (OperatorKind) {
    OperatorKind["Or"] = "OR";
    OperatorKind["And"] = "AND";
    OperatorKind["Not"] = "NOT";
})(OperatorKind || (OperatorKind = {}));
const rangeFromNodes = (nodes) => nodes.reduce((range, node) => {
    const nodeRange = node.type === 'operator' ? node.groupRange ?? node.range : node.range;
    if (nodeRange.start < range.start) {
        range.start = nodeRange.start;
    }
    if (nodeRange.end > range.end) {
        range.end = nodeRange.end;
    }
    return range;
}, { start: Infinity, end: -Infinity });
const createNode = (node) => ({ type: 'success', node });
const createSequence = (nodes) => {
    switch (nodes.length) {
        case 0:
        case 1: {
            return createNode(nodes[0]);
        }
        default: {
            return createNode({ type: 'sequence', nodes, range: rangeFromNodes(nodes) });
        }
    }
};
const createOperator = (left, right, kind, rangeStart) => {
    const nodes = [];
    if (left) {
        nodes.push(left);
    }
    if (right) {
        nodes.push(right);
    }
    const range = rangeFromNodes(nodes);
    if (rangeStart !== undefined) {
        range.start = rangeStart;
    }
    return createNode({ type: 'operator', left, right, kind, range });
};
const tokenToLeafNode = (token) => {
    switch (token.type) {
        case 'pattern': {
            return createNode({ type: 'pattern', kind: token.kind, value: token.value, range: token.range });
        }
        case 'filter': {
            return createNode({
                type: 'parameter',
                field: token.field.value,
                value: token.value?.value ?? '',
                quoted: token.value?.quoted ?? false,
                negated: token.negated,
                range: token.range,
            });
        }
    }
    return { type: 'error', expected: 'a convertable token to tree node' };
};
const parseParenthesis = (tokens) => {
    const openingParen = tokens[0];
    tokens = tokens.slice(1); // Consume '('.
    const groupNodes = parseOr(tokens);
    if (groupNodes.result.type === 'error') {
        return { result: groupNodes.result, tokens };
    }
    if (groupNodes.tokens[0]?.type !== 'closingParen') {
        return { result: { type: 'error', expected: 'no unbalanced parentheses' }, tokens };
    }
    const closingParen = groupNodes.tokens[0];
    tokens = groupNodes.tokens.slice(1); // Consume )
    if (groupNodes.result.node.type === 'operator') {
        groupNodes.result.node.groupRange = {
            start: openingParen.range.start,
            end: closingParen.range.end,
        };
    }
    return { result: groupNodes.result, tokens };
};
const parseNot = (tokens) => {
    const keyword = tokens[0];
    if (!(keyword.type === 'keyword' && keyword.kind === KeywordKind.Not)) {
        throw new Error('parseNot is called at an invalid token position');
    }
    tokens = tokens.slice(1); // consume NOT
    let operand = null;
    const token = tokens[0];
    if (!token) {
        return { result: createOperator(null, operand, OperatorKind.Not), tokens };
    }
    switch (token.type) {
        case 'openingParen': {
            const state = parseParenthesis(tokens);
            if (state.result.type === 'error') {
                return { result: state.result, tokens };
            }
            operand = state.result.node;
            tokens = state.tokens;
            break;
        }
        default: {
            const result = tokenToLeafNode(token);
            if (result.type === 'error') {
                return { result, tokens };
            }
            operand = result.node;
            tokens = tokens.slice(1);
        }
    }
    return { result: createOperator(null, operand, OperatorKind.Not, keyword.range.start), tokens };
};
/**
 * parseSequence parses consecutive tokens. If the sequence has a size smaller
 * than 2 the nodes are returned directly. That means there will never be a
 * sequence of size 1.
 * This also takes care of parsing the NOT keyword
 */
const parseSequence = (tokens) => {
    const nodes = [];
    while (true) {
        const current = tokens[0];
        if (current === undefined) {
            break;
        }
        if (current.type === 'openingParen') {
            const state = parseParenthesis(tokens);
            if (state.result.type === 'error') {
                return { result: state.result, tokens: state.tokens };
            }
            nodes.push(state.result.node);
            tokens = state.tokens;
            continue;
        }
        if (current.type === 'closingParen') {
            break;
        }
        if (current.type === 'keyword') {
            if (current.kind === KeywordKind.And || current.kind === KeywordKind.Or) {
                break; // Caller advances.
            }
            if (current.kind === KeywordKind.Not) {
                const state = parseNot(tokens);
                if (state.result.type === 'error') {
                    return { result: state.result, tokens: state.tokens };
                }
                nodes.push(state.result.node);
                tokens = state.tokens;
                continue;
            }
        }
        const node = tokenToLeafNode(current);
        if (node.type === 'error') {
            return { result: node, tokens };
        }
        nodes.push(node.node);
        tokens = tokens.slice(1);
    }
    return { result: createSequence(nodes), tokens };
};
/**
 * parseAnd parses and-expressions. And operators bind tighter:
 * (a and b or c) => ((a and b) or c).
 */
const parseAnd = (tokens) => {
    const left = parseSequence(tokens);
    if (left.result.type === 'error') {
        return { result: left.result, tokens };
    }
    if (left.tokens[0] === undefined) {
        return { result: left.result, tokens: [] };
    }
    if (!(left.tokens[0].type === 'keyword' && left.tokens[0].kind === KeywordKind.And)) {
        return { result: left.result, tokens: left.tokens };
    }
    tokens = left.tokens.slice(1); // Consume AND token.
    const right = parseAnd(tokens);
    if (right.result.type === 'error') {
        return { result: right.result, tokens };
    }
    return {
        result: createOperator(left.result.node, right.result.node, OperatorKind.And),
        tokens: right.tokens,
    };
};
/**
 * parseOr parses or-expressions. Or operators have lower precedence than And
 * operators, therefore this function calls parseAnd.
 */
const parseOr = (tokens) => {
    const left = parseAnd(tokens);
    if (left.result.type === 'error') {
        return { result: left.result, tokens };
    }
    if (left.tokens[0] === undefined) {
        return { result: left.result, tokens: [] };
    }
    if (!(left.tokens[0].type === 'keyword' && left.tokens[0].kind === KeywordKind.Or)) {
        return { result: left.result, tokens: left.tokens };
    }
    tokens = left.tokens.slice(1); // Consume OR token.
    const right = parseOr(tokens);
    if (right.result.type === 'error') {
        return { result: right.result, tokens };
    }
    return {
        result: createOperator(left.result.node, right.result.node, OperatorKind.Or),
        tokens: right.tokens,
    };
};
/**
 * Produces a parse tree from a search query.
 */
export const parseSearchQuery = (input) => {
    const result = typeof input === 'string' ? scanSearchQuery(input) : input;
    if (result.type === 'error') {
        return {
            type: 'error',
            expected: result.expected,
        };
    }
    // Scanner can produce empty pattern tokens in some locations which break
    // the parser. Those need to be filtered out.
    // See https://github.com/sourcegraph/sourcegraph/issues/38384
    return parseOr(result.term.filter(token => token.type !== 'whitespace' && !(token.type === 'pattern' && token.value === ''))).result;
};
//# sourceMappingURL=parser.js.map