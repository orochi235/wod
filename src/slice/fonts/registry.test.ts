import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import { DEFAULT_FONT_ID, FONTS, FONT_LIST, getFont, resolveFamily } from './registry'

describe('the font registry', () => {
  it('resolves a catalogue id to its family', () => {
    expect(getFont('anton')?.family).toBe('Anton')
  })

  // Ids come out of localStorage, and 'constructor' resolves through the
  // prototype chain to something that is not a face.
  it('returns null for an id it does not carry', () => {
    expect(getFont('constructor')).toBeNull()
    expect(getFont('nope')).toBeNull()
  })

  it('carries the default face', () => {
    expect(getFont(DEFAULT_FONT_ID)).not.toBeNull()
  })

  it('gives every face a unique id and a file to load', () => {
    const ids = FONT_LIST.map((font) => font.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const font of FONT_LIST) {
      expect(font.file).toBe(`/fonts/${font.id}.ttf`)
      expect(font.name).not.toBe('')
      expect(font.google).not.toBe('')
    }
  })

  it('lists exactly what the catalogue holds', () => {
    expect(FONT_LIST).toHaveLength(CATALOG.length)
    expect(Object.keys(FONTS)).toHaveLength(CATALOG.length)
  })

  // The class is what groups the picker, so a class that appears twice would
  // split into two headings of the same name.
  it('keeps each class contiguous', () => {
    const classes = FONT_LIST.map((font) => font.class)
    const runs = classes.filter((entry, i) => entry !== classes[i - 1])
    expect(new Set(runs).size).toBe(runs.length)
  })
})

describe('resolveFamily', () => {
  it("falls back to the look's face, then to the default", () => {
    expect(resolveFamily(undefined, 'rye')).toBe('Rye')
    expect(resolveFamily(undefined, undefined)).toBe(getFont(DEFAULT_FONT_ID)?.family)
  })

  it("prefers the part's own face", () => {
    expect(resolveFamily('anton', 'rye')).toBe('Anton')
  })

  // A preset written by a newer build names a face this one does not carry.
  it('falls back rather than failing on an unknown id', () => {
    expect(resolveFamily('made-up', 'rye')).toBe('Rye')
    expect(resolveFamily('made-up', 'also-made-up')).toBe(getFont(DEFAULT_FONT_ID)?.family)
  })
})
