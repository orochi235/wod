import { describe, expect, it } from 'vitest'
import { createFit } from './fit'
import type { Measure, SliceContext, SlicePart } from './types'
import { typeset } from './typeset'

/**
 * Per-character widths, so a slot assertion is arithmetic rather than a font.
 * jsdom has no canvas metrics, and the shipped estimate gives every character
 * the same width — which is the one thing half these rules are about.
 */
const WIDTHS: Record<string, number> = { I: 0.28, W: 0.95, M: 0.9 }
const measure: Measure = (text, size) =>
  [...text].reduce((sum, ch) => sum + (WIDTHS[ch] ?? 0.5), 0) * size

function context(overrides: Partial<SliceContext> = {}): SliceContext {
  return {
    segment: { id: 'a', label: 'Sleve McDichael', weight: 3 },
    arc: { start: 0, end: 0.125 },
    radius: 200,
    index: 2,
    count: 8,
    measure,
    fit: createFit(measure),
    ...overrides,
  }
}

const part = (overrides: Partial<SlicePart> = {}): SlicePart => ({
  content: { from: 'label' },
  orientation: 'stacked',
  band: [0.45, 0.94],
  ...overrides,
})

describe('content', () => {
  it('sets the segment label', () => {
    const [element] = typeset(part({ orientation: 'radial' }), context())
    expect(element).toMatchObject({ kind: 'text', text: 'Sleve McDichael' })
  })

  it('applies a content transform to the label', () => {
    const [element] = typeset(
      part({ orientation: 'radial', content: { from: 'label', transform: 'initials' } }),
      context(),
    )
    expect(element).toMatchObject({ text: 'SM' })
  })

  it('sets an authored word verbatim', () => {
    const [element] = typeset(
      part({ orientation: 'radial', content: { from: 'text', value: 'BANKRUPT' } }),
      context(),
    )
    expect(element).toMatchObject({ text: 'BANKRUPT' })
  })

  it('emits nothing when the content resolves to nothing', () => {
    expect(typeset(part({ content: { from: 'text', value: '' } }), context())).toEqual([])
    expect(typeset(part({ content: { from: 'media' } }), context())).toEqual([])
  })

  it('sets an emoji medium as a run of type', () => {
    const ctx = context({
      segment: { id: 'a', label: 'Ana', weight: 1, media: { kind: 'emoji', value: '🎯' } },
    })
    const [element] = typeset(part({ orientation: 'radial', content: { from: 'media' } }), ctx)
    expect(element).toMatchObject({ kind: 'text', text: '🎯' })
  })

  it('draws an image medium in its band', () => {
    const ctx = context({
      segment: { id: 'a', label: 'Ana', weight: 1, media: { kind: 'image', value: 'photo.png' } },
    })
    const [element] = typeset(part({ content: { from: 'media' }, band: [0.5, 0.8] }), ctx)
    expect(element).toMatchObject({ kind: 'image', href: 'photo.png', anchor: 0.65, size: 60 })
  })

  it('sets a gif medium as an image, like a still', () => {
    const ctx = context({
      segment: { id: 'a', label: 'Ana', weight: 1, media: { kind: 'gif', value: 'spin.gif' } },
    })
    const [element] = typeset(part({ content: { from: 'media' } }), ctx)
    expect(element).toMatchObject({ kind: 'image', href: 'spin.gif' })
  })

  it('gives a band with no thickness an image with no size', () => {
    const ctx = context({
      segment: { id: 'a', label: 'Ana', weight: 1, media: { kind: 'image', value: 'photo.png' } },
    })
    const [element] = typeset(part({ content: { from: 'media' }, band: [0.6, 0.6] }), ctx)
    expect(element).toMatchObject({ kind: 'image', size: 0 })
  })

  it('sets derived content', () => {
    const rendered = (value: 'weight' | 'index' | 'position') => {
      const [element] = typeset(
        part({ orientation: 'radial', content: { from: 'derived', value } }),
        context(),
      )
      return (element as { text: string }).text
    }
    expect(rendered('weight')).toBe('3')
    expect(rendered('index')).toBe('3')
    expect(rendered('position')).toBe('3/8')
  })
})

describe('the orientations that go through fit', () => {
  it('emits radial text along the radius', () => {
    const [element] = typeset(part({ orientation: 'radial' }), context())
    expect(element).toMatchObject({ kind: 'text', along: 'radial' })
  })

  it('emits tangential text across the wedge', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const [element] = typeset(part({ orientation: 'tangential' }), ctx)
    expect(element).toMatchObject({ kind: 'text', along: 'tangential' })
  })

  it('emits curved text on a fat wedge', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const [element] = typeset(part({ orientation: 'curved' }), ctx)
    expect(element).toMatchObject({ kind: 'curvedText' })
  })

  it('anchors on the middle of the band', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const [element] = typeset(part({ orientation: 'curved', band: [0.6, 0.8] }), ctx)
    expect(element).toMatchObject({ anchor: 0.7 })
  })

  it('carries the part frame, and lays a level run out horizontally', () => {
    const [element] = typeset(part({ orientation: 'radial', frame: 'level' }), context())
    expect(element).toMatchObject({ frame: 'level', along: 'tangential' })
  })

  it('caps a run at the part max size', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const uncapped = typeset(part({ orientation: 'curved' }), ctx)[0] as { size: number }
    const capped = typeset(part({ orientation: 'curved', maxSize: 11 }), ctx)[0] as { size: number }
    // The cap has to actually bind, or this asserts nothing.
    expect(uncapped.size).toBeGreaterThan(11)
    expect(capped.size).toBeLessThanOrEqual(11)
  })

  it('emits nothing when the wedge cannot hold the run above the floor', () => {
    const ctx = context({ arc: { start: 0, end: 0.0002 } })
    expect(typeset(part({ orientation: 'radial' }), ctx)).toEqual([])
  })
})
