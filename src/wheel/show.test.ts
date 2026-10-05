import { describe, expect, it } from 'vitest'
import { landingSegments } from './morph'
import { planShow } from './show'
import type { Segment, SpinConfig } from './types'

const segments: Segment[] = [
  { id: 'a', label: 'A', weight: 1 },
  { id: 'b', label: 'B', weight: 1 },
]
const config: SpinConfig = {
  durationMs: 4000,
  fullSpins: 3,
  direction: 'cw',
  easing: [0.2, 0.8, 0.3, 1],
  morphs: [],
}
const half = () => 0.5

describe('planShow', () => {
  it('turns from the given angle to the planned rest', () => {
    const show = planShow({ segments, config, rng: half, from: 90, durationMs: 4000 })
    expect(show?.track.keyframes[0].transform).toBe('rotate(90deg)')
    expect(show?.outagePlan).toBeNull()
    expect(show?.morphsAt).toBe(0)
  })

  it('prefixes an outage and starts the morphs once the wheel resumes', () => {
    const show = planShow({
      segments,
      config: { ...config, outage: { cruiseMs: 1000, sparkMs: 500 } },
      rng: half,
      from: 0,
      durationMs: 4000,
    })
    expect(show?.outagePlan).not.toBeNull()
    expect(show?.morphsAt).toBe(show?.outagePlan?.resumedAtMs)
    expect(show?.track.durationMs).toBe((show?.outagePlan?.resumedAtMs ?? 0) + 4000)
  })

  it('lands on the late morphs when a swap resolves them', () => {
    const late = [{ segmentId: 'a', durationMs: 4000, keyframes: [{ at: 1, label: 'Z' }] }]
    const show = planShow({
      segments,
      config,
      rng: half,
      from: 0,
      durationMs: 4000,
      resolveLate: () => late,
    })
    expect(show?.morphs).toBe(late)
    expect(show?.landedFrame).toEqual(landingSegments(segments, late, 4000))
  })
})
