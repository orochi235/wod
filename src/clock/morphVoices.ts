import { type Handle, type Keyframe, type Mix, type VoiceSpec, keys } from '@msb235/blits'
import { EASINGS, EASING_INVERSES } from '../keyframes/easing'
import { hexNumber } from '../wheel/hex'
import type { Morph, MorphKeyframe, Segment } from '../wheel/types'
import type { WedgePose } from './motion'

type Stop = Keyframe<WedgePose>
type Spec = VoiceSpec<string, WedgePose>

/**
 * A morph's stops, for one channel, on blits' time axis. A morph eases its whole timeline and its
 * stops sit on eased progress; blits eases each segment, so each stop moves to the time the morph
 * reaches it, and each segment takes the slice of the morph's curve that falls inside it.
 */
function stopsFor(
  morph: Morph,
  pick: (frame: MorphKeyframe) => Partial<WedgePose> | undefined,
  implicit: Partial<WedgePose> | undefined,
): Stop[] {
  const name = morph.easing ?? 'linear'
  const ease = EASINGS[name]
  const time = (p: number) => EASING_INVERSES[name](Math.min(1, Math.max(0, p)))

  const points = [...morph.keyframes]
    .sort((a, b) => a.at - b.at)
    .flatMap((frame) => {
      const delta = pick(frame)
      return delta ? [{ p: frame.at, delta }] : []
    })
  if (points.length === 0) return []
  // A missing 0% stop starts from the wedge's base, as Web Animations does.
  if (points[0].p > 0 && implicit) points.unshift({ p: 0, delta: implicit })

  return points.map(({ p, delta }, i) => {
    const prev = points[i - 1]?.p
    if (prev === undefined || name === 'linear' || p === prev) return { at: time(p), delta }
    const t0 = time(prev)
    const t1 = time(p)
    return {
      at: t1,
      delta,
      ease: (u: number) => (ease(t0 + u * (t1 - t0)) - prev) / (p - prev),
    }
  })
}

/** One morph as up to three voices, each only for the channels it touches. */
export function morphVoices(morph: Morph, base: Segment, startAt: number, rate = 1): Spec[] {
  const period = Math.max(1, morph.durationMs)
  const voice = (stops: Stop[], locus?: string): Spec => ({
    patch: keys<string, WedgePose>(period, stops),
    subjects: [morph.segmentId],
    // A zero-length morph is over the moment it starts.
    start: morph.durationMs > 0 ? startAt : startAt - period,
    rate,
    loop: false,
    hold: 'after',
    ...(locus ? { locus } : {}),
  })

  const weight = stopsFor(
    morph,
    (k) => (k.weight === undefined ? undefined : { weight: k.weight - base.weight }),
    { weight: 0 },
  )
  const baseColor = hexNumber(base.color)
  const color = stopsFor(
    morph,
    (k) => {
      const rgb = hexNumber(k.color)
      return rgb === undefined ? undefined : { color: rgb }
    },
    baseColor === undefined ? undefined : { color: baseColor },
  )
  // Steps, so easing is moot: only where each stop falls matters.
  const discrete = [
    ...stopsFor(morph, (k) => (k.label === undefined ? undefined : { label: k.label }), {
      label: base.label,
    }),
    ...stopsFor(
      morph,
      (k) => (k.media === undefined ? undefined : { media: k.media }),
      base.media ? { media: base.media } : undefined,
    ),
    ...stopsFor(morph, (k) => (k.reveal === undefined ? undefined : { reveal: k.reveal }), {
      reveal: base.reveal ?? null,
    }),
  ].map(({ at, delta }) => ({ at, delta }))

  const voices: Spec[] = []
  if (weight.length > 0) voices.push(voice(weight))
  if (color.length > 0) voices.push(voice(color, `color:${morph.segmentId}`))
  if (discrete.length > 0) voices.push(voice(discrete))
  return voices
}

/** Cues every morph whose wedge is in `segments`; a morph naming any other wedge is ignored. */
export function cueMorphs(
  wedges: Mix<string, WedgePose>,
  segments: Segment[],
  morphs: Morph[],
  startAt: number,
  rate = 1,
): Handle<string>[] {
  const byId = new Map(segments.map((segment) => [segment.id, segment]))
  return morphs.flatMap((morph) => {
    const base = byId.get(morph.segmentId)
    return base ? morphVoices(morph, base, startAt, rate).map((spec) => wedges.cue(spec)) : []
  })
}
