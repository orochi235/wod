import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FONT_LIST } from '../slice/fonts/registry'
import css from './fonts.css?raw'

describe('fonts.css', () => {
  // The registry names a family the measurer measures in and the label is
  // painted in. A face with no rule here measures as the fallback and paints as
  // the fallback, which is a silently wrong size on every wedge that names it.
  it('declares every face the registry carries', () => {
    for (const font of FONT_LIST) {
      expect(css).toContain(`font-family: "${font.family}";`)
      expect(css).toContain(`src: url("${font.file}")`)
    }
  })

  it('serves them from the app rather than from a CDN', () => {
    expect(css).not.toContain('fonts.gstatic.com')
    expect(css).not.toContain('fonts.googleapis.com')
  })

  // Outline mode fetches these same files and parses them, so a rule naming a
  // file nobody downloaded is a face that paints as the fallback and warps into
  // nothing. `node scripts/fonts.mjs` is what fixes it.
  it('ships the binary each rule names', () => {
    for (const font of FONT_LIST) {
      expect(existsSync(`public${font.file}`)).toBe(true)
      expect(existsSync(`public/fonts/licenses/${font.id}.txt`)).toBe(true)
    }
  })
})
