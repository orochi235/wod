import { describe, expect, it } from 'vitest'
import { hexNumber, hexString, parseHex } from './hex'

describe('parseHex', () => {
  it('expands shorthand hex', () => {
    expect(parseHex('#f00')).toEqual([255, 0, 0])
  })

  it('reads six-digit hex', () => {
    expect(parseHex('#00ff80')).toEqual([0, 255, 128])
  })

  it('refuses a named color', () => {
    expect(parseHex('rebeccapurple')).toBeNull()
  })
})

describe('hexNumber and hexString', () => {
  it('round-trip a color through the number blits blends', () => {
    expect(hexNumber('#FFD166')).toBe(0xffd166)
    expect(hexString(0xffd166)).toBe('#ffd166')
    expect(hexString(0x0000ff)).toBe('#0000ff')
  })

  it('has no number for a color it cannot read', () => {
    expect(hexNumber('red')).toBeUndefined()
    expect(hexNumber(undefined)).toBeUndefined()
  })
})
