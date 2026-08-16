import { describe, expect, it } from 'vitest'
import { readParts } from './parts'
import { DEFAULT_SLICE, SLICE_LIST, getSlice, resolveInstance } from './registry'

describe('getSlice', () => {
  it('resolves a known id', () => {
    expect(getSlice('curved')?.id).toBe('curved')
  })

  it('returns null for an unknown id', () => {
    expect(getSlice('nope')).toBeNull()
  })

  it('returns null for a prototype key rather than a function off the chain', () => {
    expect(getSlice('constructor')).toBeNull()
    expect(getSlice('__proto__')).toBeNull()
  })

  it('lists every registered layout', () => {
    expect(SLICE_LIST.map((layout) => layout.id).sort()).toEqual([
      'auto',
      'cash',
      'composed',
      'curved',
      'radial',
      'tangential',
    ])
  })

  it('resolves the composed layout by id', () => {
    expect(getSlice('composed')?.id).toBe('composed')
  })

  it('offers the composed layout in the list', () => {
    expect(SLICE_LIST.map((layout) => layout.id)).toContain('composed')
  })
})

describe('resolveInstance', () => {
  it('prefers the segment instance', () => {
    const segment = {
      id: 'a',
      label: 'Mike Truk',
      weight: 1,
      slice: { id: 'radial' as const, params: {} },
    }
    expect(resolveInstance(segment, { id: 'curved', params: {} }).id).toBe('radial')
  })

  it('falls back to the wheel default', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1 }
    expect(resolveInstance(segment, { id: 'curved', params: {} }).id).toBe('curved')
  })

  it('falls back to the built-in when nothing is configured', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1 }
    expect(resolveInstance(segment, undefined)).toEqual(DEFAULT_SLICE)
  })

  it('sets a wedge with nothing configured as a name plate', () => {
    expect(DEFAULT_SLICE.id).toBe('composed')
    const [given, surname] = readParts(DEFAULT_SLICE.params.parts)
    expect(given).toMatchObject({
      orientation: 'archedRim',
      content: { from: 'label', transform: 'firstName' },
    })
    expect(surname).toMatchObject({
      orientation: 'stacked',
      caps: true,
      content: { from: 'label', transform: 'lastName' },
    })
  })

  it('keeps the two parts off each other, surname inside the given name', () => {
    const [given, surname] = readParts(DEFAULT_SLICE.params.parts)
    expect(surname.band[1]).toBeLessThan(given.band[0])
  })
})
