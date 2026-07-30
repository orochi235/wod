import { describe, expect, it } from 'vitest'
import { readEasing, readNumber, readString, readStringArray } from './params'

describe('readNumber', () => {
  it('reads a finite number', () => {
    expect(readNumber({ x: 0.6 }, 'x', 1)).toBe(0.6)
  })

  it('falls back when missing', () => {
    expect(readNumber({}, 'x', 1)).toBe(1)
  })

  it('falls back on a non-finite value', () => {
    expect(readNumber({ x: Number.NaN }, 'x', 1)).toBe(1)
  })

  it('falls back on a string', () => {
    expect(readNumber({ x: '0.6' }, 'x', 1)).toBe(1)
  })
})

describe('readString', () => {
  it('reads a string', () => {
    expect(readString({ s: 'hi' }, 's', '')).toBe('hi')
  })

  it('falls back on a number', () => {
    expect(readString({ s: 3 }, 's', 'x')).toBe('x')
  })
})

describe('readStringArray', () => {
  it('reads an array of strings', () => {
    expect(readStringArray({ t: ['a', 'b'] }, 't')).toEqual(['a', 'b'])
  })

  it('drops non-string entries', () => {
    expect(readStringArray({ t: ['a', 3, null] }, 't')).toEqual(['a'])
  })

  it('returns empty for a missing key', () => {
    expect(readStringArray({}, 't')).toEqual([])
  })
})

describe('readEasing', () => {
  it('reads a known easing', () => {
    expect(readEasing({ e: 'easeIn' }, 'e')).toBe('easeIn')
  })

  it('falls back to linear on an unknown easing', () => {
    expect(readEasing({ e: 'bouncy' }, 'e')).toBe('linear')
  })
})
