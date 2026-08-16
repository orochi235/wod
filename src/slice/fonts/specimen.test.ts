import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPECIMEN, specimenText } from './specimen'

const setHash = (hash: string) => {
  window.location.hash = hash
}

afterEach(() => setHash(''))

describe('specimenText', () => {
  it('falls back to the built-in with nothing asked for', () => {
    expect(specimenText()).toBe(DEFAULT_SPECIMEN)
  })

  it('takes an explicit override ahead of everything', () => {
    setHash('#/edit?specimen=from%20the%20url')
    expect(specimenText('from the caller')).toBe('from the caller')
  })

  it('reads the hash query when the caller names nothing', () => {
    setHash('#/edit?specimen=Ana%20Whitekust')
    expect(specimenText()).toBe('Ana Whitekust')
  })

  it('keeps the built-in for an empty override or an empty param', () => {
    setHash('#/edit?specimen=')
    expect(specimenText()).toBe(DEFAULT_SPECIMEN)
    expect(specimenText('')).toBe(DEFAULT_SPECIMEN)
  })

  it('ignores a hash carrying no query at all', () => {
    setHash('#/slice')
    expect(specimenText()).toBe(DEFAULT_SPECIMEN)
  })

  // Every glyph earns its place, which is what keeps the picker readable at a
  // glance rather than a jumble.
  it('repeats no glyph in the built-in', () => {
    const glyphs = [...DEFAULT_SPECIMEN.replace(/ /g, '')]
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })
})
