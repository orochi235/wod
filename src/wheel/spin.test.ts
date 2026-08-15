import { describe, expect, it } from 'vitest'
import { angleToSegment, arcs, pointerTurn, restingRotationDeg } from './geometry'
import { landingSegments } from './morph'
import { forced, weightedRandom } from './selection'
import type { Rng } from './selection'
import { CATCH_REACH, caughtLandingTurn, planSpin } from './spin'
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

describe('caughtLandingTurn', () => {
  // Four pegs, at the quarters.
  const pegs = [0, 0.25, 0.5, 0.75]

  it('leaves a landing nowhere near a peg alone', () => {
    expect(caughtLandingTurn(0.375, pegs, 0.26, 0.49)).toBe(0.375)
  })

  it('pulls a landing that died against a peg off it', () => {
    const caught = caughtLandingTurn(0.2505, pegs, 0.1, 0.4)
    expect(Math.abs(caught - 0.25)).toBeCloseTo(CATCH_REACH)
  })

  it('never comes to rest on a peg, where the winner is a rounding question', () => {
    for (const peg of pegs) {
      const caught = caughtLandingTurn(peg, pegs, peg - 0.1, peg + 0.1)
      expect(Math.abs(caught - peg)).toBeCloseTo(CATCH_REACH)
    }
  })

  it('stays inside the arc it was given, so the winner cannot change', () => {
    // Only the forward side is inside the arc, so that is the side it takes.
    const caught = caughtLandingTurn(0.2505, pegs, 0.25, 0.45)
    expect(caught).toBeGreaterThanOrEqual(0.25)
    expect(caught).toBeLessThanOrEqual(0.45)
  })

  it('gives up on a wedge narrower than the arm', () => {
    // Neither side fits, so the landing stands rather than leaving the arc.
    expect(caughtLandingTurn(0.2505, pegs, 0.2504, 0.2506)).toBe(0.2505)
  })

  it('leaves everything alone with no pegs', () => {
    expect(caughtLandingTurn(0.2505, [], 0.1, 0.4)).toBe(0.2505)
  })

  it('catches a peg across the top of the wheel', () => {
    // The peg at turn 0 is also the peg at turn 1.
    const caught = caughtLandingTurn(0.999, pegs, 0.9, 0.999)
    expect(caught).toBeLessThan(0.999)
  })
})

describe('planSpin with a catching flapper', () => {
  const twoWay: Segment[] = [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
  ]
  const catchConfig: SpinConfig = { ...config, durationMs: 1000, fullSpins: 3 }

  it('plans a caught landing inside the winner it already chose', () => {
    // ben holds the second half; an rng of 0 lands at 0.54, which 50 evenly
    // spaced pegs put a peg exactly on. A bounds peg can never be caught: the
    // edge inset is wider than the arm's reach on any arc worth landing in.
    const plan = planSpin(
      twoWay,
      catchConfig,
      () => 'ben',
      () => 0,
      {
        kind: 'fixed',
        count: 50,
      },
    )
    expect(plan?.winnerId).toBe('ben')
    expect(plan?.landingTurn).toBeCloseTo(0.54 + CATCH_REACH)
    expect(plan?.landingTurn).toBeGreaterThan(0.5)
    expect(plan?.restingRotationDeg).toBe(restingRotationDeg(plan?.landingTurn ?? 0))
  })

  it('plans an untouched landing when no peg mode is given', () => {
    const plan = planSpin(
      twoWay,
      catchConfig,
      () => 'ben',
      () => 0,
    )
    expect(plan?.landingTurn).toBeCloseTo(0.5 + 0.5 * 0.08)
  })
})
