import type { Token } from './token.js';
/**
 * stringHuman creates a valid query string from a scanned query formatted for human
 * readability. It should be used in contexts where modified query tokens must be
 * converted back to human readable form (e.g., for query suggestions).
 */
export declare const stringHuman: (tokens: Token[]) => string;
