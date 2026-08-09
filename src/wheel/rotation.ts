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

const LINEAR: Curve = [0, 0, 1, 1]

/**
 * The rotation for one spin, as keyframes.
 *
 * `durationMs` is the time the animation will actually run, which reduced
 * motion shortens; `spec.durationMs` is what the operator authored. The settle
 * scales by their ratio, so a shortened spin is the same spin played faster
 * rather than one whose cruise has been eaten.
 *
 * With a settle, the cruise runs at a constant speed `v` and the settle covers
 * `v·k·S`, where `k = 1/slope` of the settle curve at its start. Solving
 * `v = delta / (C + k·S)` is what makes the handover smooth by construction:
 * the settle begins at exactly the speed the cruise ended at, and the last
 * keyframe is still the angle `planSpin` asked for. The revolutions are free to
 * absorb whatever `v` the solve wants, since any whole turn lands the same angle.
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

  if (!spec.settle) {
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
