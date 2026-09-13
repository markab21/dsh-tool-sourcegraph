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
  type?: string
  repository?: string
  repositoryID?: number
  path?: string
  pathMatches?: { start: { offset: number; line: number; column: number } }[]
  commit?: string
  branches?: string[]
  language?: string
  repoStars?: number
  repoLastFetched?: string
  description?: string
  topics?: string[]
  private?: boolean
  lineMatches?: { line: string; lineNumber: number; offsetAndLengths: [number, number][] }[]
  chunkMatches?: { content: string; contentStart: { line: number; column: number } }[]
  symbol?: string
  kind?: string
  hunks?: unknown[]
  message?: string
  authorName?: string
  authorDate?: string
  label?: string
}

/** A suggestion the server offers for narrowing the query. */
export interface RawFilter {
  value?: string
  label?: string
  count?: number
  kind?: string
}

/** Why the server could not return everything it found. */
export interface RawSkipped {
  reason?: string
  title?: string
  message?: string
  severity?: string
}

/** One warning or error event from the server. */
export interface RawAlert {
  title?: string
  description?: string
  proposedQueries?: unknown
}

/** Everything one search produced. */
export interface SearchOutcome {
  matches: RawMatch[]
  filters: RawFilter[]
  skipped: RawSkipped[]
  alerts: RawAlert[]
  /** Server-side count of every match found, which can exceed `matches.length`. */
  matchCount: number
  repositoryCount: number
  durationMs: number
  /** True when this client stopped reading early because it had enough matches. */
  truncatedByClient: boolean
}

/** One search request. */
export interface SearchRequest {
  endpoint: string
  query: string
  patternType?: string
  count?: number
  contextLines?: number
  /** Bearer token, or undefined for anonymous access. */
  token?: string
  signal?: AbortSignal
}

/** Raised when the instance refuses the request or the stream cannot be read. */
export class SourcegraphError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SourcegraphError'
  }
}

/** Trim a trailing slash so path joins are predictable. */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '')
}

/**
 * Parse one SSE block into its event name and data payload.
 *
 * @param block - the raw text between two blank lines.
 * @returns the event name and concatenated data lines, or undefined when the block carries no data.
 */
function parseBlock(block: string): { event: string; data: string } | undefined {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return undefined
  return { event, data: data.join('\n') }
}

/**
 * Run one streaming search.
 *
 * @param request - the query, instance, and optional credential.
 * @returns the matches, the server's limit explanations, and its own counts.
 * @throws SourcegraphError when the instance refuses the request.
 */
export async function searchSourcegraph(request: SearchRequest): Promise<SearchOutcome> {
  const base = normalizeEndpoint(request.endpoint)
  const url = new URL(`${base}/.api/search/stream`)
  url.searchParams.set('q', request.query)
  url.searchParams.set('v', 'V3')
  if (request.patternType !== undefined) url.searchParams.set('t', request.patternType)
  if (request.count !== undefined && request.count > 0) url.searchParams.set('display', String(request.count))
  if (request.contextLines !== undefined && request.contextLines > 0) {
    url.searchParams.set('cm', 'true')
    url.searchParams.set('cl', String(request.contextLines))
  }

  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  if (request.token !== undefined && request.token !== '') {
    headers.Authorization = `token ${request.token}`
  }

  let response: Response
  try {
    response = await fetch(url, { headers, ...(request.signal ? { signal: request.signal } : {}) })
  } catch (error) {
    throw new SourcegraphError(
      `cannot reach ${base}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const hint =
      response.status === 401 || response.status === 403
        ? ' (the instance rejected the credential; check that the configured token reference resolves)'
        : ''
    throw new SourcegraphError(
      `${base} returned HTTP ${response.status}${hint}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      response.status,
    )
  }
  if (response.body === null) throw new SourcegraphError(`${base} returned an empty response body`)

  const outcome: SearchOutcome = {
    matches: [],
    filters: [],
    skipped: [],
    alerts: [],
    matchCount: 0,
    repositoryCount: 0,
    durationMs: 0,
    truncatedByClient: false,
  }

  const limit = request.count !== undefined && request.count > 0 ? request.count : 0
  const decoder = new TextDecoder()
  let buffer = ''

  const consume = (block: string): boolean => {
    const parsed = parseBlock(block)
    if (parsed === undefined) return false
    let payload: unknown
    try {
      payload = JSON.parse(parsed.data)
    } catch {
      return false
    }
    switch (parsed.event) {
      case 'matches': {
        if (Array.isArray(payload)) {
          for (const match of payload as RawMatch[]) {
            if (outcome.matches.length >= limit && limit > 0) {
              outcome.truncatedByClient = true
              continue
            }
            outcome.matches.push(match)
          }
        }
        return false
      }
      case 'filters': {
        if (Array.isArray(payload)) {
          for (const filter of payload as RawFilter[]) {
            if (outcome.filters.length < 200) outcome.filters.push(filter)
          }
        }
        return false
      }
      case 'progress': {
        const progress = payload as {
          done?: boolean
          matchCount?: number
          repositoriesCount?: number
          durationMs?: number
          skipped?: RawSkipped[]
        }
        if (typeof progress.matchCount === 'number') outcome.matchCount = progress.matchCount
        if (typeof progress.repositoriesCount === 'number') {
          outcome.repositoryCount = progress.repositoriesCount
        }
        if (typeof progress.durationMs === 'number') outcome.durationMs = progress.durationMs
        if (Array.isArray(progress.skipped)) {
          for (const entry of progress.skipped) {
            if (!outcome.skipped.some((s) => s.reason === entry.reason)) outcome.skipped.push(entry)
          }
        }
        // Stop reading once the server is done, or once enough matches have
        // arrived to satisfy the caller's limit.
        return progress.done === true || (limit > 0 && outcome.matches.length >= limit)
      }
      case 'alert': {
        outcome.alerts.push(payload as RawAlert)
        return false
      }
      case 'done':
        return true
      default:
        return false
    }
  }

  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        if (consume(block)) {
          outcome.truncatedByClient = true
          await reader.cancel().catch(() => {})
          return outcome
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
    if (buffer.trim() !== '') {
      if (consume(buffer)) outcome.truncatedByClient = true
    }
  } finally {
    reader.releaseLock()
  }

  return outcome
}
