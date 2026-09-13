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
export class FetchError extends Error {
  constructor(
    message: string,
    /** What the caller should change, when the cause is known. */
    readonly advice?: string,
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

/** One file read. */
export interface FetchedFile {
  /** The repository, as the instance names it. */
  readonly repo: string
  /** The path that was read. */
  readonly path: string
  /** The revision the content came from, resolved to a commit object id. */
  readonly commit: string
  /** The default branch of the repository, which `HEAD` resolves to. */
  readonly defaultBranch?: string
  /** The file text, after any line window was applied. */
  readonly content: string
  /** The first line number of `content`, counting from 1. */
  readonly startLine: number
  /** The last line number of `content`, counting from 1. */
  readonly endLine: number
  /** The number of lines in the whole file. */
  readonly totalLines: number
  /** True when a line window or a character cap removed part of the file. */
  readonly truncated: boolean
}

/** One request for a file. */
export interface FetchRequest {
  /** Instance base URL, without the `/api` path. */
  readonly endpoint: string
  /** Repository name in the form `host/owner/name`. */
  readonly repo: string
  /** Path within the repository. */
  readonly path: string
  /** Commit or branch; `HEAD` when omitted. */
  readonly rev?: string
  /** First line to return, counting from 1. */
  readonly startLine?: number
  /** Last line to return, counting from 1. */
  readonly endLine?: number
  /** Cap on returned characters, applied after the line window. */
  readonly maxChars?: number
  /** Bearer token, or undefined for anonymous access. */
  readonly token?: string
  readonly signal?: AbortSignal
}

/** The GraphQL response shape this module reads. */
interface FileQueryResponse {
  data?: {
    repository?: {
      defaultBranch?: { abbrevName?: string } | null
      commit?: { oid?: string; file?: { content?: string } | null } | null
    } | null
  }
  errors?: { message?: string }[]
}

/** Remove a trailing slash so path joins are predictable. */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '')
}

/**
 * Escape a value for inclusion in a GraphQL string literal.
 *
 * The values are a repository name, a path, and a revision. None of them is
 * trusted: they arrive from a model. GraphQL string literals accept a small set
 * of escapes, so backslash and double quote are escaped and a control character
 * is refused outright rather than smuggled through.
 *
 * @param value - the raw value.
 * @param field - the field name, for the error message.
 * @returns the escaped value, without surrounding quotes.
 * @throws FetchError when the value contains a control character.
 */
function quote(value: string, field: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new FetchError(`the ${field} contains a control character`)
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Read a file, or a range of lines from it.
 *
 * @param request - the repository, path, revision, and optional window.
 * @returns the content, the resolved commit, and the line range.
 * @throws FetchError when the instance, the repository, or the path cannot serve
 *   the request.
 */
export async function fetchSourcegraphFile(request: FetchRequest): Promise<FetchedFile> {
  const base = normalizeEndpoint(request.endpoint)
  const repo = request.repo.trim()
  const path = request.path.trim()
  if (repo === '') throw new FetchError('the repo argument is empty')
  if (path === '') throw new FetchError('the path argument is empty')

  const rev = request.rev === undefined || request.rev.trim() === '' ? 'HEAD' : request.rev.trim()
  const query =
    `{ repository(name: "${quote(repo, 'repo')}") { defaultBranch { abbrevName } ` +
    `commit(rev: "${quote(rev, 'rev')}") { oid file(path: "${quote(path, 'path')}") { content } } } }`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (request.token !== undefined && request.token !== '') {
    headers.Authorization = `token ${request.token}`
  }

  let response: Response
  try {
    response = await fetch(`${base}/.api/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      ...(request.signal ? { signal: request.signal } : {}),
    })
  } catch (error) {
    throw new FetchError(
      `cannot reach ${base}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const hint =
      response.status === 401 || response.status === 403
        ? ' The instance rejected the credential; check that the configured token resolves.'
        : ''
    throw new FetchError(
      `${base} returned HTTP ${response.status}.${hint}${detail ? ` ${detail.slice(0, 200)}` : ''}`,
    )
  }

  let payload: FileQueryResponse
  try {
    payload = (await response.json()) as FileQueryResponse
  } catch (error) {
    throw new FetchError(
      `${base} returned a response that is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (payload.errors !== undefined && payload.errors.length > 0) {
    const first = payload.errors[0]?.message ?? 'unknown error'
    throw new FetchError(`${base} reported a GraphQL error: ${first}`)
  }

  const repository = payload.data?.repository
  if (repository === null || repository === undefined) {
    throw new FetchError(
      `the instance does not index ${repo}`,
      'Check the repository name, and note that the instance must have it indexed. Use sourcegraph_search with a type:repo query to list what is available.',
    )
  }

  const commit = repository.commit
  if (commit === null || commit === undefined || commit.oid === undefined) {
    throw new FetchError(
      `the instance has no revision "${rev}" for ${repo}`,
      'Use a commit, a branch name the repository has, or omit rev to read the default branch.',
    )
  }

  const file = commit.file
  if (file === null || file === undefined || typeof file.content !== 'string') {
    throw new FetchError(
      `${repo} has no file at "${path}" in ${commit.oid.slice(0, 12)}`,
      'Check the path. A search for the file name, or for a string inside it, shows the paths the instance has.',
    )
  }

  const allLines = file.content.split('\n')
  const totalLines = allLines.length

  // A window is inclusive at both ends, and a request outside the file is a
  // mistake worth naming rather than silently returning nothing.
  const from = request.startLine ?? 1
  const to = request.endLine ?? totalLines
  if (!Number.isInteger(from) || from < 1) {
    throw new FetchError(`startLine must be a positive integer, got ${String(request.startLine)}`)
  }
  if (!Number.isInteger(to) || to < 1) {
    throw new FetchError(`endLine must be a positive integer, got ${String(request.endLine)}`)
  }
  // Order matters: a startLine past the end is a clearer diagnosis than
  // "startLine is after endLine", which is what a defaulted endLine would say.
  if (from > totalLines) {
    throw new FetchError(
      `the file has ${totalLines} lines, so line ${from} is past its end`,
      `Read a line between 1 and ${totalLines}, or omit startLine.`,
    )
  }
  if (from > to) {
    throw new FetchError(`startLine ${from} is after endLine ${to}`)
  }

  const lastRequested = Math.min(to, totalLines)
  let content = allLines.slice(from - 1, lastRequested).join('\n')
  let truncated = from > 1 || lastRequested < totalLines

  const maxChars = request.maxChars
  if (maxChars !== undefined && maxChars > 0 && content.length > maxChars) {
    content = content.slice(0, maxChars)
    truncated = true
  }

  return {
    repo,
    path,
    commit: commit.oid,
    ...(repository.defaultBranch?.abbrevName !== undefined
      ? { defaultBranch: repository.defaultBranch.abbrevName }
      : {}),
    content,
    startLine: from,
    endLine: lastRequested,
    totalLines,
    truncated,
  }
}
