import { languageCompletion } from './languageFilter.js';
import { selectorCompletion } from './selectFilter.js';
/*
 * VENDORED — modified from the upstream file of the same name.
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 * Apache-2.0 section 4(b) change notice; see ../PROVENANCE.md.
 */
export var FilterType;
(function (FilterType) {
    FilterType["after"] = "after";
    FilterType["archived"] = "archived";
    FilterType["author"] = "author";
    FilterType["before"] = "before";
    FilterType["case"] = "case";
    FilterType["committer"] = "committer";
    FilterType["content"] = "content";
    FilterType["context"] = "context";
    FilterType["count"] = "count";
    FilterType["file"] = "file";
    FilterType["fork"] = "fork";
    FilterType["lang"] = "lang";
    FilterType["message"] = "message";
    FilterType["patterntype"] = "patterntype";
    FilterType["repo"] = "repo";
    FilterType["repohascommitafter"] = "repohascommitafter";
    FilterType["repohasfile"] = "repohasfile";
    FilterType["rev"] = "rev";
    FilterType["select"] = "select";
    FilterType["timeout"] = "timeout";
    FilterType["type"] = "type";
    FilterType["visibility"] = "visibility";
})(FilterType || (FilterType = {}));
export var AliasedFilterType;
(function (AliasedFilterType) {
    AliasedFilterType["f"] = "file";
    AliasedFilterType["path"] = "file";
    AliasedFilterType["l"] = "lang";
    AliasedFilterType["language"] = "lang";
    AliasedFilterType["m"] = "message";
    AliasedFilterType["msg"] = "message";
    AliasedFilterType["r"] = "repo";
    AliasedFilterType["revision"] = "rev";
    AliasedFilterType["since"] = "after";
    AliasedFilterType["until"] = "before";
})(AliasedFilterType || (AliasedFilterType = {}));
export const ALIASES = {
    r: 'repo',
    path: 'file',
    f: 'file',
    l: 'lang',
    language: 'language',
    since: 'after',
    until: 'before',
    m: 'message',
    msg: 'message',
    revision: 'rev',
};
export const resolveFieldAlias = (field) => ALIASES[field] || field;
export const isFilterType = (filter) => filter in FilterType;
const isAliasedFilterType = (filter) => filter in AliasedFilterType;
export const filterTypeKeys = Object.keys(FilterType);
export const filterTypeKeysWithAliases = [
    ...filterTypeKeys,
    ...Object.keys(AliasedFilterType),
];
export var NegatedFilters;
(function (NegatedFilters) {
    NegatedFilters["author"] = "-author";
    NegatedFilters["committer"] = "-committer";
    NegatedFilters["content"] = "-content";
    NegatedFilters["f"] = "-f";
    NegatedFilters["file"] = "-file";
    NegatedFilters["path"] = "-path";
    NegatedFilters["l"] = "-l";
    NegatedFilters["lang"] = "-lang";
    NegatedFilters["language"] = "-language";
    NegatedFilters["message"] = "-message";
    NegatedFilters["r"] = "-r";
    NegatedFilters["repo"] = "-repo";
    NegatedFilters["repohasfile"] = "-repohasfile";
})(NegatedFilters || (NegatedFilters = {}));
export const isNegatableFilter = (filter) => Object.keys(NegatedFilters).includes(filter);
/** The list of all negated filters. i.e. all valid filters that have `-` as a suffix. */
const negatedFilters = Object.values(NegatedFilters);
export const isNegatedFilter = (filter) => negatedFilters.includes(filter);
const negatedFilterToNegatableFilter = {
    '-author': FilterType.author,
    '-committer': FilterType.committer,
    '-content': FilterType.content,
    '-f': FilterType.file,
    '-file': FilterType.file,
    '-path': FilterType.file,
    '-l': FilterType.lang,
    '-lang': FilterType.lang,
    '-language': FilterType.lang,
    '-message': FilterType.message,
    '-r': FilterType.repo,
    '-repo': FilterType.repo,
    '-repohasfile': FilterType.repohasfile,
};
export const resolveNegatedFilter = (filter) => negatedFilterToNegatableFilter[filter];
const SOURCEGRAPH_DOT_COM_REPO_COMPLETION = [
    {
        label: 'Search a GitHub organization',
        // eslint-disable-next-line no-template-curly-in-string
        insertText: '^github\\.com/${1:ORGANIZATION}/.*',
        asSnippet: true,
    },
    {
        label: 'Search a single GitHub repository',
        // eslint-disable-next-line no-template-curly-in-string
        insertText: '^github\\.com/${1:ORGANIZATION}/${2:REPO-NAME}$',
        asSnippet: true,
    },
    {
        label: 'Search for repositories with fuzzy string search',
        // eslint-disable-next-line no-template-curly-in-string
        insertText: '${1:STRING}',
        asSnippet: true,
    },
];
export const FILTERS = {
    [FilterType.after]: {
        alias: 'since',
        description: 'Commits made after a certain time e.g. yesterday, or 12/31/2022',
        placeholder: '"last week"',
    },
    [FilterType.archived]: {
        description: 'Include results from archived repositories.',
        discreteValues: () => ['yes', 'only', 'no'].map(value => ({ label: value })),
        singular: true,
    },
    [FilterType.author]: {
        negatable: true,
        description: negated => `${negated ? 'Exclude' : 'Include only'} commits or diffs authored by a user.`,
        placeholder: '"author name/email"',
    },
    [FilterType.before]: {
        alias: 'until',
        description: 'Commits made before a certain time, e.g. yesterday, or 12/31/2022',
        placeholder: '"yesterday"',
    },
    [FilterType.case]: {
        description: 'Treat the search pattern as case-sensitive.',
        discreteValues: () => ['yes', 'no'].map(value => ({ label: value })),
        default: 'no',
        singular: true,
    },
    [FilterType.committer]: {
        description: (negated) => `${negated ? 'Exclude' : 'Include only'} commits and diffs committed by a user.`,
        placeholder: '"author name/email"',
        negatable: true,
        singular: true,
    },
    [FilterType.content]: {
        description: (negated) => `${negated ? 'Exclude' : 'Include only'} results from files if their content matches the search pattern.`,
        placeholder: 'pattern',
        negatable: true,
        singular: true,
    },
    [FilterType.context]: {
        description: 'Search only repositories within a specified context',
        singular: true,
    },
    [FilterType.count]: {
        description: 'Number of results to fetch (integer) or "all"',
        placeholder: 'number',
        singular: true,
    },
    [FilterType.file]: {
        alias: 'f',
        negatable: true,
        description: negated => `${negated ? 'Exclude' : 'Include only'} results from file paths matching the given search pattern.`,
        placeholder: 'regex',
        suggestions: 'path',
    },
    [FilterType.fork]: {
        discreteValues: () => [
            {
                label: 'yes',
                description: 'Include repository forks',
            },
            {
                label: 'only',
                description: 'Only search in repository forks',
            },
            {
                label: 'no',
                description: 'Do not search in repository forks (default)',
            },
        ],
        description: 'Include results from forked repositories.',
        singular: true,
    },
    [FilterType.lang]: {
        alias: 'l',
        discreteValues: value => languageCompletion(value).map(toCompletionItem),
        negatable: true,
        description: negated => `${negated ? 'Exclude' : 'Include only'} results from the given language`,
    },
    [FilterType.message]: {
        alias: 'm',
        negatable: true,
        description: negated => `${negated ? 'Exclude' : 'Include only'} Commits with messages matching a certain string`,
        placeholder: '"content"',
    },
    [FilterType.patterntype]: {
        discreteValues: () => {
            const patternTypes = ['keyword', 'literal', 'regexp', 'standard'];
            if (typeof window === 'undefined' || window.context?.experimentalFeatures?.structuralSearch === 'enabled') {
                patternTypes.push('structural');
            }
            return patternTypes.map(value => ({ label: value }));
        },
        description: `The pattern type (keyword, literal, regexp, standard${typeof window === 'undefined' || window.context?.experimentalFeatures?.structuralSearch === 'enabled'
            ? ', structural'
            : ''}) in use`,
        singular: true,
    },
    [FilterType.repo]: {
        alias: 'r',
        negatable: true,
        discreteValues: (_value, isSourcegraphDotCom) => [
            ...(isSourcegraphDotCom === true ? SOURCEGRAPH_DOT_COM_REPO_COMPLETION : []),
        ],
        description: negated => `${negated ? 'Exclude' : 'Include only'} results from repositories matching the given search pattern.`,
        suggestions: 'repo',
    },
    [FilterType.repohascommitafter]: {
        description: 'Filter repositories without commits after a given time. e.g. yesterday, or 12/31/2022',
        placeholder: '"time frame"',
        singular: true,
    },
    [FilterType.repohasfile]: {
        negatable: true,
        description: negated => `${negated ? 'Exclude' : 'Include only'} results from repos that contain a matching file`,
    },
    [FilterType.rev]: {
        alias: 'revision',
        description: 'Search a revision (branch, commit hash, or tag) instead of the default branch.',
        placeholder: 'branch/commit/tag',
        singular: true,
    },
    [FilterType.select]: {
        discreteValues: value => selectorCompletion(value).map(value => ({ label: value })),
        description: 'Select repo, file, symbol, content, or commit result types.',
        singular: true,
    },
    [FilterType.timeout]: {
        description: 'Duration before timeout, e.g. 30s, 1m, 2h, 3d, 4w, 5y.',
        placeholder: 'duration-value',
        singular: true,
    },
    [FilterType.type]: {
        description: 'Limit results to diffs, commits, file paths, symbols and other entities.',
        discreteValues: () => [
            {
                label: 'diff',
                description: 'Search for file changes',
            },
            {
                label: 'commit',
                description: 'Search in commit messages',
            },
            {
                label: 'symbol',
                description: 'Search for symbol names',
            },
            {
                label: 'repo',
                description: 'Search for repositories',
            },
            {
                label: 'path',
                description: 'Search for file/directory names',
            },
            {
                label: 'file',
                description: 'Search for file content',
            },
        ].sort((a, b) => a.label.localeCompare(b.label)),
    },
    [FilterType.visibility]: {
        discreteValues: () => ['any', 'private', 'public'].map(value => ({ label: value })),
        description: 'Include results from repositories with the matching visibility (private, public, any).',
        singular: true,
    },
};
export const discreteValueAliases = {
    yes: ['yes', 'y', 'Y', 'YES', 'Yes', '1', 't', 'T', 'true', 'TRUE', 'True'],
    no: ['n', 'N', 'no', 'NO', 'No', '0', 'f', 'F', 'false', 'FALSE', 'False'],
    only: ['o', 'only', 'ONLY', 'Only'],
};
/**
 * Returns the {@link FilterDefinition} for the given filterType if it exists, or `undefined` otherwise.
 */
