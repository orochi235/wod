import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import type { Glyph, Measure, SliceContext, SliceParams } from '../types'
import { cash } from './cash'

const measure: Measure = (text, size) => text.length * 0.5 * size

const context = (label: string): SliceContext => ({
  segment: { id: 'a', label, weight: 1 },
  arc: { start: 0, end: 1 / 24 },
  radius: 200,
  index: 0,
  count: 24,
  measure,
  fit: createFit(measure),
})

const draw = (params: SliceParams = {}, label = '$900') =>
  cash.draw({ ...cash.defaults, ...params }, context(label))

const glyphsOf = (element: unknown): Glyph[] =>
  (element as { kind: 'glyphRun'; glyphs: Glyph[] }).glyphs

const charsOf = (element: unknown): string =>
  glyphsOf(element)
    .map((glyph) => glyph.char)
    .join('')

describe('cash layout', () => {
  it('sets the mark over the wedge’s own figure', () => {
    const [mark, figure] = draw()
    expect(charsOf(mark)).toBe('$')
    // The figure is the label's digits, so one layout serves every face.
    expect(charsOf(figure)).toBe('900')
  })

  it('takes the figure from whatever the wedge is labelled', () => {
    expect(charsOf(draw({}, '$5000')[1])).toBe('5000')
  })

  it('drops the mark entirely when none is set', () => {
    const elements = draw({ mark: '' })
    expect(elements).toHaveLength(1)
    expect(charsOf(elements[0])).toBe('900')
  })

  it('sets the figure in the face the params name', () => {
    const [, figure] = draw({ font: 'bevan' })
    expect((figure as { family?: string }).family).toMatch(/Bevan/)
  })

  // Ordered rather than trusted, as PartsField already does: dragging one edge
  // past the other narrows the band instead of inverting it.
  it('narrows an inverted band rather than turning it inside out', () => {
    const inverted = draw({ inner: 0.8, outer: 0.4 })
    const ordered = draw({ inner: 0.4, outer: 0.8 })
    expect(glyphsOf(inverted[1]).map((g) => g.size)).toEqual(
      glyphsOf(ordered[1]).map((g) => g.size),
    )
  })

  it('tightens the figure as leading closes up', () => {
    const open = glyphsOf(draw({ leading: 1.4 })[1])
    const tight = glyphsOf(draw({ leading: 0.6 })[1])
    const slot = (glyphs: Glyph[]) =>
      Math.abs(Math.hypot(glyphs[0].x, glyphs[0].y) - Math.hypot(glyphs[1].x, glyphs[1].y))
    expect(slot(tight) / tight[0].size).toBeLessThan(slot(open) / open[0].size)
  })

  it('offers a field for every default it reads', () => {
    const keys = cash.fields.map((field) => field.key).sort()
    expect(Object.keys(cash.defaults).sort()).toEqual(keys)
  })
})
