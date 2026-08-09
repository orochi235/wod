import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTLE_CURVE, parseCurve } from './curve'
import { type RotationSpec, type RotationTrack, rotationTrack } from './rotation'
import type { Curve } from './types'

const SPEC: RotationSpec = {
  durationMs: 4000,
  fullSpins: 5,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
}

const WITH_SETTLE: RotationSpec = { ...SPEC, settle: { ms: 1000, curve: DEFAULT_SETTLE_CURVE } }

/** The resting angle the plan asked for, plus the revolutions, for a cw spin from 0. */
const LANDING = 5 * 360 + 90

const degreesOf = (keyframe: Keyframe): number =>
  Number(/rotate\((-?[\d.]+(?:e[+-]?\d+)?)deg\)/i.exec(String(keyframe.transform))?.[1])

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360

/** y at x for a CSS cubic-bezier, by bisection on the parametric x. */
function bezierY(curve: Curve, x: number): number {
  const [x1, y1, x2, y2] = curve
  const at = (a: number, b: number, t: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (at(x1, x2, mid) < x) lo = mid
    else hi = mid
  }
  return at(y1, y2, (lo + hi) / 2)
}

/**
 * The angle the track actually puts on screen at `ms`, per-keyframe easing
 * included. This is what makes the continuity assertion a measurement of the
 * animation rather than a restatement of the formula that produced it.
 */
function angleAt(track: RotationTrack, ms: number): number {
  const frames = track.keyframes
  const t = ms / track.durationMs
  for (let i = 0; i < frames.length - 1; i++) {
    const start = Number(frames[i].offset ?? i / (frames.length - 1))
    const end = Number(frames[i + 1].offset ?? (i + 1) / (frames.length - 1))
    if (t > end && i < frames.length - 2) continue
    const curve = parseCurve(frames[i].easing ?? 'linear') as Curve
    const from = degreesOf(frames[i])
    const to = degreesOf(frames[i + 1])
    return from + (to - from) * bezierY(curve, (t - start) / (end - start))
  }
  return degreesOf(frames[frames.length - 1])
}

