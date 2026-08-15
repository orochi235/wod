import { describe, expect, it } from 'vitest'
import { createFit } from './fit'
import type { Glyph, Measure, SliceContext, SlicePart } from './types'
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

function glyphsOf(overrides: Partial<SlicePart>, ctx: SliceContext = context()): Glyph[] {
  const [element] = typeset(part(overrides), ctx)
  expect(element?.kind).toBe('glyphRun')
  return (element as { kind: 'glyphRun'; glyphs: Glyph[] }).glyphs
}

const radiusOf = (glyph: Glyph): number => Math.hypot(glyph.x, glyph.y)

/** How much radius a run consumed: centre to centre, plus a half slot at each end. */
function radialSpan(glyphs: Glyph[], stepRatio: number): number {
  const radii = glyphs.map(radiusOf)
  const ends = glyphs[0].size * stepRatio + glyphs[glyphs.length - 1].size * stepRatio
  return Math.max(...radii) - Math.min(...radii) + ends / 2
}

describe('the stacked solve', () => {
  it('fills its band', () => {
    const glyphs = glyphsOf({
      content: { from: 'text', value: 'BANKRUPT' },
      band: [0.4, 0.9],
      fan: false,
    })
    // (0.9 - 0.4) * 200 units of radius, and a stacked step is size * (1 + tracking).
    expect(radialSpan(glyphs, 1.08)).toBeCloseTo(100, 0)
  })

  it('places one glyph per character, in order, rim inward', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'RYE' } })
    expect(glyphs.map((glyph) => glyph.char)).toEqual(['R', 'Y', 'E'])
    expect(radiusOf(glyphs[0])).toBeGreaterThan(radiusOf(glyphs[2]))
  })

  it('runs outward from the hub without reordering the letters', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'RYE' }, direction: 'hubOutward' })
    expect(glyphs.map((glyph) => glyph.char)).toEqual(['R', 'Y', 'E'])
    expect(radiusOf(glyphs[0])).toBeLessThan(radiusOf(glyphs[2]))
  })

  it('gives every glyph the same size when fan is off', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'ANTON' }, fan: false })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
  })

  it('grows the letters toward the rim when fan is on', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'ANTON' }, fan: true })
    expect(glyphs[0].size).toBeGreaterThan(glyphs[glyphs.length - 1].size)
  })

  it('caps a glyph at the chord at its own radius', () => {
    // A narrow wedge and a tall band: the fit unit and the max size are both
    // roomy, so only the chord can be what stops these letters.
    const glyphs = glyphsOf(
      { content: { from: 'text', value: 'WW' }, band: [0.1, 0.95], fan: false, maxSize: 60 },
      context({ arc: { start: 0, end: 0.02 } }),
    )
    for (const glyph of glyphs) {
      const room = 2 * radiusOf(glyph) * Math.sin(Math.PI * 0.02) * 0.86
      expect(glyph.size).toBeLessThan(60)
      expect(glyph.size * 0.95).toBeLessThanOrEqual(room)
    }
  })

  it('shrinks a long word to the floor rather than dropping letters', () => {
    const value = 'SCHWARZENEGGERBERGSTEIN'
    const glyphs = glyphsOf({ content: { from: 'text', value }, band: [0.7, 0.8] })
    expect(glyphs).toHaveLength(value.length)
    expect(Math.min(...glyphs.map((glyph) => glyph.size))).toBe(9)
  })

  it('never exceeds the part max size', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'AB' }, maxSize: 12, fan: false })
    expect(Math.max(...glyphs.map((glyph) => glyph.size))).toBeLessThanOrEqual(12)
  })

  it('steps an upright run by the line, not by the letter', () => {
    // I and W differ hugely in advance. Stacked letters step by the line, so
    // their slots must not: only the width cap may notice the difference.
    const glyphs = glyphsOf({
      content: { from: 'text', value: 'IIW' },
      band: [0.3, 0.95],
      fan: false,
      maxSize: 20,
    })
    const gap = (a: number, b: number) => Math.abs(radiusOf(glyphs[a]) - radiusOf(glyphs[b]))
    expect(gap(0, 1)).toBeCloseTo(gap(1, 2), 1)
    // The step is size * (1 + TRACKING); this pins TRACKING itself.
    expect(gap(0, 1)).toBeCloseTo(glyphs[0].size * 1.08, 1)
  })

  it('keeps stacked letters upright on the wedge midline', () => {
    const ctx = context({ arc: { start: 0, end: 0.25 } })
    for (const glyph of glyphsOf({ content: { from: 'text', value: 'AB' } }, ctx)) {
      expect(glyph.rotate).toBeCloseTo(45)
    }
  })
})

