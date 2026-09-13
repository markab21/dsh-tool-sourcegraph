/**
 * Build-artifact guards.
 *
 * These check the *shipped* files, not the sources. A comment that a compiler
 * drops is not a change notice, and both defects below were real: a license
 * notice that vanished during emit, and a documented line count that described
 * the upstream originals rather than the delivered tree.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const DIST_VENDOR = join(ROOT, 'dist/vendor/sourcegraph-query/query')
const SRC_VENDOR = join(ROOT, 'src/vendor/sourcegraph-query/query')

/** Vendored modules that are modified from upstream and must carry a notice. */
const MODIFIED = [
  'scanner.ts',
  'parser.ts',
  'printer.ts',
  'filters.ts',
  'predicates.ts',
  'query.ts',
  'validate.ts',
  'languageFilter.ts',
  'selectFilter.ts',
]

describe('shipped vendored artifacts', () => {
  it('has been built', () => {
    expect(existsSync(DIST_VENDOR), 'run `pnpm run build` first').toBe(true)
  })

  it('keeps the Apache-2.0 §4(b) change notice in every emitted .js', () => {
    // `tsc` drops a file-leading comment when the first statement is an elided
    // type-only import, which silently stripped the notice from four modules.
    // The notice therefore sits above an emitted declaration, not at the top.
    const missing = MODIFIED.filter((name) => {
      const file = join(DIST_VENDOR, name.replace(/\.ts$/, '.js'))
      if (!existsSync(file)) return true
      return !readFileSync(file, 'utf8').includes('section 4(b)')
    })
    expect(missing, `emitted without a change notice: ${missing.join(', ')}`).toEqual([])
  })

  it('carries the notice in every modified source too', () => {
    const missing = MODIFIED.filter(
      (name) => !readFileSync(join(SRC_VENDOR, name), 'utf8').includes('section 4(b)'),
    )
    expect(missing, `source without a change notice: ${missing.join(', ')}`).toEqual([])
  })
})

describe('provenance record', () => {
  it('states a line count that matches the delivered tree', () => {
    // The earlier figure described the upstream originals before headers were
    // added. Anything a reader could diff must describe what is actually here.
    const provenance = readFileSync(join(ROOT, 'src/vendor/sourcegraph-query/PROVENANCE.md'), 'utf8')
    const claimed = provenance.match(/([\d,]+) lines total/) ?? provenance.match(/are ([\d,]+) lines/)
    expect(claimed, 'PROVENANCE.md no longer states a line total').not.toBeNull()

    const actual = readdirSync(SRC_VENDOR)
      .filter((name) => name.endsWith('.ts'))
      .reduce((sum, name) => {
        const text = readFileSync(join(SRC_VENDOR, name), 'utf8')
        // count newlines, so a trailing newline does not inflate the total
        return sum + (text.match(/\n/g)?.length ?? 0)
      }, 0)

    const stated = Number(claimed![1]!.replace(/,/g, ''))
    // Allow the document to quote either figure only if it is the real one.
    expect(stated, `PROVENANCE.md says ${stated}; the tree is ${actual}`).toBe(actual)
  })

  it('ships with the package, since shipped headers point at it', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      files: string[]
    }
    const shipsProvenance = pkg.files.some((entry) => entry.includes('PROVENANCE'))
    const headersPointAtIt = readFileSync(join(SRC_VENDOR, 'parser.ts'), 'utf8').includes(
      'PROVENANCE.md',
    )
    if (headersPointAtIt) {
      expect(shipsProvenance, 'shipped files reference PROVENANCE.md but it is not in `files`').toBe(
        true,
      )
    }
  })

  it('does not describe a directory move that upstream never had', () => {
    const provenance = readFileSync(join(ROOT, 'src/vendor/sourcegraph-query/PROVENANCE.md'), 'utf8')
    // Mentioning the path while correcting the record is fine; asserting it as
    // the place the files came from is not.
    const claimsAMove = /(moved|flattened)\s+from\s+`?query\/completions/.test(provenance)
    expect(
      claimsAMove,
      'PROVENANCE.md claims the files came from query/completions/, which upstream never had',
    ).toBe(false)
  })
})

describe('repository hygiene', () => {
  it('has no build artifact committed ahead of its source', () => {
    const status = execFileSync('git', ['status', '--porcelain', 'dist'], { cwd: ROOT })
      .toString()
      .trim()
    // dist/ is committed as the release artifact; this asserts it is *current*
    // rather than checked in stale, which is what makes a git install work.
    expect(status, 'dist/ differs from the build — run `pnpm run release`').toBe('')
  })
})
