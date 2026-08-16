import { describe, expect, it } from 'vitest'
import { luminance, wantsInverseInk } from './ink'
import { DEFAULT_PALETTE } from './palette'

describe('wantsInverseInk', () => {
  it('letters a dark wedge in the inverse', () => {
    expect(wantsInverseInk('#000000')).toBe(true)
    expect(wantsInverseInk('#0b0b0d')).toBe(true)
    expect(wantsInverseInk('#1a1a2e')).toBe(true)
  })

  it('leaves a light wedge the ink it had', () => {
    expect(wantsInverseInk('#ffffff')).toBe(false)
    expect(wantsInverseInk('#f2f2f2')).toBe(false)
    expect(wantsInverseInk('#f7e14a')).toBe(false)
  })

  it('leaves every wedge the palette assigns alone', () => {
    // Nothing the wheel colors itself is near the crossover, so this is the
    // guard that says the rule only ever fires on a color someone chose.
    for (const color of DEFAULT_PALETTE) expect(wantsInverseInk(color)).toBe(false)
  })

  it('reads the short form', () => {
    expect(wantsInverseInk('#000')).toBe(true)
    expect(wantsInverseInk('#fff')).toBe(false)
  })

  it('keeps the ink it had for a color it cannot read', () => {
    // Colors reach a wedge from a preset file, and CSS has more ways to write
    // one than this knows. An unreadable value is not a dark one.
    expect(wantsInverseInk(undefined)).toBe(false)
    expect(wantsInverseInk('black')).toBe(false)
    expect(wantsInverseInk('rgb(0 0 0)')).toBe(false)
    expect(wantsInverseInk('#12345')).toBe(false)
    expect(wantsInverseInk('#gggggg')).toBe(false)
  })
})

describe('luminance', () => {
  it('runs from black to white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('weights green over red over blue', () => {
    const green = luminance('#00ff00') as number
    const red = luminance('#ff0000') as number
    const blue = luminance('#0000ff') as number
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })

  it('reports nothing for a color it cannot read', () => {
    expect(luminance('darkslategray')).toBeNull()
  })
})