describe('the tapered radial solve', () => {
  it('gives a narrow letter a narrower slot than a wide one at the same size', () => {
    // maxSize binds, so every glyph is the same size and the only thing that can
    // change how much radius each one takes is its own measured advance.
    const glyphs = glyphsOf({
      orientation: 'taperedRadial',
      content: { from: 'text', value: 'IIW' },
      band: [0.3, 0.95],
      fan: false,
      maxSize: 20,
    })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
    const gap = (a: number, b: number) => Math.abs(radiusOf(glyphs[a]) - radiusOf(glyphs[b]))
    expect(gap(1, 2)).toBeGreaterThan(gap(0, 1) * 1.5)
  })

  it('quarter-turns its letters', () => {
    const ctx = context({ arc: { start: 0, end: 0.25 } })
    const glyphs = glyphsOf(
      { orientation: 'taperedRadial', content: { from: 'text', value: 'AB' } },
      ctx,
    )
    for (const glyph of glyphs) expect(glyph.rotate).toBeCloseTo(-45)
  })
})

describe('stretch', () => {
  it('is off by default', () => {
    for (const glyph of glyphsOf({ content: { from: 'text', value: 'AB' } })) {
      expect(glyph.scale).toEqual([1, 1])
    }
  })

  it('widens a stacked glyph on its own x axis', () => {
    const glyphs = glyphsOf({
      content: { from: 'text', value: 'II' },
      stretch: 'fill',
      maxSize: 12,
    })
    expect(glyphs[0].scale[0]).toBeGreaterThan(1)
    expect(glyphs[0].scale[1]).toBe(1)
  })

  it('moves the other axis for a quarter-turned glyph', () => {
    const glyphs = glyphsOf({
      orientation: 'taperedRadial',
      content: { from: 'text', value: 'II' },
      stretch: 'fill',
      maxSize: 12,
    })
    expect(glyphs[0].scale[0]).toBe(1)
    expect(glyphs[0].scale[1]).toBeGreaterThan(1)
  })

  it('caps a fill so a short word cannot smear', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'I' }, stretch: 'fill', maxSize: 10 })
    expect(glyphs[0].scale[0]).toBe(3)
  })

  it('caps an authored stretch too', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'AB' }, stretch: 40 })
    expect(glyphs[0].scale[0]).toBe(3)
  })
})

describe('the arched rim run', () => {
  const wide = () => context({ arc: { start: 0, end: 0.25 } })
  const arched = (overrides: Partial<SlicePart> = {}, ctx: SliceContext = wide()): Glyph[] =>
    glyphsOf({ orientation: 'archedRim', band: [0.8, 0.94], ...overrides }, ctx)

  it('sets every glyph at one size on one radius', () => {
    const glyphs = arched({ content: { from: 'text', value: 'WHEEL' } })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
    const radii = glyphs.map(radiusOf)
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.02)
  })

  it('centres the run on the wedge and runs it clockwise', () => {
    const glyphs = arched({ content: { from: 'text', value: 'WHEEL' } })
    expect(glyphs[0].rotate).toBeLessThan(45)
    expect(glyphs[glyphs.length - 1].rotate).toBeGreaterThan(45)
  })

  it('turns each glyph square to its own point on the arc', () => {
    for (const glyph of arched({ content: { from: 'text', value: 'WHEEL' } })) {
      const turnDeg = (Math.atan2(glyph.x, -glyph.y) * 180) / Math.PI
      expect(glyph.rotate).toBeCloseTo(turnDeg, 0)
    }
  })

  it('gives a wide letter a wider slot than a narrow one', () => {
    const glyphs = arched({ content: { from: 'text', value: 'IIW' } })
    const gap = (a: number, b: number) =>
      Math.hypot(glyphs[a].x - glyphs[b].x, glyphs[a].y - glyphs[b].y)
    expect(gap(1, 2)).toBeGreaterThan(gap(0, 1) * 1.5)
  })

  it('caps the size on the thickness of its band', () => {
    const thin = arched({ content: { from: 'text', value: 'AB' }, band: [0.9, 0.94] })
    const thick = arched({ content: { from: 'text', value: 'AB' }, band: [0.6, 0.94] })
    expect(thin[0].size).toBeLessThan(thick[0].size)
  })

  it('shrinks a long word to the floor rather than dropping letters', () => {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const glyphs = arched(
      { content: { from: 'text', value } },
      context({ arc: { start: 0, end: 0.02 } }),
    )
    expect(glyphs).toHaveLength(value.length)
    expect(glyphs[0].size).toBe(9)
  })

  it('leaves a fill alone, having no narrowing room to fill', () => {
    for (const glyph of arched({ content: { from: 'text', value: 'AB' }, stretch: 'fill' })) {
      expect(glyph.scale).toEqual([1, 1])
    }
  })

  it('honours an authored stretch on the glyph x axis', () => {
    const glyphs = arched({ content: { from: 'text', value: 'AB' }, stretch: 1.5 })
    expect(glyphs[0].scale).toEqual([1.5, 1])
  })

  it('survives a band collapsed onto the hub', () => {
    const glyphs = arched({ content: { from: 'text', value: 'AB' }, band: [0, 0] })
    expect(glyphs).toHaveLength(2)
    for (const glyph of glyphs) {
      expect(Number.isFinite(glyph.x)).toBe(true)
      expect(Number.isFinite(glyph.y)).toBe(true)
      expect(glyph.size).toBe(9)
    }
  })
})
