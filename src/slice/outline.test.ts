import { describe, expect, it } from 'vitest'
import { outline } from './outline'
import type { Contour, GlyphSource, PlacedRun } from './types'

/**
 * Every glyph is a 1em square sitting on its baseline, so a warped point's
 * position is arithmetic rather than a face. `I` is the one character this face
 * does not carry.
 */
const SQUARE: Contour = [
  [0, 0],
  [1, 0],
  [1, -1],
  [0, -1],
]

const source: GlyphSource = {
  centre: 0.5,
  advance: () => 1,
  contours: (char) => (char === 'I' ? null : [SQUARE.map(([x, y]) => [x, y]) as Contour]),
}

const points = (d: string): [number, number][] =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ])

/** Distance from the hub, and how far off the wedge's centreline — mid is 0. */
const polar = ([x, y]: [number, number]) => ({ radius: Math.hypot(x, y), across: x })

const radialRun = (glyphs: PlacedRun['glyphs']): PlacedRun => ({
  frame: { kind: 'radial', mid: 0, upright: true, inward: true },
  glyphs,
})

const glyph = (overrides: Partial<PlacedRun['glyphs'][number]> = {}) => ({
  char: 'W',
  size: 20,
  along: 100,
  factor: 1,
  advance: 1,
  ...overrides,
})

describe('outline', () => {
  it('emits one closed contour per glyph', () => {
    const d = outline(radialRun([glyph(), glyph({ along: 130 })]), source) ?? ''
    expect(d.startsWith('M')).toBe(true)
    expect([...d.matchAll(/Z/g)]).toHaveLength(2)
    expect([...d.matchAll(/M/g)]).toHaveLength(2)
  })

  // The whole reason outline mode exists: glyph mode scales a letter by the room
  // at one radius, so its sides stay parallel while the wedge's converge.
  it('narrows a glyph toward the hub, within the one letter', () => {
    const d = outline(radialRun([glyph()]), source) ?? ''
    const corners = points(d).map(polar)
    const outer = corners.filter((corner) => corner.radius > 100)
    const inner = corners.filter((corner) => corner.radius < 100)
    const spread = (side: typeof corners) => Math.max(...side.map((corner) => corner.across))

    expect(spread(outer)).toBeGreaterThan(spread(inner))
    // The taper is the wedge's own: across scales with the radius it sits at.
    expect(spread(outer) / spread(inner)).toBeCloseTo(outer[0].radius / inner[0].radius, 3)
  })

  // The warped letter converges exactly as the wedge does, so it fits wherever
  // glyph mode's inner corner fit — which is what the solve checked. Stated as
  // an angle, because a width that grows with the radius is the whole taper.
  it('claims no more of the wedge than glyph mode reserved', () => {
    const d = outline(radialRun([glyph({ factor: 1.4 })]), source) ?? ''
    const spread = points(d).map((point) => Math.abs(polar(point).across) / polar(point).radius)
    const reserved = (20 * 1.4) / 2 / (100 - 20 / 2)

    expect(Math.max(...spread)).toBeLessThanOrEqual(reserved)
    expect(Math.max(...spread)).toBeCloseTo(Math.min(...spread.filter((n) => n > 0)), 4)
  })

  // Not that two letters sit at two angles — that one letter does. A run that
  // only rotated each letter about its own centre is the seam outline mode is
  // here to remove, and it passes any assertion made across letters.
  it('bends one letter along the baseline it sits on', () => {
    const run: PlacedRun = {
      frame: { kind: 'arc', mid: 0, baseline: 150 },
      glyphs: [glyph()],
    }
    // The square, centred: its corners are baseline-left, baseline-right,
    // top-right, top-left.
    const [left, right, top] = points(outline(run, source) ?? '')
    const angle = ([x, y]: [number, number]) => Math.atan2(x, -y)

    // Loose by a rounded coordinate: `d` is emitted to two places, which at this
    // radius is a hundredth of a degree.
    expect(angle(right) - angle(left)).toBeCloseTo(20 / 150, 3)
    // Along the baseline, not through it: both feet sit at the same radius.
    expect(Math.hypot(...left)).toBeCloseTo(Math.hypot(...right), 1)
    // And up is outward, so the top of the letter clears the baseline.
    expect(Math.hypot(...top)).toBeGreaterThan(Math.hypot(...right))
  })

  // One missing character never leaves a half-warped word, and never changes
  // what the wedge says.
  it('drops the whole run when the face lacks one character', () => {
    expect(outline(radialRun([glyph(), glyph({ char: 'I' })]), source)).toBeNull()
  })

  it('draws nothing for an empty run', () => {
    expect(outline(radialRun([]), source)).toBeNull()
  })
})