export const resolveFilter = (filterType) => {
    filterType = filterType.toLowerCase();
    if (isAliasedFilterType(filterType)) {
        const aliasKey = filterType;
        filterType = AliasedFilterType[aliasKey];
    }
    if (isNegatedFilter(filterType)) {
        const type = resolveNegatedFilter(filterType);
        return {
            type,
            definition: FILTERS[type],
            negated: true,
        };
    }
    if (isFilterType(filterType)) {
        if (isNegatableFilter(filterType)) {
            return {
                type: filterType,
                definition: FILTERS[filterType],
                negated: false,
            };
        }
        if (FILTERS[filterType]) {
            return { type: filterType, definition: FILTERS[filterType] };
        }
    }
    for (const [type, definition] of Object.entries(FILTERS)) {
        if (definition.alias && filterType === definition.alias) {
            return {
                type: type,
                definition: definition,
            };
        }
    }
    return undefined;
};
/**
 * Checks whether a discrete value is valid for a given filter, accounting for valid aliases.
 */
const isValidDiscreteValue = (definition, input, value) => {
    if (!definition.discreteValues ||
        definition
            .discreteValues(input)
            .map(value => value.label)
            .includes(value)) {
        return true;
    }
    const validDiscreteValuesForDefinition = Object.keys(discreteValueAliases).filter(key => !definition.discreteValues ||
        definition
            .discreteValues(input)
            .map(value => value.label)
            .includes(key));
    for (const discreteValue of validDiscreteValuesForDefinition) {
        if (discreteValueAliases[discreteValue].includes(value)) {
            return true;
        }
    }
    return false;
};
/**
 * Validates a filter given its field and value.
 */
