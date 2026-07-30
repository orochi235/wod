import { describe, expect, it } from 'vitest'
import { EASINGS } from '../wheel/morph'
import {
  readEasing,
  readNumber,
  readOptionalString,
  readString,
  readStringArray,
  readUnit,
} from './params'

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

  it('accepts every easing the wheel actually implements', () => {
    // Guards the sync between this reader and the wheel's easing table.
    for (const name of Object.keys(EASINGS)) {
      expect(readEasing({ e: name }, 'e')).toBe(name)
    }
  })

  it('does not mistake an inherited property for an easing', () => {
    expect(readEasing({ e: 'toString' }, 'e')).toBe('linear')
  })

  it('falls back to linear on a non-string', () => {
    expect(readEasing({ e: 3 }, 'e')).toBe('linear')
  })
})

describe('readOptionalString', () => {
  it('reads a non-empty string', () => {
    expect(readOptionalString({ s: 'hi' }, 's')).toBe('hi')
  })

  it('treats an empty string as absent', () => {
    expect(readOptionalString({ s: '' }, 's')).toBeUndefined()
  })

  it('returns undefined for a missing key', () => {
    expect(readOptionalString({}, 's')).toBeUndefined()
  })
})

describe('readUnit', () => {
  it('passes an in-range value through', () => {
    expect(readUnit({ t: 0.6 }, 't', 0)).toBe(0.6)
  })

  it('clamps above one', () => {
    expect(readUnit({ t: 4 }, 't', 0)).toBe(1)
  })

  it('clamps below zero', () => {
    expect(readUnit({ t: -4 }, 't', 0)).toBe(0)
  })

  it('clamps the fallback too, so the result is always in range', () => {
    expect(readUnit({}, 't', 5)).toBe(1)
  })

  it('falls back on a non-finite value', () => {
    expect(readUnit({ t: Number.NaN }, 't', 0.25)).toBe(0.25)
  })
})
