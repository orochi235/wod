import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTLE_CURVE } from './curve'
import { DARK_MS, angleAt, spinTime, withOutage } from './outage'
import { type RotationSpec, rotationTrack } from './rotation'

const SPEC: RotationSpec = {
  durationMs: 6000,
  fullSpins: 5,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
}

const SETTLED: RotationSpec = { ...SPEC, settle: { ms: 1500, curve: DEFAULT_SETTLE_CURVE } }
const CCW: RotationSpec = { ...SPEC, direction: 'ccw' }
const OUTAGE = { cruiseMs: 10000, sparkMs: 4000 }

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360

describe('withOutage', () => {
  for (const [name, spec] of [
    ['one curve', SPEC],
    ['a settle', SETTLED],
    ['counter-clockwise', CCW],
  ] as const) {
    it(`lands on the same resting angle, with ${name}`, () => {
      const track = rotationTrack(30, 90, spec)
      const { track: out, plan } = withOutage(track, OUTAGE)
      expect(wrap360(out.to)).toBeCloseTo(wrap360(track.to), 6)
      expect(angleAt(out, out.durationMs)).toBeCloseTo(out.to, 3)
      expect(out.durationMs).toBeCloseTo(plan.resumedAtMs + track.durationMs, 6)
    })

    it(`never turns backwards, with ${name}`, () => {
      const { track: out } = withOutage(rotationTrack(30, 90, spec), OUTAGE)
      const sign = spec.direction === 'ccw' ? -1 : 1
      let last = angleAt(out, 0)
      for (let ms = 10; ms <= out.durationMs; ms += 10) {
        const angle = angleAt(out, ms)
        expect(sign * (angle - last)).toBeGreaterThanOrEqual(-1e-6)
        last = angle
      }
    })
  }

  it('lays the phases end to end, cruising close to what was asked', () => {
    const { plan } = withOutage(rotationTrack(0, 90, SPEC), OUTAGE)
    expect(Math.abs(plan.popAtMs - 10000)).toBeLessThan(1000)
    expect(plan.lightsAtMs).toBeCloseTo(plan.popAtMs + DARK_MS, 6)
    expect(plan.resumedAtMs).toBe(plan.lightsAtMs)
    expect(plan.sparkAtMs).toBeCloseTo(plan.popAtMs - 4000, 6)
  })

  it('keeps turning at full speed through the dark', () => {
    const { track: out, plan } = withOutage(rotationTrack(0, 90, SPEC), OUTAGE)
    const early = angleAt(out, 1000) - angleAt(out, 0)
    const dark = angleAt(out, plan.popAtMs + 2000) - angleAt(out, plan.popAtMs + 1000)
    const late = angleAt(out, plan.lightsAtMs) - angleAt(out, plan.lightsAtMs - 1000)
    expect(dark).toBeCloseTo(early, 3)
    expect(late).toBeCloseTo(early, 3)
  })

  it('hands over into the authored spin at the speed it launches with', () => {
    const { track: out, plan } = withOutage(rotationTrack(0, 90, SPEC), OUTAGE)
    const before = angleAt(out, plan.resumedAtMs) - angleAt(out, plan.resumedAtMs - 16)
    const after = angleAt(out, plan.resumedAtMs + 16) - angleAt(out, plan.resumedAtMs)
    expect(after / before).toBeGreaterThan(0.9)
    expect(after / before).toBeLessThan(1.1)
  })

  it('never starts sparks before the spin does', () => {
    const { plan } = withOutage(rotationTrack(0, 90, SPEC), { cruiseMs: 500, sparkMs: 9000 })
    expect(plan.sparkAtMs).toBe(0)
  })
})

describe('spinTime', () => {
  it('holds the authored clock at zero until the prologue ends', () => {
    const { plan } = withOutage(rotationTrack(0, 90, SPEC), OUTAGE)
    expect(spinTime(plan, 5000)).toBe(0)
    expect(spinTime(plan, plan.resumedAtMs + 250)).toBeCloseTo(250, 6)
    expect(spinTime(null, 250)).toBe(250)
  })
})
