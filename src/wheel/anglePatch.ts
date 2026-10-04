import { type Patch, patch } from '@msb235/blits'
import type { WheelPose } from '../clock/motion'
import { angleAt } from './outage'
import type { RotationTrack } from './rotation'

/** The step the slope is read over, ms. One is short against any curve a spin uses. */
const SLOPE_MS = 1

/**
 * The rotor's track as a voice: where the wheel is and how fast it turns, from the
 * same keyframes WAAPI plays. Cue it from the animation's own start time with
 * `hold: 'after'`, and the angle stays on the resting angle until it is faded.
 */
export function anglePatch(track: RotationTrack): Patch<string, WheelPose, void> {
  const total = track.durationMs
  return patch<string, WheelPose>(
    Math.max(1, total),
    (phase) => {
      if (phase >= 1 || total <= 0) return { angle: angleAt(track, total), speed: 0 }
      const ms = phase * total
      const angle = angleAt(track, ms)
      return { angle, speed: (angleAt(track, ms + SLOPE_MS) - angle) / SLOPE_MS }
    },
    { writes: ['angle', 'speed'] },
  )
}
