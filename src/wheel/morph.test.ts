import { describe, expect, it } from 'vitest'
import { segmentsAt } from '../clock/compose'
import { landingSegments } from './morph'
import { weightedRandom } from './selection'
import { planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

const D = 1000
const roster: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1 },
  { id: 'b', label: 'Ben', weight: 1 },
  { id: 'x', label: 'Xan', weight: 1 },
]
const grow: Morph = {
  segmentId: 'x',
  durationMs: D,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 3 },
  ],
}
const vanish: Morph = {
  segmentId: 'x',
  durationMs: D,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 0 },
  ],
}

describe('landingSegments', () => {
  it('is the live frame at the end of the spin', () => {
    expect(landingSegments(roster, [grow, vanish], D)).toEqual(
      segmentsAt(roster, [grow, vanish], D),
    )
  })

  it('returns the roster itself when nothing morphs', () => {
    expect(landingSegments(roster, [], D)).toBe(roster)
  })

  it('lets a winner come from the blend', () => {
    // Later-wins would vanish x; blended, it grows by 2 and shrinks by 1.
    const landed = landingSegments(roster, [grow, vanish], D)
    expect(landed.find((s) => s.id === 'x')?.weight).toBe(2)

    const config: SpinConfig = {
      durationMs: D,
      fullSpins: 3,
      direction: 'cw',
      easing: [0, 0, 1, 1],
      morphs: [grow, vanish],
    }
    // Shares a 0.25, b 0.25, x 0.5: a roll of 0.9 falls in x.
    expect(planSpin(roster, config, weightedRandom, () => 0.9)?.winnerId).toBe('x')
  })
})
