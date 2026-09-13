import { type Completion, FilterType } from './filters.js';
interface PredicateDefinition {
    field: string;
    name: string;
}
export declare const PREDICATES: PredicateDefinition[];
/** Represents a predicate's components corresponding to the syntax path(parameters). */
export interface PredicateInstance extends PredicateDefinition {
    parameters: string;
}
/**
 * Scans predicate syntax of the form field:foo.bar(parameters) and
 * returns the name and parameters components. It checks that:
 *
 * (1) The (field, name) pair is a recognized predicate.
 * (2) The parameters value is well-balanced.
 */
export declare const scanPredicate: (field: string, value: string) => PredicateInstance | undefined;
export declare const predicateCompletion: (field: FilterType) => Completion[];
export {};
