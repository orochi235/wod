import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { FONT_LIST } from './registry'
import { SPECIMENS, SPECIMEN_HEIGHT } from './specimens'

describe('specimens', () => {
  // The picker draws one per row, so a missing entry is a blank row rather than
  // an error. `node scripts/specimens.mjs` is what fixes it.
  it('bakes one for every face in the catalogue', () => {
    for (const font of FONT_LIST) {
      expect(SPECIMENS[font.id]?.d.startsWith('M')).toBe(true)
      expect(SPECIMENS[font.id]?.width).toBeGreaterThan(0)
    }
    expect(Object.keys(SPECIMENS)).toHaveLength(FONT_LIST.length)
  })

  // On the ink, not on a declared cap height — Rye's is four times off, and a
  // specimen that trusted it baked four times the size of its neighbours.
  it('normalises every one to the same height', () => {
    for (const font of FONT_LIST) {
      expect(SPECIMENS[font.id].height).toBeCloseTo(SPECIMEN_HEIGHT, 1)
    }
  })
})

describe('the faces this app ships', () => {
  // Outline mode parses these same binaries at runtime. A face that will not
  // parse, or one missing the letters a roster is made of, silently draws in
  // glyph mode forever — which looks like nothing being wrong.
  it('parses, and carries the alphabet a roster is written in', () => {
    for (const font of FONT_LIST) {
      const bytes = readFileSync(`public${font.file}`)
      const parsed = opentype.parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      )

      expect(parsed.unitsPerEm).toBeGreaterThan(0)
      for (const char of 'AMWaz') {
        expect(`${font.id} ${char} ${parsed.charToGlyph(char).index}`).not.toContain(' 0')
      }
    }
  })
})