export const validateFilter = (field, value) => {
    const typeAndDefinition = resolveFilter(field);
    if (!typeAndDefinition) {
        return { valid: false, reason: 'Invalid filter type.' };
    }
    if (typeAndDefinition.type === FilterType.repo) {
        // Repo filter is made exempt from checking discrete valid values, since a valid `contain` predicate
        // has infinite valid discrete values. TODO(rvantonder): value validation should be separated to
        // account for finite discrete values and exemption of checks.
        return { valid: true };
    }
    if (typeAndDefinition.type === FilterType.file) {
        // File filter is made exempt from checking discrete valid values, since a valid `contain` predicate
        // has infinite valid discrete values. TODO(rvantonder): value validation should be separated to
        // account for finite discrete values and exemption of checks.
        return { valid: true };
    }
    if (typeAndDefinition.type === FilterType.lang) {
        // Lang filter is exempt because our discrete completion values are only a subset of all valid
        // language values, which are captured by a Go library. The backend takes care of returning an
        // alert for invalid values.
        return { valid: true };
    }
    const { definition } = typeAndDefinition;
    if (definition.discreteValues && (!value || !isValidDiscreteValue(definition, value, value.value))) {
        return {
            valid: false,
            reason: `Invalid filter value, expected one of: ${definition
                .discreteValues(value)
                .map(value => value.label)
                .join(', ')}.`,
        };
    }
    return { valid: true };
};
/**
 * Prepends a \ to spaces, taking care to skip over existing escape sequences. We apply this to
 * regexp field values like repo: and file:.
 *
 * @param value the value to escape
 */
export const escapeSpaces = (value) => {
    const escaped = [];
    let current = 0;
    while (value[current]) {
        switch (value[current]) {
            case '\\': {
                if (value[current + 1]) {
                    escaped.push('\\', value[current + 1]);
                    current = current + 2; // Continue past escaped value.
                    continue;
                }
                escaped.push('\\');
                current = current + 1;
                continue;
            }
            case ' ': {
                escaped.push('\\', ' ');
                current = current + 1;
                continue;
            }
            default: {
                escaped.push(value[current]);
                current = current + 1;
                continue;
            }
        }
    }
    return escaped.join('');
};
/**
 * Helper function to convert a string to a completion item. It quotes the
 * string as necessary.
 */
function toCompletionItem(value) {
    const item = { label: value };
    if (/\s/.test(value)) {
        item.insertText = `"${value}"`;
    }
    return item;
}
//# sourceMappingURL=filters.js.map