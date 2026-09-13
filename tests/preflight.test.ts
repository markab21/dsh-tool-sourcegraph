/**
 * Tests for the pre-flight query check.
 *
 * The point of the check is that a malformed query costs nothing. Each case here
 * is a query the instance would reject, plus the valid shapes that must pass so
 * the check does not block real work.
 */

import { describe, expect, it } from 'vitest'
import { validateQuery, toPatternType } from '../src/preflight.js'
import { SearchPatternType } from '../src/vendor/sourcegraph-query/query/pattern-type.js'

describe('validateQuery', () => {
  it('accepts the queries the tool is built for', () => {
    for (const query of [
      'repo:^github\\.com/kubernetes/kubernetes$ func Classify',
      'repo:a/b lang:go file:go.mod patternType:structural if err != nil { :[body] }',
      'bercastle type:repo',
      'select:repo repo:has.topic(mcp)',
      'call 202 555 0123',
    ]) {
      expect(validateQuery(query).ok, `rejected a valid query: ${query}`).toBe(true)
    }
  })

  it('rejects an empty query with advice', () => {
    const verdict = validateQuery('   ')
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toMatch(/empty/)
    expect(verdict.advice).toMatch(/search pattern/)
  })

  it('rejects unbalanced parentheses, which the parser catches', () => {
    const verdict = validateQuery('repo:a/b (unclosed')
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    // The reason is the parser's own words, not ours.
    expect(verdict.reason).toMatch(/parenthes/i)
    expect(verdict.advice).toMatch(/parenthes/i)
  })

  it('rejects a query with filters but nothing to search for', () => {
    const verdict = validateQuery('repo:a/b lang:go')
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toMatch(/no search pattern/)
    expect(verdict.advice).toMatch(/type:repo|select:repo/)
  })

  it('accepts a filters-only query that selects results on its own', () => {
    // `type:repo` is a filter, not a pattern, and the instance answers it.
    expect(validateQuery('bercastle type:repo').ok).toBe(true)
  })

  it('rejects a regex under patternType literal', () => {
    const verdict = validateQuery('repo:a/b /func\\s+Name/', 'literal')
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.advice).toMatch(/patternType:regexp/)
  })

  it('accepts the same regex when the pattern type matches', () => {
    expect(validateQuery('repo:a/b /func\\s+Name/', 'regexp').ok).toBe(true)
    expect(validateQuery('repo:a/b /func\\s+Name/', 'standard').ok).toBe(true)
  })

  it('does not reject a query only because the pattern type is unknown', () => {
    // An unrecognized value from a future caller must not block a good query.
    expect(validateQuery('repo:a/b func Name', 'nonsense').ok).toBe(true)
  })
})

describe('toPatternType', () => {
  it('maps every offered value to the vendored enum', () => {
    expect(toPatternType('keyword')).toBe(SearchPatternType.keyword)
    expect(toPatternType('literal')).toBe(SearchPatternType.literal)
    expect(toPatternType('standard')).toBe(SearchPatternType.standard)
    expect(toPatternType('regexp')).toBe(SearchPatternType.regexp)
    expect(toPatternType('structural')).toBe(SearchPatternType.structural)
  })

  it('returns undefined for an absent or unknown value', () => {
    expect(toPatternType(undefined)).toBeUndefined()
    expect(toPatternType('')).toBeUndefined()
    // `lucky` is a Sourcegraph-internal type the tool does not offer.
    expect(toPatternType('lucky')).toBeUndefined()
  })
})
