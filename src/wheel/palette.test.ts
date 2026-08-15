import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, paletteColor } from './palette'

describe('paletteColor', () => {
  it('returns the swatch at the index', () => {
    expect(paletteColor(0)).toBe(DEFAULT_PALETTE[0])
  })

  it('wraps past the end of the palette', () => {
    expect(paletteColor(DEFAULT_PALETTE.length)).toBe(DEFAULT_PALETTE[0])
  })
})
