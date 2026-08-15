import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import type { Measure, SliceContext } from '../types'
import { auto } from './auto'

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

describe('auto', () => {
  it('curves a full name on a fat wedge', () => {
    const [element] = auto.draw(auto.defaults, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'curvedText', text: 'Sleve McDichael' })
  })

  it('degrades to initials rather than drawing nothing on a sliver', () => {
    const [element] = auto.draw(auto.defaults, context({ arc: { start: 0, end: 0.012 } }))
    expect(element).toMatchObject({ text: 'SM' })
  })

  it('draws nothing when even initials will not fit', () => {
    expect(auto.draw(auto.defaults, context({ arc: { start: 0, end: 0.00001 } }))).toEqual([])
  })

  it('honors a ladder chosen through params', () => {
    const params = { ...auto.defaults, ladder: 'shrinkOnly' }
    expect(auto.draw(params, context({ arc: { start: 0, end: 0.012 } }))).toEqual([])
  })

  it('ignores an unknown ladder rather than throwing', () => {
    const params = { ...auto.defaults, ladder: '__proto__' }
    const [element] = auto.draw(params, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toBeDefined()
  })

  it('draws horizontal text in level frame', () => {
    const params = { ...auto.defaults, frame: 'level' }
    const [element] = auto.draw(params, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'text', along: 'tangential', frame: 'level' })
  })
})