describe('rotationTrack', () => {
  it('leaves the single-curve rotation alone when there is no settle', () => {
    const track = rotationTrack(0, 90, SPEC)
    expect(track.keyframes).toHaveLength(2)
    expect(track.durationMs).toBe(4000)
    expect(degreesOf(track.keyframes[0])).toBe(0)
    expect(degreesOf(track.keyframes[1])).toBe(LANDING)
    expect(track.to).toBe(LANDING)
    // The authored launch curve still governs the whole rotation here. Dropping
    // it in favor of a linear timeline would flatten every spin that has no settle.
    expect(track.easing).toBe('cubic-bezier(0.1, 0.8, 0.2, 1)')
  })

  it('resumes from wherever the last spin rested', () => {
    const track = rotationTrack(200, 90, SPEC)
    expect(degreesOf(track.keyframes[0])).toBe(200)
    // 90° is behind 200°, so reaching it costs 250° on top of the revolutions.
    expect(track.to).toBe(200 + 5 * 360 + 250)
    expect(wrap360(track.to)).toBeCloseTo(90, 9)
  })

  it('breaks a cruise into a settle and still lands on the planned angle', () => {
    const track = rotationTrack(0, 90, WITH_SETTLE)
    expect(track.keyframes).toHaveLength(3)
    expect(Number(track.keyframes[1].offset)).toBeCloseTo(3000 / 4000, 9)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
    expect(track.to).toBeCloseTo(LANDING, 6)
    // The cruise is linear by construction; only the settle bends. The launch
    // curve is deliberately unused here — a bend before the cruise would need a
    // handover of its own, which is the wind-up phase the design set aside.
    expect(track.keyframes[0].easing).toBe('cubic-bezier(0, 0, 1, 1)')
    expect(track.keyframes[1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
    expect(track.easing).toBe('cubic-bezier(0, 0, 1, 1)')
  })

  it('turns more than the requested revolutions to buy the cruise its speed', () => {
    // The turn count is what absorbs the speed solve, so the track may travel
    // further than `fullSpins` — but never less, or the wheel would look slow.
    const track = rotationTrack(0, 90, WITH_SETTLE)
    expect(track.to).toBeGreaterThanOrEqual(5 * 360)
  })

  it('hands the settle exactly the speed the cruise was holding', () => {
    // The property the whole design exists to hold. A stutter here is the joke
    // reading as a dropped frame.
    const track = rotationTrack(0, 90, WITH_SETTLE)
    const handover = 3000
    const step = 0.25
    const before = (angleAt(track, handover) - angleAt(track, handover - step)) / step
    const after = (angleAt(track, handover + step) - angleAt(track, handover)) / step
    expect(before).toBeGreaterThan(0)
    expect(after / before).toBeCloseTo(1, 2)
  })

  it('turns backwards for a counter-clockwise settle spin and lands on the same angle', () => {
    const cw = rotationTrack(0, 90, WITH_SETTLE)
    const ccw = rotationTrack(0, 90, { ...WITH_SETTLE, direction: 'ccw' })
    expect(ccw.to).toBeLessThan(0)
    expect(wrap360(ccw.to)).toBeCloseTo(wrap360(cw.to), 6)
    // The middle keyframe is on the way there, not past it — the sign trap.
    expect(degreesOf(ccw.keyframes[1])).toBeLessThan(0)
    expect(degreesOf(ccw.keyframes[1])).toBeGreaterThan(ccw.to)
  })

  it('clamps a settle longer than the spin to half of it', () => {
    const track = rotationTrack(0, 90, {
      ...SPEC,
      settle: { ms: 9000, curve: DEFAULT_SETTLE_CURVE },
    })
    expect(Number(track.keyframes[1].offset)).toBeCloseTo(0.5, 9)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
  })

  it('has nothing to solve when the animation has no length', () => {
    // Not reachable through the parser, which floors the duration above zero —
    // but a zero denominator here would put `rotate(NaNdeg)` on the wheel.
    const track = rotationTrack(0, 90, WITH_SETTLE, 0)
    expect(track.keyframes).toHaveLength(2)
    expect(degreesOf(track.keyframes[1])).toBe(LANDING)
  })

  it('floors a zero settle to a frame rather than a zero-length interval', () => {
    const track = rotationTrack(0, 90, { ...SPEC, settle: { ms: 0, curve: DEFAULT_SETTLE_CURVE } })
    expect(Number(track.keyframes[1].offset)).toBeCloseTo((4000 - 16) / 4000, 9)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
  })

  it('keeps the settle proportional when the duration collapses', () => {
    // Reduced motion. Without scaling, a 1000ms settle swallows a 300ms spin
    // and the fake-out becomes an ordinary short spin.
    const full = rotationTrack(0, 90, WITH_SETTLE)
    const reduced = rotationTrack(0, 90, WITH_SETTLE, 300)
    expect(reduced.durationMs).toBe(300)
    expect(Number(reduced.keyframes[1].offset)).toBeCloseTo(Number(full.keyframes[1].offset), 9)
    expect(degreesOf(reduced.keyframes[2])).toBeCloseTo(LANDING, 6)
  })

  it('lands exactly on the resting angle even when the settle overshoots it', () => {
    const track = rotationTrack(0, 90, {
      ...SPEC,
      settle: { ms: 1000, curve: [0.33, 1.4, 0.68, 1] },
    })
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
    // And it really does go past, so the assertion above is about the landing
    // rather than about a curve that happened not to overshoot.
    expect(angleAt(track, 3500)).toBeGreaterThan(LANDING)
  })

  it('falls back to the default settle curve rather than dividing by a zero slope', () => {
    const track = rotationTrack(0, 90, { ...SPEC, settle: { ms: 1000, curve: [0.5, 0, 0.68, 1] } })
    expect(track.keyframes[1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
    expect(degreesOf(track.keyframes[1])).toBeLessThan(LANDING)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
  })
})
