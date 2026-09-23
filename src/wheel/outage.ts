import { curveAt, parseCurve } from './curve'
import type { RotationTrack } from './rotation'
import type { Outage } from './types'

/**
 * Pop to chord in the show's sound: bar 115's downbeat plus the dead
 * air (fourteen beats), pinned by the schedule test. The show is cued to it, so
 * it is fixed rather than authored.
 */
export const DARK_MS = 11198

/**
 * Every moment of one outage, in real milliseconds from the start of the spin.
 * The outage is a prologue: the authored spin starts, unchanged, at `resumedAtMs`,
 * which is the moment the lights come back.
 */
export type OutagePlan = {
  sparkAtMs: number
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

const rotate = (deg: number): string => `rotate(${deg.toFixed(3)}deg)`

/**
 * Prefixes a spin with an outage: the wheel turns on at the spin's own launch
 * speed through the sparks, the pop and the whole dark, and runs straight into
 * the authored track when the lights come back.
 *
 * The prologue covers a whole number of turns, so the authored track starts
 * from the same angle mod 360 and needs no replanning to land where it was
 * going to. That rounding moves the pop by at most half a turn's time.
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

  let turns = Math.max(1, Math.round((speed * (Math.max(0, outage.cruiseMs) + DARK_MS)) / 360))
  while ((turns * 360) / speed < DARK_MS) turns += 1
  const resumedAtMs = (turns * 360) / speed
  const popAtMs = resumedAtMs - DARK_MS
  const plan: OutagePlan = {
    sparkAtMs: Math.max(0, popAtMs - Math.max(0, outage.sparkMs)),
    popAtMs,
    lightsAtMs: resumedAtMs,
    resumedAtMs,
  }

  const turned = sign * turns * 360
  const durationMs = resumedAtMs + track.durationMs
  const at = (ms: number) => ms / durationMs
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
    track: {
      keyframes: [{ offset: 0, transform: rotate(start), easing: 'linear' }, ...authored],
      durationMs,
      easing: 'linear',
      to: track.to + turned,
    },
    plan,
  }
}

/** Where in the authored spin real time `ms` falls. Morphs wait out the prologue. */
export function spinTime(plan: OutagePlan | null, ms: number): number {
  return plan ? Math.max(0, ms - plan.resumedAtMs) : ms
}
