import { describe, expect, it } from 'vitest'
import { RESTING, declaresHold, samplePresence } from './sample'
import type { PresentationKeyframe } from './types'

const fadeIn: PresentationKeyframe[] = [
  { at: 0, opacity: 0 },
  { at: 1, opacity: 1 },
]

describe('samplePresence', () => {
  it('interpolates a declared property', () => {
    expect(samplePresence(fadeIn, 0.25, RESTING).opacity).toBeCloseTo(0.25)
  })

  it('leaves an undeclared property at its base', () => {
    expect(samplePresence(fadeIn, 0.5, RESTING).scale).toBe(1)
    expect(samplePresence(fadeIn, 0.5, { ...RESTING, scale: 0.5 }).scale).toBe(0.5)
  })

  it('interpolates from the base when the first frame arrives late', () => {
    const late: PresentationKeyframe[] = [{ at: 1, opacity: 0 }]
    const base = { ...RESTING, opacity: 0.5 }
    expect(samplePresence(late, 0.5, base).opacity).toBeCloseTo(0.25)
  })

  it('holds a property declared only once', () => {
    const frames: PresentationKeyframe[] = [
      { at: 0, offset: 1, offsetAngle: 137 },
      { at: 1, offset: 0 },
    ]
    expect(samplePresence(frames, 0.5, RESTING).offsetAngle).toBe(137)
  })

  it('samples every property independently', () => {
    const frames: PresentationKeyframe[] = [
      { at: 0, opacity: 0, scale: 0.5 },
      { at: 1, opacity: 1, scale: 1 },
    ]
    const presence = samplePresence(frames, 0.5, RESTING)
    expect(presence.opacity).toBeCloseTo(0.5)
    expect(presence.scale).toBeCloseTo(0.75)
  })

  it('sorts frames declared out of order', () => {
    const frames: PresentationKeyframe[] = [
      { at: 1, opacity: 1 },
      { at: 0, opacity: 0 },
    ]
    expect(samplePresence(frames, 0.25, RESTING).opacity).toBeCloseTo(0.25)
  })

  it('reports whether a list declares hold', () => {
    expect(declaresHold(fadeIn)).toBe(false)
    expect(declaresHold([{ at: 1, hold: 0 }])).toBe(true)
  })

  it('carries a property through an interrupt via base', () => {
    const grow: PresentationKeyframe[] = [
      { at: 0, scale: 1 },
      { at: 1, scale: 2 },
    ]
    const presenceA = samplePresence(grow, 0.5, RESTING)
    const fadeOut: PresentationKeyframe[] = [
      { at: 0, opacity: 1 },
      { at: 1, opacity: 0 },
    ]
    const presenceB = samplePresence(fadeOut, 0.5, presenceA)
    expect(presenceB.scale).toBe(presenceA.scale)
    expect(presenceB.scale).not.toBe(RESTING.scale)
  })

  it('does not mutate base', () => {
    const base = { ...RESTING, opacity: 0.5 }
    const snapshot = { ...base }
    samplePresence(fadeIn, 0.5, base)
    expect(base).toEqual(snapshot)
  })

  it('clamps hold to 0…1 at both ends', () => {
    const frames: PresentationKeyframe[] = [
      { at: 0, hold: -0.5 },
      { at: 1, hold: 1.5 },
    ]
    expect(samplePresence(frames, 0, RESTING).hold).toBe(0)
    expect(samplePresence(frames, 1, RESTING).hold).toBe(1)
  })
})
