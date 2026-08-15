import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import { DEFAULT_PART } from '../parts'
import type { Glyph, Measure, SliceContext } from '../types'
import { composed } from './composed'

const measure: Measure = (text, size) => text.length * 0.5 * size

function context(overrides: Partial<SliceContext> = {}): SliceContext {
  return {
    segment: { id: 'a', label: 'Sleve McDichael', weight: 1 },
    arc: { start: 0, end: 0.125 },
    radius: 200,
    index: 0,
    count: 8,
    measure,
    fit: createFit(measure),
    ...overrides,
  }
}

describe('composed', () => {
  it('draws its parts in order, each in its own band', () => {
    const elements = composed.draw(
      {
        parts: [
          { content: { from: 'text', value: 'AB' }, orientation: 'stacked', band: [0.7, 0.95] },
          { content: { from: 'text', value: 'CD' }, orientation: 'stacked', band: [0.3, 0.55] },
        ],
      },
      context(),
    )
    expect(elements).toHaveLength(2)
    const radiusOf = (index: number) => {
      const element = elements[index] as { kind: 'glyphRun'; glyphs: Glyph[] }
      return Math.hypot(element.glyphs[0].x, element.glyphs[0].y)
    }
    expect(radiusOf(0)).toBeGreaterThan(radiusOf(1))
  })

  it('emits nothing for a part whose content resolves to nothing', () => {
    const elements = composed.draw(
      {
        parts: [
          { content: { from: 'media' }, orientation: 'stacked', band: [0.7, 0.95] },
          { content: { from: 'label' }, orientation: 'stacked', band: [0.3, 0.55] },
        ],
      },
      context(),
    )
    expect(elements).toHaveLength(1)
  })

  it('draws a label composition when the params carry no parts at all', () => {
    const elements = composed.draw({}, context())
    expect(elements).toHaveLength(1)
    expect(elements[0].kind).toBe('glyphRun')
  })

  it('draws nothing when every slot has been cleared', () => {
    expect(composed.draw({ parts: [] }, context())).toEqual([])
  })

  it('starts on a one-part default', () => {
    expect(composed.defaults.parts).toEqual([DEFAULT_PART])
  })

  it('declares a field for each of its defaults', () => {
    const keys = composed.fields.map((field) => field.key).sort()
    expect(keys).toEqual(Object.keys(composed.defaults).sort())
  })
})
