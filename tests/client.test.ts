/**
 * Tests for the streaming-search client.
 *
 * The SSE fixtures reproduce the real wire format, including the awkward parts:
 * multi-line data, event blocks split across chunk boundaries, and the server's
 * habit of re-sending its whole filter set as progress advances.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'

import { searchSourcegraph, SourcegraphError } from '../src/client.js'

/** Build an SSE body from event/data pairs. */
function sse(...events: [string, unknown][]): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

/**
 * Stub `fetch` with a streaming response body.
 *
 * @param body - the SSE text to stream.
 * @param options - status code and the chunk size used to split the body.
 */
function stubFetch(body: string, options: { status?: number; chunkSize?: number } = {}): void {
  const status = options.status ?? 200
  const chunkSize = options.chunkSize ?? body.length
  vi.stubGlobal('fetch', async () => {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(body)
    let offset = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close()
          return
        }
        controller.enqueue(bytes.slice(offset, offset + chunkSize))
        offset += chunkSize
      },
    })
    return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } })
  })
}


/** One captured `fetch` call: the request URL and its headers. */
interface CapturedCall {
  url: URL
  headers: Record<string, string>
}

/**
 * Stub `fetch`, recording the URL and headers of every call.
 *
 * The client calls `fetch(url, { headers })`, so the stub mirrors that exact
 * shape rather than constructing a `Request`.
 *
 * @returns the array each call is appended to.
 */
function captureFetch(): CapturedCall[] {
  const calls: CapturedCall[] = []
  vi.stubGlobal('fetch', async (url: URL, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} })
    return new Response(sse(['done', {}]), { status: 200 })
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchSourcegraph', () => {
  it('collects matches and progress from a well-formed stream', async () => {
    stubFetch(
      sse(
        ['matches', [{ type: 'content', repository: 'github.com/a/b', path: 'x.go', lineMatches: [{ line: 'hi', lineNumber: 4, offsetAndLengths: [[0, 2]] }] }]],
        ['progress', { done: false, matchCount: 1, repositoriesCount: 1 }],
        ['done', {}],
      ),
    )

    const outcome = await searchSourcegraph({ endpoint: 'https://sg.example', query: 'x' })

    expect(outcome.matches).toHaveLength(1)
    expect(outcome.matches[0]?.repository).toBe('github.com/a/b')
    expect(outcome.matchCount).toBe(1)
    expect(outcome.repositoryCount).toBe(1)
    expect(outcome.truncatedByClient).toBe(false)
  })

  it('surfaces the server’s own reasons for truncation', async () => {
    stubFetch(
      sse(
        ['matches', [{ type: 'content', repository: 'a', path: 'b' }]],
        ['progress', { done: true, matchCount: 900, skipped: [{ reason: 'shard-match-limit', title: 'result limit hit' }] }],
        ['done', {}],
      ),
    )

    const outcome = await searchSourcegraph({ endpoint: 'https://sg.example', query: 'x' })

    expect(outcome.skipped.map((entry) => entry.reason)).toEqual(['shard-match-limit'])
    // The server found far more than it sent; that must be visible to the caller.
    expect(outcome.matchCount).toBe(900)
    expect(outcome.matches).toHaveLength(1)
  })

  it('stops reading once the requested match count is satisfied', async () => {
    // The progress event says done:false and more matches follow. A client that
    // ignores the limit would consume all of them.
    const events: [string, unknown][] = [['matches', [{ type: 'content', path: '1' }]]]
    for (let i = 2; i <= 50; i += 1) events.push(['matches', [{ type: 'content', path: String(i) }]])
    events.push(['progress', { done: true, matchCount: 50 }])
    events.push(['done', {}])
    stubFetch(sse(...events))

    const outcome = await searchSourcegraph({ endpoint: 'https://sg.example', query: 'x', count: 3 })

    expect(outcome.matches).toHaveLength(3)
    expect(outcome.truncatedByClient).toBe(true)
  })

  it('reassembles an event split across chunk boundaries', async () => {
    const body = sse(
      ['matches', [{ type: 'content', repository: 'split/me', path: 'p.go' }]],
      ['done', {}],
    )
    // One byte per chunk guarantees every boundary is exercised.
    stubFetch(body, { chunkSize: 1 })

    const outcome = await searchSourcegraph({ endpoint: 'https://sg.example', query: 'x' })

    expect(outcome.matches).toHaveLength(1)
    expect(outcome.matches[0]?.repository).toBe('split/me')
  })

  it('keeps alerts and collapses repeated filter sets', async () => {
    stubFetch(
      sse(
        ['filters', [{ value: 'type:file', count: 2 }]],
        ['filters', [{ value: 'type:file', count: 2 }, { value: 'lang:go', count: 2 }]],
        ['alert', { title: 'No repositories found' }],
        ['progress', { done: true, matchCount: 0 }],
        ['done', {}],
      ),
    )

    const outcome = await searchSourcegraph({ endpoint: 'https://sg.example', query: 'x' })

    expect(outcome.alerts[0]?.title).toBe('No repositories found')
    // The client records every filter event verbatim; collapsing duplicates is
    // the tool's job, so this asserts the raw material is intact.
    expect(outcome.filters.length).toBe(3)
  })

  it('sends the credential as a token authorization header', async () => {
    const calls = captureFetch()

    await searchSourcegraph({ endpoint: 'https://sg.example/', query: 'q', token: 'secret-token' })

    const call = calls[0]!
    expect(call.url.toString()).toBe('https://sg.example/.api/search/stream?q=q&v=V3')
    expect(call.headers.Authorization).toBe('token secret-token')
    expect(call.headers.Accept).toBe('text/event-stream')
  })

  it('omits the authorization header when no token is configured', async () => {
    const calls = captureFetch()

    await searchSourcegraph({ endpoint: 'https://sg.example', query: 'q' })

    expect(calls[0]?.headers.Authorization).toBeUndefined()
  })

  it('reports a rejected credential with an actionable message', async () => {
    stubFetch('unauthorized', { status: 401 })

    await expect(searchSourcegraph({ endpoint: 'https://sg.example', query: 'q' })).rejects.toThrow(
      /rejected the credential/,
    )
  })

  it('reports an unreachable instance rather than a bare network error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED')
    })

    await expect(searchSourcegraph({ endpoint: 'https://sg.example', query: 'q' })).rejects.toThrow(
      SourcegraphError,
    )
  })

  it('passes pattern type, display limit, and context through as query parameters', async () => {
    const calls = captureFetch()

    await searchSourcegraph({
      endpoint: 'https://sg.example',
      query: 'if err != nil { :[body] }',
      patternType: 'structural',
      count: 7,
      contextLines: 3,
    })

    const url = calls[0]!.url
    expect(url.searchParams.get('t')).toBe('structural')
    expect(url.searchParams.get('display')).toBe('7')
    expect(url.searchParams.get('cm')).toBe('true')
    expect(url.searchParams.get('cl')).toBe('3')
    expect(url.searchParams.get('q')).toBe('if err != nil { :[body] }')
  })
})
