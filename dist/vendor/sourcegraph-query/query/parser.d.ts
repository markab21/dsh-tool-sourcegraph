import { type ScanResult } from './scanner.js';
import { type Token, type CharacterRange, type PatternKind } from './token.js';
interface Pattern {
    type: 'pattern';
    kind: PatternKind;
    value: string;
    range: CharacterRange;
}
export interface Parameter {
    type: 'parameter';
    field: string;
    value: string;
    quoted: boolean;
    negated: boolean;
    range: CharacterRange;
}
/**
 * A Sequence represent a sequence of nodes, i.e. 'a b c'. While such as
 * sequence is often thought about as "implicit AND", it's usually _not_
 * equivalent to 'a AND b AND c', which is why this gets its own node type.
 */
interface Sequence {
    type: 'sequence';
    nodes: Node[];
    range: CharacterRange;
}
export declare enum OperatorKind {
    Or = "OR",
    And = "AND",
    Not = "NOT"
}
/**
 * A nonterminal node for operators AND and OR.
 */
export interface Operator {
    type: 'operator';
    kind: OperatorKind;
    left: Node | null;
    right: Node | null;
    range: CharacterRange;
    /**
     * Position in the query string including parenthesis if used
     */
    groupRange?: CharacterRange;
}
export type Node = Sequence | Operator | Parameter | Pattern;
interface ParseError {
    type: 'error';
    expected: string;
}
export interface ParseSuccess {
    type: 'success';
    node: Node;
}
export type ParseResult = ParseError | ParseSuccess;
/**
 * Produces a parse tree from a search query.
 */
export declare const parseSearchQuery: (input: string | ScanResult<Token[]>) => ParseResult;
export {};
