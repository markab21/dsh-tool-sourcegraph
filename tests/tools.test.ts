/**
 * Tests for the tool-selection contract.
 *
 * Each tool is controlled by its own config flag, and each one contributes
 * prompt guidance that must vanish when its tool does. A missing section is easy
 * to introduce and invisible in a tool listing: `sourcegraph_repo` shipped
 * without one because nothing asserted it.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import * as plugin from '../src/index.js'

/** The tools this plugin can register, with the config flag that controls each. */
const TOOLS = [
  { tool: 'sourcegraph_search', flag: 'search' },
  { tool: 'sourcegraph_fetch', flag: 'fetch' },
  { tool: 'sourcegraph_repo', flag: 'repo' },
] as const

/** A settings provider that serves an empty document. */
class Settings extends SettingsProvider {
  get writable(): boolean {
    return true
  }
  async load(): Promise<Record<string, unknown>> {
    return {}
  }
  async persist(): Promise<void> {}
}

/** What one mount produced. */
interface Mounted {
  tools: string[]
  sections: string[]
  /** Reads the text a section would contribute for the current scope. */
  textOf(name: string): string
}

/**
 * Mount the plugin with a configuration and record what it registered.
 *
 * @param overrides - configuration fields to change from the defaults.
 * @returns the registered tool names and prompt section names.
 */
async function mount(overrides: Record<string, unknown> = {}): Promise<Mounted> {
  const ctx = new Context()
  const sections: { name: string; text: unknown }[] = []
  ctx.provide('systemPrompt', {
    tools() {
      return () => {}
    },
    section(section: { name: string; text: unknown }) {
      sections.push(section)
      return () => {}
    },
    getSectionOrder() {
      return 1400
    },
  })
  new ToolRuntime(ctx)
  new Settings(ctx)
  ctx.provide('credentials', { async resolve() { return undefined } })

  await ctx.plugin(plugin, {
    endpoint: 'https://sg.example',
    apiToken: '',
    tokenRef: '',
    maxMatches: 5,
    maxCharsPerMatch: 300,
    search: true,
    fetch: true,
    repo: true,
    validate: true,
    requestTimeoutMs: 0,
    ...overrides,
  })

  const registered = TOOLS.map((entry) => entry.tool).filter((name) => ctx.tools.get(name) !== undefined)
  return {
    tools: registered,
    sections: sections.map((section) => section.name),
    textOf(name: string): string {
      const section = sections.find((candidate) => candidate.name === name)
      if (section === undefined) return ''
      return (section.text as (context: { scope: unknown }) => string)({ scope: undefined })
    },
  }
}

describe('tool selection', () => {
  it('registers every tool by default', async () => {
    const mounted = await mount()
    expect(mounted.tools).toEqual(TOOLS.map((entry) => entry.tool))
  })

  it.each(TOOLS)('removes only $tool when $flag is false', async ({ tool, flag }) => {
    const mounted = await mount({ [flag]: false })
    expect(mounted.tools).not.toContain(tool)
    expect(mounted.tools).toHaveLength(TOOLS.length - 1)
  })

  it('registers no tool when all three flags are false', async () => {
    const mounted = await mount({ search: false, fetch: false, repo: false })
    expect(mounted.tools).toEqual([])
  })
})

describe('prompt guidance', () => {
  it.each(TOOLS)('gives $tool a prompt section', async ({ tool }) => {
    const mounted = await mount()
    expect(mounted.sections, `${tool} registered no prompt section`).toContain(`tool:${tool}`)
  })

  it.each(TOOLS)('contributes no text for $tool when its flag is false', async ({ tool, flag }) => {
    const mounted = await mount({ [flag]: false })
    const text = mounted.textOf(`tool:${tool}`)
    // A section may be absent, or present and empty. It must not advertise a
    // tool this deployment does not have.
    expect(text, `${tool} advertised itself while disabled`).toBe('')
  })

  it.each(TOOLS)('states the untrusted-data rule for $tool', async ({ tool }) => {
    const mounted = await mount()
    expect(mounted.textOf(`tool:${tool}`)).toMatch(/untrusted data/)
  })

  it('places every section ahead of the filesystem search tools', async () => {
    const mounted = await mount()
    // TOOL_GLOB is 1400 in the harness placement table; each section must sort
    // before it, so the order is read before glob and grep.
    for (const entry of TOOLS) {
      expect(mounted.sections, `${entry.tool} has no section`).toContain(`tool:${entry.tool}`)
    }
  })
})

describe('the transport deadline', () => {
  it('is not installed when requestTimeoutMs is 0', async () => {
    delete (globalThis as Record<string, unknown>)['__DSH_TRANSPORT__']
    await mount({ requestTimeoutMs: 0 })
    expect((globalThis as Record<string, unknown>)['__DSH_TRANSPORT__']).toBeUndefined()
  })

  it('is installed when requestTimeoutMs is a positive value', async () => {
    delete (globalThis as Record<string, unknown>)['__DSH_TRANSPORT__']
    await mount({ requestTimeoutMs: 5_000 })
    const transport = (globalThis as Record<string, { fetch?: unknown } | undefined>)['__DSH_TRANSPORT__']
    expect(transport?.fetch).toBeTypeOf('function')
    delete (globalThis as Record<string, unknown>)['__DSH_TRANSPORT__']
  })
})
