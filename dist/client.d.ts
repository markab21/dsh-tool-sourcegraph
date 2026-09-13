/**
 * Sourcegraph streaming-search client.
 *
 * Talks to `GET {endpoint}/.api/search/stream`, which returns Server-Sent Events.
 * The stream is read incrementally and bounded: a broadcast query can return an
 * unbounded number of events, so this client stops reading once it has the
 * matches it will return rather than buffering the whole response.
 *
 * @module dsh-tool-sourcegraph/client
 */
/** A single match as the streaming API reports it. */
export interface RawMatch {
    type?: string;
    repository?: string;
    repositoryID?: number;
    path?: string;
    pathMatches?: {
        start: {
            offset: number;
            line: number;
            column: number;
        };
    }[];
    commit?: string;
    branches?: string[];
    language?: string;
    repoStars?: number;
    repoLastFetched?: string;
    description?: string;
    topics?: string[];
    private?: boolean;
    lineMatches?: {
        line: string;
        lineNumber: number;
        offsetAndLengths: [number, number][];
    }[];
    chunkMatches?: {
        content: string;
        contentStart: {
            line: number;
            column: number;
        };
    }[];
    symbol?: string;
    kind?: string;
    hunks?: unknown[];
    message?: string;
    authorName?: string;
    authorDate?: string;
    label?: string;
}
/** A suggestion the server offers for narrowing the query. */
export interface RawFilter {
    value?: string;
    label?: string;
    count?: number;
    kind?: string;
}
/** Why the server could not return everything it found. */
export interface RawSkipped {
    reason?: string;
    title?: string;
    message?: string;
    severity?: string;
}
/** One warning or error event from the server. */
export interface RawAlert {
    title?: string;
    description?: string;
    proposedQueries?: unknown;
}
/** Everything one search produced. */
export interface SearchOutcome {
    matches: RawMatch[];
    filters: RawFilter[];
    skipped: RawSkipped[];
    alerts: RawAlert[];
    /** Server-side count of every match found, which can exceed `matches.length`. */
    matchCount: number;
    repositoryCount: number;
    durationMs: number;
    /** True when this client stopped reading early because it had enough matches. */
    truncatedByClient: boolean;
}
/** One search request. */
export interface SearchRequest {
    endpoint: string;
    query: string;
    patternType?: string;
    count?: number;
    contextLines?: number;
    /**
     * Cap on the length of one matched line, in characters. The API truncates the
     * `context` field of a chunk match to this value, which keeps one very long
     * line from dominating the result.
     */
    maxLineLen?: number;
    /**
     * Cap on the number of matches the backend returns. This is distinct from
     * `count`, which stops the search once it has that many matches: `display`
     * lets the search continue and aggregate statistics while withholding further
     * matches.
     */
    display?: number;
    /** Bearer token, or undefined for anonymous access. */
    token?: string;
    signal?: AbortSignal;
}
/** Raised when the instance refuses the request or the stream cannot be read. */
export declare class SourcegraphError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
/**
 * Run one streaming search.
 *
 * @param request - the query, instance, and optional credential.
 * @returns the matches, the server's limit explanations, and its own counts.
 * @throws SourcegraphError when the instance refuses the request.
 */
export declare function searchSourcegraph(request: SearchRequest): Promise<SearchOutcome>;
