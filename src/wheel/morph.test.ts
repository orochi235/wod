import { describe, expect, it } from 'vitest'
import { applyMorphs, landingSegments, lerpColor, morphProgress, parseHex } from './morph'
import type { Morph, Segment } from './types'

const base: Segment[] = [
  { id: 'beer', label: 'free beer', weight: 1 },
  { id: 'dave', label: 'Dave', weight: 99 },
]

const swell: Morph = {
  segmentId: 'beer',
  durationMs: 1000,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 99 },
  ],
}

const vanish: Morph = {
  segmentId: 'dave',
  durationMs: 1000,
  keyframes: [
    { at: 0, weight: 99 },
    { at: 1, weight: 0 },
  ],
}

describe('parseHex', () => {
  it('expands shorthand hex', () => {
    expect(parseHex('#f00')).toEqual([255, 0, 0])
  })

  it('parses full hex', () => {
    expect(parseHex('#00ff80')).toEqual([0, 255, 128])
  })

  it('returns null for anything else', () => {
    expect(parseHex('rebeccapurple')).toBeNull()
  })
})

describe('lerpColor', () => {
  it('interpolates hex colors', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('steps rather than blending when a color is not hex', () => {
    expect(lerpColor('red', 'blue', 0.4)).toBe('red')
    expect(lerpColor('red', 'blue', 1)).toBe('blue')
  })
})

describe('morphProgress', () => {
  it('clamps below zero and above one', () => {
    expect(morphProgress(swell, -100)).toBe(0)
    expect(morphProgress(swell, 999999)).toBe(1)
  })

  it('is linear by default', () => {
    expect(morphProgress(swell, 500)).toBeCloseTo(0.5)
  })

  it('applies a named easing', () => {
    const eased: Morph = { ...swell, easing: 'easeIn' }
    expect(morphProgress(eased, 500)).toBeCloseTo(0.25)
  })

  it('completes immediately for a zero duration', () => {
    expect(morphProgress({ ...swell, durationMs: 0 }, 0)).toBe(1)
  })
})

describe('applyMorphs', () => {
  it('returns the input untouched when there are no morphs', () => {
    expect(applyMorphs(base, [], 500)).toBe(base)
  })

  it('interpolates weight at the midpoint', () => {
    const result = applyMorphs(base, [swell], 500)
    expect(result[0].weight).toBeCloseTo(50)
  })

  it('leaves unmorphed segments alone', () => {
    const result = applyMorphs(base, [swell], 500)
    expect(result[1].weight).toBe(99)
  })

  it('holds the final value past the morph duration', () => {
    const result = applyMorphs(base, [swell], 5000)
    expect(result[0].weight).toBe(99)
  })

  it('steps labels instead of interpolating them', () => {
    const relabel: Morph = {
      segmentId: 'dave',
      durationMs: 1000,
      keyframes: [
        { at: 0, label: 'Dave' },
        { at: 0.5, label: 'Dave (sorry)' },
      ],
    }
    expect(applyMorphs(base, [relabel], 200)[1].label).toBe('Dave')
    expect(applyMorphs(base, [relabel], 800)[1].label).toBe('Dave (sorry)')
  })

  it('uses the segment base value when a morph does not mention a property', () => {
    const result = applyMorphs(base, [swell], 500)
    expect(result[0].label).toBe('free beer')
  })

  it('holds the base label until a late keyframe rather than applying it from the start', () => {
    const lateReveal: Morph = {
      segmentId: 'dave',
      durationMs: 1000,
      keyframes: [{ at: 1, label: 'LOSER' }],
    }
    expect(applyMorphs(base, [lateReveal], 0)[1].label).toBe('Dave')
    expect(applyMorphs(base, [lateReveal], 400)[1].label).toBe('Dave')
    expect(applyMorphs(base, [lateReveal], 1000)[1].label).toBe('LOSER')
  })

  it('interpolates weight from the segment base when the first keyframe is late', () => {
    const lateSwell: Morph = {
      segmentId: 'beer',
      durationMs: 1000,
      keyframes: [{ at: 1, weight: 3 }],
    }
    expect(applyMorphs(base, [lateSwell], 0)[0].weight).toBeCloseTo(1)
    expect(applyMorphs(base, [lateSwell], 500)[0].weight).toBeCloseTo(2)
    expect(applyMorphs(base, [lateSwell], 1000)[0].weight).toBeCloseTo(3)
  })
})

describe('landingSegments', () => {
  it('resolves the distribution the pointer will actually meet', () => {
    const landing = landingSegments(base, [swell, vanish], 1000)
    expect(landing.find((s) => s.id === 'beer')?.weight).toBe(99)
    expect(landing.find((s) => s.id === 'dave')?.weight).toBe(0)
  })
})
