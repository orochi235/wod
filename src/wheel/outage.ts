import { curveAt, parseCurve } from './curve'
import type { RotationTrack } from './rotation'
import type { Outage } from './types'

/** How long the wheel takes to stop dead once the fault blows. */
export const BRAKE_MS = 400
/**
 * Pop to chord in the passage the sound imitates. The show is cued to it, so it
 * is fixed rather than authored.
 */
export const DARK_MS = 3390
/** Chord to full speed. */
export const RESTART_MS = 700

/**
 * Every moment of one outage, in real milliseconds from the start of the spin.
 * The outage is a prologue: the authored spin starts, unchanged, at `resumedAtMs`.
 */
export type OutagePlan = {
  sparkAtMs: number
  brakeAtMs: number
  popAtMs: number
  lightsAtMs: number
  resumedAtMs: number
}

const ANGLE = /rotate\((-?[\d.]+)deg\)/

const angleOf = (frame: Keyframe): number => Number(ANGLE.exec(String(frame.transform))?.[1] ?? 0)

const easeOf = (easing: unknown): ((x: number) => number) => {
  const curve = parseCurve(easing ?? 'linear')
  return curve ? (x) => curveAt(curve, x) : (x) => x
}

/** The angle a track puts on screen `ms` into it, keyframe easings included. */
export function angleAt(track: RotationTrack, ms: number): number {
  const frames = track.keyframes
  const offsets = frames.map((frame, i) =>
    typeof frame.offset === 'number' ? frame.offset : i / Math.max(1, frames.length - 1),
  )
  const p = easeOf(track.easing)(track.durationMs > 0 ? ms / track.durationMs : 1)
  let i = 0
  while (i < frames.length - 2 && p > offsets[i + 1]) i++
  const span = offsets[i + 1] - offsets[i]
  const local = span > 0 ? (p - offsets[i]) / span : 1
  const from = angleOf(frames[i])
  return from + (angleOf(frames[i + 1]) - from) * easeOf(frames[i].easing)(local)
}

/** Speed falling linearly to zero: position 2u − u², which is exactly this Bézier. */
const BRAKE_EASING = 'cubic-bezier(0.333333, 0.666667, 0.666667, 1)'
/** Speed rising linearly from zero: position u². */
const RESTART_EASING = 'cubic-bezier(0.333333, 0, 0.666667, 0.333333)'

const rotate = (deg: number): string => `rotate(${deg.toFixed(3)}deg)`

/**
 * Prefixes a spin with an outage: a cruise at the spin's own launch speed, a
 * brake to a dead stop, the dark, and a restart back up to that speed, after
 * which the authored track plays as it would have.
 *
 * The prologue covers a whole number of turns, so the authored track starts
 * from the same angle mod 360 and needs no replanning to land where it was
 * going to. That rounding moves the cruise by at most half a turn's time.
 */
export function withOutage(
  track: RotationTrack,
  outage: Outage,
): { track: RotationTrack; plan: OutagePlan } {
  const start = angleOf(track.keyframes[0])
  const sign = track.to >= start ? 1 : -1
  // The launch speed, so the handover into the authored spin has no kick. A
  // curve that launches from rest (ease-in) has none, so it gets the average.
  const average = Math.abs(track.to - start) / Math.max(1, track.durationMs)
  const launch = Math.abs(angleAt(track, 16) - start) / 16
  const speed = Math.max(launch, average, 1e-6)

  const ramps = (BRAKE_MS + RESTART_MS) / 2
  let turns = Math.max(1, Math.round((speed * (Math.max(0, outage.cruiseMs) + ramps)) / 360))
  let cruiseMs = (turns * 360) / speed - ramps
  if (cruiseMs < 0) {
    turns += 1
    cruiseMs = (turns * 360) / speed - ramps
  }

  const brakeAtMs = cruiseMs
  const popAtMs = brakeAtMs + BRAKE_MS
  const lightsAtMs = popAtMs + DARK_MS
  const resumedAtMs = lightsAtMs + RESTART_MS
  const plan: OutagePlan = {
    sparkAtMs: Math.max(0, popAtMs - Math.max(0, outage.sparkMs)),
    brakeAtMs,
    popAtMs,
    lightsAtMs,
    resumedAtMs,
  }

  const turned = sign * turns * 360
  const stopped = start + sign * speed * (cruiseMs + BRAKE_MS / 2)
  const durationMs = resumedAtMs + track.durationMs
  const at = (ms: number) => ms / durationMs

  const prologue: Keyframe[] = [
    { offset: 0, transform: rotate(start), easing: 'linear' },
    { offset: at(brakeAtMs), transform: rotate(stopped - sign * speed * (BRAKE_MS / 2)), easing: BRAKE_EASING },
    { offset: at(popAtMs), transform: rotate(stopped), easing: 'linear' },
    { offset: at(lightsAtMs), transform: rotate(stopped), easing: RESTART_EASING },
  ]
  const frames = track.keyframes
  const offsetOf = (frame: Keyframe, i: number) =>
    typeof frame.offset === 'number' ? frame.offset : i / Math.max(1, frames.length - 1)
  // A two-frame track eases on its timeline; here that easing moves onto its
  // interval, since the combined timeline has to run linear.
  const authored = frames.map((frame, i) => ({
    ...frame,
    offset: at(resumedAtMs + offsetOf(frame, i) * track.durationMs),
    transform: rotate(angleOf(frame) + turned),
    easing: String(frame.easing ?? (i < frames.length - 1 ? track.easing : 'linear')),
  }))

  return {
    track: { keyframes: [...prologue, ...authored], durationMs, easing: 'linear', to: track.to + turned },
    plan,
  }
}

/** Where in the authored spin real time `ms` falls. Morphs wait out the prologue. */
export function spinTime(plan: OutagePlan | null, ms: number): number {
  return plan ? Math.max(0, ms - plan.resumedAtMs) : ms
}
