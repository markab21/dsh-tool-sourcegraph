import type { Literal } from './token.js';
interface Access {
    name: string;
    fields?: Access[];
}
export declare const SELECTORS: Access[];
/**
 * Returns true if the provided select value has additional subfields.
 */
export declare const selectorHasFields: (value: string) => boolean;
/**
 * Returns all paths rooted at a {@link selector} up to {@param depth}.
 */
export declare const selectDiscreteValues: (selectors: Access[], depth: number) => string[];
export declare const selectorCompletion: (value: Literal | undefined) => string[];
export {};
