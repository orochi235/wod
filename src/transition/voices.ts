import { type Keyframe, type VoiceSpec, keys } from '@msb235/blits'
import type { WedgePose } from '../clock/motion'
import { EASINGS } from '../keyframes/easing'
import type { EasingName } from '../wheel/types'
import type { PresencePose } from './channels'
import type { Presence, PresentationKeyframe } from './types'

/** A wedge sitting in its arc with nothing applied. */
// Handed out by identity to every resting wedge, so a consumer writing into one
// sample would move them all.
export const RESTING: Presence = Object.freeze({
  share: 1,
  opacity: 1,
  scale: 1,
  offset: 0,
  rotate: 0,
  aperture: 1,
})

const KEYS = ['share', 'opacity', 'scale', 'offset', 'offsetAngle', 'rotate', 'aperture'] as const
type Key = (typeof KEYS)[number]

export type PresencePlan = {
  frames: PresentationKeyframe[]
  delayMs: number
  durationMs: number
  /** Absent means `easeOut`, the curve the entrance path has always run on. */
  easing?: EasingName
}

const declares = (frames: PresentationKeyframe[], key: Key): boolean =>
  frames.some((frame) => frame[key] !== undefined)

/**
 * The frames as one `keys` patch's stops. `from` is where an interrupted wedge
 * stands, null for a fresh start. Every channel gets a stop at 0: blits holds a
 * channel's first stop before it, where the old sampler ramped from the base.
 */
export function stopsOf(
  frames: PresentationKeyframe[],
  moment: 'enter' | 'exit',
  from: Presence | null,
): Keyframe<WedgePose>[] {
  const byAt = new Map<number, Partial<PresencePose>>()
  const put = (at: number, key: Key, value: number) => {
    const delta = byAt.get(at) ?? {}
    delta[key] = value
    byAt.set(at, delta)
  }
  const start = from ?? RESTING

  for (const key of KEYS) {
    const points = frames.filter((frame) => frame[key] !== undefined).sort((a, b) => a.at - b.at)
    if (points.length === 0) continue
    if (points[0].at > 0) put(0, key, start[key] ?? 0)
    for (const point of points) put(point.at, key, point[key] as number)
  }

  if (!declares(frames, 'share')) {
    put(0, 'share', start.share)
    put(1, 'share', moment === 'exit' ? 0 : 1)
  }

  // The interrupted voice is faded, so a channel this one is silent on would snap to rest.
  if (from) {
    for (const key of KEYS) {
      const value = from[key]
      if (key === 'share' || value === undefined || declares(frames, key)) continue
      put(0, key, value)
      put(1, key, moment === 'exit' ? value : (RESTING[key] ?? value))
    }
  }

  return [...byAt.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, delta]) => ({ at, delta: delta as Partial<WedgePose> }))
}

/** The voice that plays one wedge's transition, or null when it has no time to play. */
export function presenceVoice(
  id: string,
  plan: PresencePlan,
  moment: 'enter' | 'exit',
  now: number,
  from: Presence | null,
): VoiceSpec<string, WedgePose> | null {
  if (!(plan.durationMs > 0)) return null
  const spec: VoiceSpec<string, WedgePose> = {
    patch: keys<string, WedgePose>(plan.durationMs, stopsOf(plan.frames, moment, from), {
      ease: EASINGS[plan.easing ?? 'easeOut'],
    }),
    subjects: [id],
    start: now + plan.delayMs,
    loop: false,
    // An entrance, or any voice taking over a wedge mid-flight, shows its first frame
    // through its stagger; every one shows its last until wod takes the voice out.
    hold: moment === 'enter' || from ? 'both' : 'after',
    locus: `presence:${id}`,
  }
  if (from) spec.from = 'current'
  return spec
}

export function presenceOf(pose: PresencePose): Presence {
  const presence: Presence = {
    share: pose.share ?? 1,
    opacity: pose.opacity ?? 1,
    scale: pose.scale ?? 1,
    offset: pose.offset ?? 0,
    rotate: pose.rotate ?? 0,
    aperture: pose.aperture ?? 1,
  }
  if (pose.offsetAngle !== undefined) presence.offsetAngle = pose.offsetAngle
  return presence
}
