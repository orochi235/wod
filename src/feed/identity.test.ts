import { describe, expect, it } from 'vitest'
import { slugify, withUniqueIds } from './identity'

describe('slugify', () => {
  it('keeps letters, numbers, and combining marks', () => {
    expect(slugify('Ana')).toBe('ana')
    expect(slugify('नमस्ते')).toBe('नमस्ते')
    expect(slugify('Jo Smith-Jones')).toBe('jo-smith-jones')
  })

  it('never emits a colon, which would make a wedge id ambiguous', () => {
    expect(slugify('a:b')).toBe('a-b')
  })

  it('falls back rather than returning an empty id', () => {
    expect(slugify('!!!')).toBe('item')
  })
})

describe('withUniqueIds', () => {
  it('keeps a preferred id when nothing collides', () => {
    expect(withUniqueIds([{ id: 'ana', label: 'Ana' }])).toEqual([{ id: 'ana', label: 'Ana' }])
  })

  it('suffixes collisions in list order', () => {
    expect(
      withUniqueIds([
        { id: 'ana', label: 'Ana' },
        { id: 'ana', label: 'Ana' },
        { id: 'ana', label: 'Ana' },
      ]),
    ).toEqual([
      { id: 'ana', label: 'Ana' },
      { id: 'ana-2', label: 'Ana' },
      { id: 'ana-3', label: 'Ana' },
    ])
  })

  it('keeps a label that differs from the id', () => {
    expect(withUniqueIds([{ id: 'users/1', label: 'Ana' }])).toEqual([
      { id: 'users/1', label: 'Ana' },
    ])
  })
})
