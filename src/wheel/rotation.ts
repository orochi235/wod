import { DEFAULT_SETTLE_CURVE, cssCurve, initialSlope, isSettleCurve } from './curve'
import type { Curve, Direction, Settle } from './types'

/** Everything about a spin's rotation. `SpinConfig` minus the morphs. */
export type RotationSpec = {
  durationMs: number
  fullSpins: number
  direction: Direction
  easing: Curve
  settle?: Settle
}

export type RotationTrack = {
  keyframes: Keyframe[]
  durationMs: number
  /**
   * Timeline easing. Linear whenever the keyframes carry their own curves — a
   * second easing over the top would compose with both intervals and undo the
   * handover the track solved for.
   */
  easing: string
  /** The angle the last keyframe holds, which is what the caller stores as the new rest. */
  to: number
}

/** One frame at 60Hz. A zero-length interval has no speed to hand over at. */
const MIN_SETTLE_MS = 16

/** Matches the `rotate(Ndeg)` the track emits, so the inverse reads its own values back. */
const ANGLE = /rotate\((-?[\d.]+)deg\)/

/**
 * The rotation a level element runs so its orientation stays put while its
 * anchor orbits. Same offsets, same easings, negated angles, offset by the
 * element's own resting rotation — derived from the rotor's track rather than
 * recomputed, so the two cannot drift apart.
 */
export function invertTrack(track: RotationTrack, restingDeg: number): Keyframe[] {
  return track.keyframes.map((frame) => {
    const match = ANGLE.exec(String(frame.transform ?? ''))
    const angle = match ? Number(match[1]) : 0
    return { ...frame, transform: `rotate(${restingDeg - angle}deg)` }
  })
}

const LINEAR: Curve = [0, 0, 1, 1]

/**
 * The rotation for one spin, as keyframes.
 *
 * `durationMs` is the time the animation will actually run, which reduced
 * motion shortens; `spec.durationMs` is what the operator authored. The settle
 * scales by their ratio, so a shortened spin is the same spin played faster
 * rather than one whose cruise has been eaten.
 *
 * Solving `v = delta / (C + k·S)`, where `k` is the reciprocal of the settle
 * curve's initial slope, is what makes the handover smooth by construction
 * rather than by tuning: see the "Solving it" section of
 * docs/superpowers/specs/2026-08-07-endless-spin-design.md.
 */
export function rotationTrack(
  from: number,
  restingDeg: number,
  spec: RotationSpec,
  durationMs: number = spec.durationMs,
): RotationTrack {
  const forward = (((restingDeg - from) % 360) + 360) % 360
  // The % 360 matters: without it a `forward` of exactly zero becomes a
  // spurious extra revolution.
  const backward = (360 - forward) % 360
  const delta =
    spec.direction === 'ccw' ? -(spec.fullSpins * 360 + backward) : spec.fullSpins * 360 + forward
  const to = from + delta

  if (!spec.settle || durationMs <= 0) {
    return {
      keyframes: [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }],
      durationMs,
      easing: cssCurve(spec.easing),
      to,
    }
  }

  const scale = spec.durationMs > 0 ? durationMs / spec.durationMs : 1
  const settleMs = Math.min(Math.max(spec.settle.ms * scale, MIN_SETTLE_MS), durationMs / 2)
  // A curve with no positive finite handover speed would divide the rotation by
  // zero or run it backwards. The parser rejects those, but a modifier or a
  // hand-built config never passed through it.
  const curve = isSettleCurve(spec.settle.curve) ? spec.settle.curve : DEFAULT_SETTLE_CURVE
  const k = 1 / initialSlope(curve)
  const cruiseMs = durationMs - settleMs
  const speed = delta / (cruiseMs + k * settleMs)
  const mid = from + speed * cruiseMs

  return {
    keyframes: [
      { offset: 0, transform: `rotate(${from}deg)`, easing: cssCurve(LINEAR) },
      { offset: cruiseMs / durationMs, transform: `rotate(${mid}deg)`, easing: cssCurve(curve) },
      { offset: 1, transform: `rotate(${to}deg)` },
    ],
    durationMs,
    easing: cssCurve(LINEAR),
    to,
  }
}
