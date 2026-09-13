/**
 * Shim: the `SearchPatternType` enum that upstream imports from its generated
 * `graphql-operations` module.
 *
 * Sourcegraph generates that module at build time from
 * `cmd/frontend/graphqlbackend/schema.graphql`, so it does not exist in the
 * source tree. The values below are transcribed from the `enum
 * SearchPatternType` definition in that schema at the pinned commit.
 *
 * This is one of the local shims described in ../PROVENANCE.md. It is our code,
 * not vendored code, and is licensed under this repository's MIT license.
 */
/** Values of the GraphQL `SearchPatternType` enum (schema.graphql:2631). */
export var SearchPatternType;
(function (SearchPatternType) {
    SearchPatternType["standard"] = "standard";
    SearchPatternType["literal"] = "literal";
    SearchPatternType["regexp"] = "regexp";
    SearchPatternType["structural"] = "structural";
    SearchPatternType["lucky"] = "lucky";
    SearchPatternType["keyword"] = "keyword";
    SearchPatternType["codycontext"] = "codycontext";
})(SearchPatternType || (SearchPatternType = {}));
//# sourceMappingURL=pattern-type.js.map