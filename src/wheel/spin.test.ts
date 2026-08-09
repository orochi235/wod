import { describe, expect, it } from 'vitest'
import { angleToSegment, arcs, pointerTurn } from './geometry'
import { landingSegments } from './morph'
import { forced, weightedRandom } from './selection'
import type { Rng } from './selection'
import { planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

function lcg(seed: number): Rng {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const people: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1 },
  { id: 'b', label: 'Ben', weight: 1 },
  { id: 'c', label: 'Cal', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0.05 },
]

const config: SpinConfig = {
  durationMs: 4000,
  fullSpins: 5,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
  morphs: [],
}

const beerSwallowsTheWheel: Morph = {
  segmentId: 'beer',
  durationMs: 4000,
  keyframes: [
    { at: 0, weight: 0.05 },
    { at: 1, weight: 1 },
  ],
}

const everyoneElseVanishes: Morph[] = ['a', 'b', 'c'].map((id) => ({
  segmentId: id,
  durationMs: 4000,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 0 },
  ],
}))

describe('planSpin', () => {
  it('returns null when there is nothing to spin', () => {
    expect(planSpin([], config, weightedRandom, lcg(1))).toBeNull()
  })

  it('lands inside the winner arc under the landing geometry', () => {
    const rng = lcg(11)
    for (let i = 0; i < 500; i++) {
      const plan = planSpin(people, config, weightedRandom, rng)
      expect(plan).not.toBeNull()
      if (!plan) continue
      const landing = arcs(landingSegments(people, config.morphs, config.durationMs))
      expect(angleToSegment(landing, pointerTurn(plan.restingRotationDeg))).toBe(plan.winnerId)
    }
  })

  it('reports a resting angle inside a single revolution', () => {
    const plan = planSpin(people, config, weightedRandom, lcg(5))
    expect(plan?.restingRotationDeg).toBeGreaterThanOrEqual(0)
    expect(plan?.restingRotationDeg).toBeLessThan(360)
  })

  it('lands on the winner even when the geometry morphs during the spin', () => {
    const morphed: SpinConfig = {
      ...config,
      morphs: [beerSwallowsTheWheel, ...everyoneElseVanishes],
    }
    const plan = planSpin(people, morphed, weightedRandom, lcg(21))
    expect(plan).not.toBeNull()
    if (!plan) return
    const landing = arcs(landingSegments(people, morphed.morphs, morphed.durationMs))
    expect(angleToSegment(landing, pointerTurn(plan.restingRotationDeg))).toBe(plan.winnerId)
  })

  it('guarantees a wedge that grows to fill the circle wins', () => {
    const morphed: SpinConfig = {
      ...config,
      morphs: [beerSwallowsTheWheel, ...everyoneElseVanishes],
    }
    const rng = lcg(33)
    for (let i = 0; i < 200; i++) {
      expect(planSpin(people, morphed, weightedRandom, rng)?.winnerId).toBe('beer')
    }
  })

  it('never selects a segment that morphs to zero', () => {
    const morphed: SpinConfig = { ...config, morphs: everyoneElseVanishes }
    const rng = lcg(44)
    for (let i = 0; i < 200; i++) {
      expect(planSpin(people, morphed, weightedRandom, rng)?.winnerId).toBe('beer')
    }
  })

  it('lands on a rigged target', () => {
    const plan = planSpin(people, config, forced('beer'), lcg(8))
    expect(plan?.winnerId).toBe('beer')
    const landing = arcs(landingSegments(people, config.morphs, config.durationMs))
    expect(angleToSegment(landing, pointerTurn(plan?.restingRotationDeg ?? 0))).toBe('beer')
  })

  it('keeps the landing point away from the arc edges', () => {
    const rng = lcg(64)
    for (let i = 0; i < 300; i++) {
      const plan = planSpin(people, config, weightedRandom, rng)
      if (!plan) continue
      const landing = arcs(landingSegments(people, config.morphs, config.durationMs))
      const arc = landing.find((a) => a.id === plan.winnerId)
      if (!arc) throw new Error('winner has no arc')
      const width = arc.end - arc.start
      expect(plan.landingTurn).toBeGreaterThan(arc.start + width * 0.05)
      expect(plan.landingTurn).toBeLessThan(arc.end - width * 0.05)
    }
  })

  it('varies the landing point rather than always centering it', () => {
    const rng = lcg(77)
    const rigged = forced('a')
    const turns = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const plan = planSpin(people, config, rigged, rng)
      if (plan) turns.add(plan.landingTurn)
    }
    expect(turns.size).toBeGreaterThan(1)
  })
})
