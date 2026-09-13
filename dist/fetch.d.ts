/**
 * Read a file from a repository the instance indexes.
 *
 * Sourcegraph holds code that is not on this machine, and the search tool can
 * only show the lines that matched. This module retrieves a whole file, or a
 * range of lines, at a revision.
 *
 * One GraphQL call answers the whole request. Verified against the instance:
 *
 * ```graphql
 * { repository(name: "github.com/owner/name") {
 *     defaultBranch { abbrevName }
 *     commit(rev: "HEAD") { oid file(path: "go.mod") { content } } } }
 * ```
 *
 * The response carries the default branch name, the resolved commit object id,
 * and the content together, so a caller learns which revision the content came
 * from without a second round trip. A path that does not exist returns
 * `file: null` rather than an error, and a repository the instance does not
 * index returns `repository: null`. Both are reported as distinct failures here,
 * because "the instance does not have this repository" and "the repository does
 * not have this file" need different corrections.
 *
 * @module dsh-tool-sourcegraph/fetch
 */
/** Raised when the instance refuses the request or the query cannot be served. */
export declare class FetchError extends Error {
    /** What the caller should change, when the cause is known. */
    readonly advice?: string | undefined;
    constructor(message: string, 
    /** What the caller should change, when the cause is known. */
    advice?: string | undefined);
}
/** One file read. */
export interface FetchedFile {
    /** The repository, as the instance names it. */
    readonly repo: string;
    /** The path that was read. */
    readonly path: string;
    /** The revision the content came from, resolved to a commit object id. */
    readonly commit: string;
    /** The default branch of the repository, which `HEAD` resolves to. */
    readonly defaultBranch?: string;
    /** The file text, after any line window was applied. */
    readonly content: string;
    /** The first line number of `content`, counting from 1. */
    readonly startLine: number;
    /** The last line number of `content`, counting from 1. */
    readonly endLine: number;
    /** The number of lines in the whole file. */
    readonly totalLines: number;
    /** True when a line window or a character cap removed part of the file. */
    readonly truncated: boolean;
}
/** One request for a file. */
export interface FetchRequest {
    /** Instance base URL, without the `/api` path. */
    readonly endpoint: string;
    /** Repository name in the form `host/owner/name`. */
    readonly repo: string;
    /** Path within the repository. */
    readonly path: string;
    /** Commit or branch; `HEAD` when omitted. */
    readonly rev?: string;
    /** First line to return, counting from 1. */
    readonly startLine?: number;
    /** Last line to return, counting from 1. */
    readonly endLine?: number;
    /** Cap on returned characters, applied after the line window. */
    readonly maxChars?: number;
    /** Bearer token, or undefined for anonymous access. */
    readonly token?: string;
    readonly signal?: AbortSignal;
}
/**
 * Read a file, or a range of lines from it.
 *
 * @param request - the repository, path, revision, and optional window.
 * @returns the content, the resolved commit, and the line range.
 * @throws FetchError when the instance, the repository, or the path cannot serve
 *   the request.
 */
export declare function fetchSourcegraphFile(request: FetchRequest): Promise<FetchedFile>;
