/*
 * VENDORED — modified from the upstream file of the same name.
 *
 * Upstream: sourcegraph/sourcegraph-public-snapshot @ c864f15
 *           client/shared/src/search/query/printer.ts
 * Changed:  import specifiers rewritten.
 *
 * Apache-2.0 section 4(b) notice. See ../PROVENANCE.md for the full list
 * of modifications and the license terms this file is used under.
 */
import type { Token } from './token.js'

/**
 * stringHuman creates a valid query string from a scanned query formatted for human
 * readability. It should be used in contexts where modified query tokens must be
 * converted back to human readable form (e.g., for query suggestions).
 */
export const stringHuman = (tokens: Token[]): string => {
    const result: string[] = []
    for (const token of tokens) {
        switch (token.type) {
            case 'whitespace': {
                result.push(' ')
                break
            }
            case 'openingParen': {
                result.push('(')
                break
            }
            case 'closingParen': {
                result.push(')')
                break
            }
            case 'filter': {
                let value = ''
                if (token.value) {
                    if (token.value.quoted) {
                        value = JSON.stringify(token.value.value)
                    } else {
                        value = token.value.value
                    }
                }
                result.push(`${token.field.value}:${value}`)
                break
            }
            case 'literal': {
                if (token.quoted) {
                    result.push(JSON.stringify(token.value))
                } else {
                    result.push(token.value)
                }
                break
            }
            case 'pattern': {
                if (token.delimited) {
                    result.push(`/${token.value}/`)
                } else {
                    result.push(token.value)
                }
                break
            }
            case 'keyword':
            case 'comment': {
                result.push(token.value)
                break
            }
        }
    }
    return result.join('')
}
