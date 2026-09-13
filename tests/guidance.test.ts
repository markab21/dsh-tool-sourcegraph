/**
 * Tests for the guidance the plugin gives the model.
 *
 * A tool description competes with `glob` and `grep` for the same task, so the
 * order has to be stated in two places: the description the model reads, and the
 * system-prompt section placed ahead of the filesystem tools. These tests fail if
 * either one loses the instruction.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import * as plugin from '../src/index.js'

const ROOT = new URL('..', import.meta.url).pathname
const SOURCE = readFileSync(join_(ROOT, 'src/index.ts'), 'utf8')

/** Join path segments without importing `node:path` for one call. */
function join_(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/')
}

/** A settings provider that serves an empty document. */
class NullSettings extends SettingsProvider {
  /** This provider accepts writes, as the local file provider does. */
  get writable(): boolean {
    return true
  }
  async load(): Promise<Record<string, unknown>> {
    return {}
  }
  async persist(): Promise<void> {}
}

/** Build a context with the four services the plugin declares. */
function makeContext(): { ctx: Context; sections: { name: string; order: number; text: unknown }[] } {
  const ctx = new Context()
  const sections: { name: string; order: number; text: unknown }[] = []

  ctx.provide('systemPrompt', {
    // ToolRuntime wires registered tool schemas into prompt assembly, so it
    // calls `tools()`; this returns a disposer and records nothing.
    tools() {
      return () => {}
    },
    section(section: { name: string; order: number; text: unknown }) {
      sections.push(section)
      return () => {}
    },
    getSectionOrder(name: string) {
      // The table the harness uses; TOOL_GLOB is the position we anchor against.
      return { TOOL_GLOB: 1400, TOOL_GREP: 1500, TOOL_WEB_SEARCH: 2000 }[name] ?? 0
    },
  })
  new ToolRuntime(ctx)
  ctx.provide('credentials', { async resolve() { return undefined } })
  new NullSettings(ctx)
  return { ctx, sections }
}

describe('tool guidance', () => {
  it('says to try Sourcegraph before scanning the filesystem', () => {
    const description = SOURCE.slice(SOURCE.indexOf("name: 'sourcegraph_search'"))
    const head = description.slice(0, 1200)
    expect(head).toMatch(/Try this tool first/)
    expect(head).toMatch(/before glob or grep/)
    // and it must still say when NOT to use it
    expect(head).toMatch(/Use glob when you know the path/)
  })

  it('declares the services it reads, including systemPrompt', () => {
    expect(plugin.inject).toContain('systemPrompt')
    expect(plugin.inject).toContain('tools')
  })

  it('places its prompt section ahead of the filesystem search tools', async () => {
    const { ctx, sections } = makeContext()
    await ctx.plugin(plugin, {
      endpoint: 'https://sg.example',
      apiToken: '',
      tokenRef: '',
      maxMatches: 10,
      maxCharsPerMatch: 300,
      search: true,
      fetch: true,
      repo: true,
      validate: true,
      requestTimeoutMs: 30_000,
    })

    const section = sections.find((s) => s.name === 'tool:sourcegraph_search')
    expect(section, 'no prompt section was registered').toBeDefined()
    // TOOL_GLOB is 1400; the guidance must sort before it.
    expect(section!.order).toBeLessThan(1400)

    const text = (section!.text as (c: { scope: unknown }) => string)({ scope: undefined })
    expect(text).toMatch(/Try sourcegraph_search first/)
    expect(text).toMatch(/grep when you want the working directory only/)
    expect(text).toMatch(/untrusted data/)
  })

  it('contributes no guidance when the tool is disabled', async () => {
    const { ctx, sections } = makeContext()
    await ctx.plugin(plugin, {
      endpoint: 'https://sg.example',
      apiToken: '',
      tokenRef: '',
      maxMatches: 10,
      maxCharsPerMatch: 300,
      search: false,
      fetch: true,
      repo: true,
      validate: true,
      requestTimeoutMs: 30_000,
    })

    const section = sections.find((s) => s.name === 'tool:sourcegraph_search')
    if (section !== undefined) {
      const text = (section.text as (c: { scope: unknown }) => string)({ scope: undefined })
      expect(text, 'a disabled tool must not advertise itself').toBe('')
    }
    expect(ctx.tools.get('sourcegraph_search')).toBeUndefined()
  })
})
