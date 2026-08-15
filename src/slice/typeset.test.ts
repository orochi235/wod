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

  it('gives up its tracking before the floor pushes it out of its band', () => {
    // 46 units of band for five letters: 9 apiece fits, 9 apiece plus tracking
    // does not, so the floor would bind on a run that has room to sit.
    const glyphs = glyphsOf({
      content: { from: 'text', value: 'ANTON' },
      band: [0.5, 0.73],
      fan: false,
    })
    expect(Math.min(...glyphs.map((glyph) => glyph.size))).toBeGreaterThan(9)
    expect(radialSpan(glyphs, 1)).toBeCloseTo(46, 0)
  })

  it('gives up its fan before the floor pushes it out of its band', () => {
    // Fanned, the innermost letters of a band this deep are solved below the
    // floor, and every one the floor lifts is one the band did not budget for.
    const glyphs = glyphsOf({ content: { from: 'text', value: 'ABCDEFGHIJ' }, band: [0.05, 0.95] })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
    // Tracking comes back once the fan is what gave way: the rungs are tried in
    // order of what they cost, not stacked.
    expect(radialSpan(glyphs, 1.08)).toBeCloseTo(180, 0)
  })

  it('accepts the overflow when no concession is enough', () => {
    const value = 'SCHWARZENEGGERBERGSTEIN'
    const glyphs = glyphsOf({ content: { from: 'text', value }, band: [0.7, 0.8] })
    // Every letter still drawn, and at the floor — the run leaves its band
    // rather than dropping one.
    expect(glyphs).toHaveLength(value.length)
    expect(radialSpan(glyphs, 1)).toBeGreaterThan(20)
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
    for (const glyph of glyphs) expect(Math.abs(glyph.rotate - 45)).toBeCloseTo(90)
  })

  it('turns its baseline the way the run steps, so the word is not reversed', () => {
    const ctx = context({ arc: { start: 0, end: 0.25 } })
    // Where the next glyph sits, versus where this glyph's own advance points.
    const reads = (direction: 'rimInward' | 'hubOutward') => {
      const glyphs = glyphsOf(
        { orientation: 'taperedRadial', content: { from: 'text', value: 'AB' }, direction },
        ctx,
      )
      const step = { x: glyphs[1].x - glyphs[0].x, y: glyphs[1].y - glyphs[0].y }
      const turn = (glyphs[0].rotate * Math.PI) / 180
      return step.x * Math.cos(turn) + step.y * Math.sin(turn)
    }
    expect(reads('rimInward')).toBeGreaterThan(0)
    expect(reads('hubOutward')).toBeGreaterThan(0)
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

describe('shrink', () => {
  /** Narrow enough that the chord is the only thing that can bind. */
  const narrow = () => context({ arc: { start: 0, end: 0.02 } })

  const wide = (overrides: Partial<SlicePart> = {}): Partial<SlicePart> => ({
    content: { from: 'text', value: 'WWWW' },
    band: [0.3, 0.9],
    fan: false,
    maxSize: 60,
    ...overrides,
  })

  it('takes the whole glyph down by default', () => {
    const glyphs = glyphsOf(wide(), narrow())
    expect(glyphs[0].scale).toEqual([1, 1])
    expect(glyphs[0].size).toBeLessThan(60)
  })

  it('condensing keeps the height the band solved and squeezes across instead', () => {
    const condensed = glyphsOf(wide({ shrink: 'condense' }), narrow())
    const proportional = glyphsOf(wide(), narrow())
    expect(condensed[0].size).toBeGreaterThan(proportional[0].size)
    expect(condensed[0].scale[0]).toBeLessThan(1)
    expect(condensed[0].scale[1]).toBe(1)
  })

  it('condensing fills the band the chord cap leaves a run floating in', () => {
    // (0.9 - 0.3) * 200 units of band.
    expect(radialSpan(glyphsOf(wide({ shrink: 'condense' }), narrow()), 1.08)).toBeCloseTo(120, 0)
    expect(radialSpan(glyphsOf(wide(), narrow()), 1.08)).toBeLessThan(100)
  })

  it('squeezes the other axis for a quarter-turned glyph', () => {
    const glyphs = glyphsOf(
      wide({ shrink: 'condense', orientation: 'taperedRadial' }),
      context({ arc: { start: 0, end: 0.008 } }),
    )
    expect(glyphs[0].scale[0]).toBe(1)
    expect(glyphs[0].scale[1]).toBeLessThan(1)
  })

  it('never squeezes past a third, so a long name cannot collapse to a line', () => {
    for (const glyph of glyphsOf(wide({ shrink: 'condense' }), narrow())) {
      expect(glyph.scale[0]).toBeGreaterThanOrEqual(0.33)
    }
  })

  it('lets the chord decide for a part that asks to stretch and to condense', () => {
    const both = wide({
      shrink: 'condense',
      stretch: 'fill',
      content: { from: 'text', value: 'II' },
    })
    expect(glyphsOf(both, narrow())[0].scale[0]).toBeLessThan(1)
    expect(glyphsOf(both, context({ arc: { start: 0, end: 0.25 } }))[0].scale[0]).toBeGreaterThan(1)
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

  it('condensing keeps the size its band gave and narrows the letters to the arc', () => {
    const tight = () => context({ arc: { start: 0, end: 0.04 } })
    const condensed = arched(
      { content: { from: 'text', value: 'BANKRUPT' }, shrink: 'condense' },
      tight(),
    )
    const proportional = arched({ content: { from: 'text', value: 'BANKRUPT' } }, tight())
    expect(condensed[0].size).toBeGreaterThan(proportional[0].size)
    expect(condensed[0].scale[0]).toBeLessThan(1)
    expect(condensed[0].scale[1]).toBe(1)
  })

  it('spaces a condensed run by the narrowed letter, not the wide one', () => {
    const glyphs = arched(
      { content: { from: 'text', value: 'BANKRUPT' }, shrink: 'condense' },
      context({ arc: { start: 0, end: 0.04 } }),
    )
    const gap = Math.hypot(glyphs[1].x - glyphs[0].x, glyphs[1].y - glyphs[0].y)
    // An advance apiece plus the tracking, at this size. Spacing the run by
    // that unsqueezed is the bug this pins: it would overrun the very arc the
    // condense was for.
    const unsqueezed = glyphs[0].size * 0.58
    expect(gap).toBeLessThan(unsqueezed)
    expect(gap / unsqueezed).toBeCloseTo(glyphs[0].scale[0], 1)
  })

  it('gives up its tracking before the floor pushes it past its arc', () => {
    // An arc that holds five letters at 9.8 untracked and 8.5 tracked, so the
    // floor is what would bind on a run that has room to sit.
    const glyphs = arched(
      { content: { from: 'text', value: 'ABCDE' } },
      context({ arc: { start: 0, end: 0.0265 } }),
    )
    expect(glyphs[0].size).toBeGreaterThan(9)
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
