/**
 * A label associated with a pattern token. We don't use SearchPatternType because
 * that is used as a global quantifier for all patterns in a query. PatternKind
 * allows to qualify multiple pattern tokens differently within a single query.
 */
export var PatternKind;
(function (PatternKind) {
    PatternKind[PatternKind["Literal"] = 1] = "Literal";
    PatternKind[PatternKind["Regexp"] = 2] = "Regexp";
    PatternKind[PatternKind["Structural"] = 3] = "Structural";
})(PatternKind || (PatternKind = {}));
export var KeywordKind;
(function (KeywordKind) {
    KeywordKind["Or"] = "or";
    KeywordKind["And"] = "and";
    KeywordKind["Not"] = "not";
})(KeywordKind || (KeywordKind = {}));
export const createLiteral = (value, range, quoted = false, quotes) => ({
    type: 'literal',
    value,
    range,
    quoted,
    quotes,
});
//# sourceMappingURL=token.js.map