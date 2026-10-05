import { describe, expect, it } from 'vitest'
import { WHEEL } from '../clock/motion'
import { fakeMotion } from '../clock/testing'
import { angleVoice } from './anglePatch'
import { angleAt, withOutage } from './outage'
import { rotationTrack } from './rotation'
import type { RotationTrack } from './rotation'

const SETTLE = rotationTrack(30, 200, {
  durationMs: 4500,
  fullSpins: 6,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
  settle: { ms: 1000, curve: [0.33, 1, 0.68, 1] },
})
const OUTAGE = withOutage(SETTLE, { cruiseMs: 1500, sparkMs: 800 }).track

function cued(track: RotationTrack, start = 1000) {
  const fake = fakeMotion()
  fake.motion.wheel.cue(angleVoice(track, start))
  fake.motion.ticker.wake()
  const read = (t: number) => {
    fake.step(t)
    return fake.motion.wheel.probe(WHEEL)
  }
  return { ...fake, read }
}

describe('anglePatch', () => {
  for (const [name, track] of [
    ['a settle track', SETTLE],
    ['an outage track', OUTAGE],
  ] as const) {
    it(`matches the rotation model through ${name}`, () => {
      const { read } = cued(track)
      for (const share of [0, 0.25, 0.5, 0.75, 1]) {
        const ms = share * track.durationMs
        expect(read(1000 + ms).angle).toBeCloseTo(angleAt(track, ms), 6)
      }
    })
  }

  it('holds the resting angle long after the track ends, and lets the clock sleep', () => {
    const { read, waiting } = cued(SETTLE)
    read(1000 + SETTLE.durationMs)
    const held = read(1000 + SETTLE.durationMs + 5000)
    expect(held.angle).toBeCloseTo(SETTLE.to, 6)
    expect((((held.angle ?? 0) % 360) + 360) % 360).toBeCloseTo(200, 6)
    expect(held.speed).toBe(0)
    read(1000 + SETTLE.durationMs + 5016)
    expect(waiting()).toBe(false)
  })

  it('jumps straight to where the track is after a hidden tab', () => {
    const { read } = cued(SETTLE)
    read(1016)
    expect(read(1016 + 4000).angle).toBeCloseTo(angleAt(SETTLE, 4016), 6)
  })

  it('reports the track slope as speed, in degrees per millisecond', () => {
    const { read } = cued(SETTLE)
    for (const ms of [100, 2000, 3800]) {
      const slope = angleAt(SETTLE, ms + 1) - angleAt(SETTLE, ms)
      expect(read(1000 + ms).speed).toBeCloseTo(slope, 6)
    }
  })

  it('is signed the way the wheel turns', () => {
    const ccw = rotationTrack(30, 200, {
      durationMs: 4500,
      fullSpins: 6,
      direction: 'ccw',
      easing: [0.1, 0.8, 0.2, 1],
    })
    const { read } = cued(ccw)
    expect(read(1000 + 1000).speed).toBeLessThan(0)
  })
})
