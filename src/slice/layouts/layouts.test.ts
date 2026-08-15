import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import type { Measure, SliceContext } from '../types'
import { curved } from './curved'
import { radial } from './radial'
import { tangential } from './tangential'

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

describe('radial', () => {
  it('draws one radial text element', () => {
    const [element] = radial.draw(radial.defaults, context())
    expect(element).toMatchObject({ kind: 'text', along: 'radial', text: 'Sleve McDichael' })
  })

  it('draws nothing when the arc cannot hold the label', () => {
    expect(radial.draw(radial.defaults, context({ arc: { start: 0, end: 0.0002 } }))).toEqual([])
  })

  it('carries the frame from its params', () => {
    const [element] = radial.draw({ ...radial.defaults, frame: 'level' }, context())
    expect(element.frame).toBe('level')
  })
})

describe('tangential', () => {
  it('draws one tangential text element', () => {
    const [element] = tangential.draw(tangential.defaults, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'text', along: 'tangential' })
  })
})

describe('curved', () => {
  it('draws a curved text element on a fat arc', () => {
    const [element] = curved.draw(curved.defaults, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'curvedText', text: 'Sleve McDichael' })
  })
})

describe('every layout', () => {
  it('declares a field for each of its defaults', () => {
    for (const layout of [radial, tangential, curved]) {
      const keys = layout.fields.map((field) => field.key).sort()
      expect(keys).toEqual(Object.keys(layout.defaults).sort())
    }
  })
})
