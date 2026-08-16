import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { FONT_LIST } from './registry'
import { DEFAULT_SPECIMEN } from './specimen'

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
      // The specimen's own glyphs included: the picker sets it live, so a face
      // missing one shows a fallback letterform and reads as that face. Index 0
      // is .notdef, asserted as a number — spelling the check into a string made
      // the digit '0' fail as if every face lacked it.
      for (const char of `AMWaz${DEFAULT_SPECIMEN.replace(/ /g, '')}`) {
        expect(parsed.charToGlyph(char).index, `${font.id} has no ${char}`).not.toBe(0)
      }
    }
  })
})
