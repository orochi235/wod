import { bracket } from '../keyframes/bracket'
import type { Presence, PresentationKeyframe } from './types'

/** A wedge sitting in its arc with nothing applied. */
// Handed out by identity to every resting wedge, so a consumer writing into one
// sample would move them all.
export const RESTING: Presence = Object.freeze({
  hold: 1,
  opacity: 1,
  scale: 1,
  offset: 0,
  rotate: 0,
  aperture: 1,
})

const KEYS = ['hold', 'opacity', 'scale', 'offset', 'offsetAngle', 'rotate', 'aperture'] as const

/** hold and aperture are documented as 0…1; base is chain-fed across interrupts, so an out-of-range sample would otherwise ride forward indefinitely. */
const UNIT_KEYS = new Set(['hold', 'aperture'])

function clampUnit(key: (typeof KEYS)[number], value: number): number {
  return UNIT_KEYS.has(key) ? Math.min(1, Math.max(0, value)) : value
}

type Point = { at: number; value: number }

function pointsFor(frames: PresentationKeyframe[], key: (typeof KEYS)[number]): Point[] {
  return frames
    .filter((frame) => frame[key] !== undefined)
    .map((frame) => ({ at: frame.at, value: frame[key] as number }))
    .sort((a, b) => a.at - b.at)
}

export function declaresHold(frames: PresentationKeyframe[]): boolean {
  return frames.some((frame) => frame.hold !== undefined)
}

/**
 * `base` supplies every property the keyframes do not mention, and stands in
 * for a missing frame at 0. Passing the current sample rather than RESTING is
 * what lets one transition interrupt another without snapping.
 */
export function samplePresence(
  frames: PresentationKeyframe[],
  p: number,
  base: Presence,
): Presence {
  const out = { ...base }
  for (const key of KEYS) {
    const points = pointsFor(frames, key)
    if (points.length === 0) continue
    const withBase = points[0].at > 0 ? [{ at: 0, value: base[key] ?? 0 }, ...points] : points
    const found = bracket(withBase, p)
    if (!found) continue
    out[key] = clampUnit(key, found.from.value + (found.to.value - found.from.value) * found.t)
  }
  return out
}
