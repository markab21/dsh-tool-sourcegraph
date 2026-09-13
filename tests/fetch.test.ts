/**
 * Tests for the file-read module.
 *
 * The GraphQL exchange is stubbed, so these check this module's own behaviour:
 * what it sends, how it reads the response, and every failure it must name
 * distinctly. Live instance behaviour is recorded in docs/verification.md.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchSourcegraphFile, FetchError } from '../src/fetch.js'

/** A GraphQL response carrying one file. */
function fileResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    data: {
      repository: {
        defaultBranch: { abbrevName: 'main' },
        commit: { oid: 'abc123def456', file: { content: 'one\ntwo\nthree\nfour\nfive' } },
        ...overrides,
      },
    },
  })
}

/**
 * Stub fetch and capture the GraphQL body this module sent.
 *
 * @param body - the response body to return.
 * @param status - the HTTP status to return.
 * @returns the captured request bodies.
 */
function stubGraphql(body: string, status = 200): string[] {
  const sent: string[] = []
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    // The request body is JSON, so the query text arrives escaped. Decode it so
    // an assertion reads the GraphQL document this module actually built.
    const raw = String(init?.body ?? '')
    try {
      sent.push(String((JSON.parse(raw) as { query?: string }).query ?? raw))
    } catch {
      sent.push(raw)
    }
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  })
  return sent
}

const BASE = { endpoint: 'https://sg.example', repo: 'github.com/a/b', path: 'f.go' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSourcegraphFile', () => {
  it('returns the whole file with its resolved commit', async () => {
    stubGraphql(fileResponse())
    const file = await fetchSourcegraphFile(BASE)

    expect(file.content).toBe('one\ntwo\nthree\nfour\nfive')
    expect(file.commit).toBe('abc123def456')
    expect(file.defaultBranch).toBe('main')
    expect(file.startLine).toBe(1)
    expect(file.endLine).toBe(5)
    expect(file.totalLines).toBe(5)
    expect(file.truncated).toBe(false)
  })

  it('asks for HEAD when no revision is given', async () => {
    const sent = stubGraphql(fileResponse())
    await fetchSourcegraphFile(BASE)
    expect(sent[0]).toContain('commit(rev: "HEAD")')
  })

  it('sends the revision it was given', async () => {
    const sent = stubGraphql(fileResponse())
    await fetchSourcegraphFile({ ...BASE, rev: 'release-1.2' })
    expect(sent[0]).toContain('commit(rev: "release-1.2")')
  })

  it('applies an inclusive line window and marks it truncated', async () => {
    stubGraphql(fileResponse())
    const file = await fetchSourcegraphFile({ ...BASE, startLine: 2, endLine: 4 })

    expect(file.content).toBe('two\nthree\nfour')
    expect(file.startLine).toBe(2)
    expect(file.endLine).toBe(4)
    // The file has more lines than were returned.
    expect(file.truncated).toBe(true)
  })

  it('clamps an endLine past the end instead of returning blanks', async () => {
    stubGraphql(fileResponse())
    const file = await fetchSourcegraphFile({ ...BASE, startLine: 4, endLine: 99 })
    expect(file.content).toBe('four\nfive')
    expect(file.endLine).toBe(5)
  })

  it('applies a character cap and reports truncation', async () => {
    stubGraphql(fileResponse())
    const file = await fetchSourcegraphFile({ ...BASE, maxChars: 7 })
    expect(file.content).toBe('one\ntwo')
    expect(file.truncated).toBe(true)
  })

  it('escapes a quote and a backslash in the query', async () => {
    const sent = stubGraphql(fileResponse())
    await fetchSourcegraphFile({ ...BASE, repo: 'github.com/a/"b"', path: 'a\\b.go' })
    // Inside the GraphQL string literal, a quote and a backslash must each be
    // escaped, or the document is invalid and the instance rejects it.
    expect(sent[0]).toContain('name: "github.com/a/\\"b\\""')
    expect(sent[0]).toContain('path: "a\\\\b.go"')
  })

  it('refuses a value containing a control character', async () => {
    stubGraphql(fileResponse())
    await expect(fetchSourcegraphFile({ ...BASE, path: 'a\u0000b' })).rejects.toThrow(FetchError)
  })

  it('names an unindexed repository distinctly', async () => {
    stubGraphql(JSON.stringify({ data: { repository: null } }))
    await expect(fetchSourcegraphFile(BASE)).rejects.toThrow(/does not index/)
  })

  it('names an unknown revision distinctly', async () => {
    stubGraphql(JSON.stringify({ data: { repository: { commit: null } } }))
    await expect(fetchSourcegraphFile({ ...BASE, rev: 'nope' })).rejects.toThrow(/no revision/)
  })

  it('names a missing path distinctly, and advises a search', async () => {
    stubGraphql(JSON.stringify({ data: { repository: { commit: { oid: 'abc', file: null } } } }))
    const error = await fetchSourcegraphFile(BASE).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FetchError)
    expect((error as FetchError).message).toMatch(/has no file at/)
    expect((error as FetchError).advice).toMatch(/search/i)
  })

  it('reports a rejected credential with the fix', async () => {
    stubGraphql('unauthorized', 401)
    const error = await fetchSourcegraphFile(BASE).catch((e: unknown) => e)
    expect((error as Error).message).toMatch(/401/)
    expect((error as Error).message).toMatch(/credential/)
  })

  it('reports a GraphQL error rather than an empty file', async () => {
    stubGraphql(JSON.stringify({ errors: [{ message: 'cannot query field "nope"' }] }))
    await expect(fetchSourcegraphFile(BASE)).rejects.toThrow(/cannot query field/)
  })

  it('reports a non-JSON body', async () => {
    stubGraphql('<html>nope</html>')
    await expect(fetchSourcegraphFile(BASE)).rejects.toThrow(/not JSON/)
  })

  it('rejects an empty repo or path before sending anything', async () => {
    const sent = stubGraphql(fileResponse())
    await expect(fetchSourcegraphFile({ ...BASE, repo: '  ' })).rejects.toThrow(/repo argument is empty/)
    await expect(fetchSourcegraphFile({ ...BASE, path: '' })).rejects.toThrow(/path argument is empty/)
    expect(sent).toEqual([])
  })

  it('rejects a line window that cannot be served', async () => {
    stubGraphql(fileResponse())
    await expect(fetchSourcegraphFile({ ...BASE, startLine: 4, endLine: 2 })).rejects.toThrow(/after endLine/)
    await expect(fetchSourcegraphFile({ ...BASE, startLine: 99 })).rejects.toThrow(/past its end/)
    await expect(fetchSourcegraphFile({ ...BASE, startLine: 0 })).rejects.toThrow(/positive integer/)
  })

  it('sends the credential as a token header', async () => {
    const headers: Record<string, string>[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      headers.push((init?.headers ?? {}) as Record<string, string>)
      return new Response(fileResponse())
    })
    await fetchSourcegraphFile({ ...BASE, token: 'secret' })
    expect(headers[0]?.Authorization).toBe('token secret')
  })

  it('sends no authorization header without a token', async () => {
    const headers: Record<string, string>[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      headers.push((init?.headers ?? {}) as Record<string, string>)
      return new Response(fileResponse())
    })
    await fetchSourcegraphFile(BASE)
    expect(headers[0]?.Authorization).toBeUndefined()
  })

  it('normalizes a trailing slash on the endpoint', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(String(url))
      return new Response(fileResponse())
    })
    await fetchSourcegraphFile({ ...BASE, endpoint: 'https://sg.example/' })
    expect(urls[0]).toBe('https://sg.example/.api/graphql')
  })
})
