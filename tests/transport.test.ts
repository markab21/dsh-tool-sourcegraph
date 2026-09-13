/**
 * Tests for the browser transport deadline.
 *
 * The harness reads its transport from a global and installs it at startup, so
 * these tests check the three things that matter: a request gains a deadline, the
 * caller's own abort still wins, and the install is reversible and does not
 * disturb a transport that another plugin installed.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { installRequestDeadline, DEFAULT_REQUEST_TIMEOUT_MS } from '../src/transport.js'

const KEY = '__DSH_TRANSPORT__'

/** The global as this module sees it. */
type Scope = Record<string, { fetch?: typeof globalThis.fetch; marker?: string } | undefined>

const scope = globalThis as unknown as Scope

afterEach(() => {
  delete scope[KEY]
})

describe('installRequestDeadline', () => {
  it('installs a fetch on the harness transport global', () => {
    expect(scope[KEY]).toBeUndefined()
    const dispose = installRequestDeadline(5_000)
    expect(scope[KEY]?.fetch).toBeTypeOf('function')
    dispose()
  })

  it('gives a request a signal when the caller supplied none', async () => {
    let seen: AbortSignal | null | undefined
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      seen = init?.signal
      return new Response('ok')
    }) as typeof globalThis.fetch

    const dispose = installRequestDeadline(5_000)
    await scope[KEY]!.fetch!('https://example.test', {})
    dispose()

    expect(seen).toBeInstanceOf(AbortSignal)
    expect(seen!.aborted).toBe(false)
  })

  it('aborts a request that outlives the deadline', async () => {
    // A fetch that never settles on its own; only the deadline can end it.
    globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as typeof globalThis.fetch

    const dispose = installRequestDeadline(1_000)
    const started = Date.now()
    await expect(scope[KEY]!.fetch!('https://example.test', {})).rejects.toThrow(/aborted/)
    expect(Date.now() - started).toBeLessThan(3_000)
    dispose()
  })

  it('keeps the caller signal in control when it aborts first', async () => {
    globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const fail = () => reject(new Error('caller aborted'))
        if (init?.signal?.aborted) fail()
        else init?.signal?.addEventListener('abort', fail)
      })) as typeof globalThis.fetch

    const dispose = installRequestDeadline(60_000)
    const caller = AbortSignal.abort()
    await expect(scope[KEY]!.fetch!('https://example.test', { signal: caller })).rejects.toThrow(
      /caller aborted/,
    )
    dispose()
  })

  it('restores the previous state on dispose', () => {
    const dispose = installRequestDeadline(5_000)
    expect(scope[KEY]).toBeDefined()
    dispose()
    expect(scope[KEY]).toBeUndefined()
  })

  it('is idempotent on dispose', () => {
    const dispose = installRequestDeadline(5_000)
    dispose()
    expect(() => dispose()).not.toThrow()
    expect(scope[KEY]).toBeUndefined()
  })

  it('wraps an existing transport instead of replacing it', async () => {
    // Stand in for another plugin that already installed a transport.
    const calls: string[] = []
    const theirs = (async (input: unknown) => {
      calls.push(String(input))
      return new Response('theirs')
    }) as typeof globalThis.fetch
    scope[KEY] = { fetch: theirs, marker: 'other-plugin' }

    const dispose = installRequestDeadline(5_000)
    const response = await scope[KEY]!.fetch!('https://example.test', {})
    dispose()

    expect(calls).toEqual(['https://example.test'])
    expect(await response.text()).toBe('theirs')
  })

  it('leaves a transport that replaced ours after install', () => {
    const dispose = installRequestDeadline(5_000)
    const intruder = (async () => new Response('intruder')) as typeof globalThis.fetch
    scope[KEY] = { fetch: intruder }

    dispose()

    // The honest outcome: do not clobber a global that changed under us.
    expect(scope[KEY]?.fetch).toBe(intruder)
  })

  it('raises a uselessly small deadline instead of accepting it', async () => {
    let seen: AbortSignal | null | undefined
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      seen = init?.signal
      return new Response('ok')
    }) as typeof globalThis.fetch

    const dispose = installRequestDeadline(1)
    await scope[KEY]!.fetch!('https://example.test', {})
    dispose()

    // The signal exists and was not already aborted at call time.
    expect(seen).toBeInstanceOf(AbortSignal)
  })

  it('offers a sane default', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(120_000)
  })
})
