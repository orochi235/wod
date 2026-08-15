import { describe, expect, it } from 'vitest'
import type { SliceInstance } from '../types'
import { DEFAULT_FONT_ID } from './registry'
import { facesUsed } from './usage'

const composed = (parts: unknown[]): SliceInstance => ({ id: 'composed', params: { parts } })

const part = (overrides: Record<string, unknown> = {}) => ({
  content: { from: 'label' },
  orientation: 'stacked',
  band: [0.45, 0.94],
  ...overrides,
})

describe('facesUsed', () => {
  it("falls back to the look's face, then to the default", () => {
    expect(facesUsed([composed([part()])], 'rye')).toEqual([
      { id: 'rye', family: 'Rye', outline: false },
    ])
    expect(facesUsed([composed([part()])], undefined)[0].id).toBe(DEFAULT_FONT_ID)
  })

  it('names a face once however many wedges are set in it', () => {
    const faces = facesUsed([composed([part(), part()]), composed([part()])], 'rye')
    expect(faces).toHaveLength(1)
  })

  // The parse is a fetch of the whole binary, so one part asking for outlines
  // must be enough and no part asking must cost nothing.
  it('marks a face for parsing when anything wants it warped', () => {
    const faces = facesUsed([composed([part(), part({ shape: 'outline' })])], 'rye')
    expect(faces).toEqual([{ id: 'rye', family: 'Rye', outline: true }])
  })

  it('leaves a face nothing wants warped unparsed', () => {
    const faces = facesUsed([composed([part({ font: 'anton', shape: 'outline' }), part()])], 'rye')
    expect(faces).toEqual([
      { id: 'anton', family: 'Anton', outline: true },
      { id: 'rye', family: 'Rye', outline: false },
    ])
  })

  // The layouts that predate parts carry no face of their own.
  it("reads a layout with no parts as the look's face", () => {
    expect(facesUsed([{ id: 'auto', params: {} }], 'rye')).toEqual([
      { id: 'rye', family: 'Rye', outline: false },
    ])
  })

  it("reads junk params as the look's face rather than throwing", () => {
    expect(facesUsed([{ id: 'composed', params: { parts: 'nope' } }], 'rye')).toEqual([
      { id: 'rye', family: 'Rye', outline: false },
    ])
  })
})
