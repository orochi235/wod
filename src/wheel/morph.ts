import { bracket } from '../keyframes/bracket'
import { EASINGS } from '../keyframes/easing'
import type { Media, Morph, MorphKeyframe, Reveal, Segment } from './types'

export function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

export function lerpColor(from: string, to: string, t: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  if (!a || !b) return t < 1 ? from : to
  const channels = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function morphProgress(morph: Morph, elapsedMs: number): number {
  const raw = morph.durationMs <= 0 ? 1 : elapsedMs / morph.durationMs
  const clamped = Math.min(1, Math.max(0, raw))
  return EASINGS[morph.easing ?? 'linear'](clamped)
}

type Defined<K extends keyof MorphKeyframe> = MorphKeyframe &
  Record<K, NonNullable<MorphKeyframe[K]>>

function pointsFor<K extends keyof MorphKeyframe>(
  keyframes: MorphKeyframe[],
  key: K,
): Defined<K>[] {
  return [...keyframes]
    .sort((a, b) => a.at - b.at)
    .filter((k): k is Defined<K> => k[key] !== undefined)
}

/**
 * If the first declared keyframe starts after 0, prepend an implicit keyframe
 * at `at: 0` holding the property's current base value. This matches Web
 * Animations semantics for a missing 0% offset, so a lone late keyframe (e.g.
 * `{ at: 1, label: 'LOSER' }`) reveals at the end instead of from the start.
 */
function withImplicitBase<K extends keyof MorphKeyframe>(
  points: Defined<K>[],
  key: K,
  base: MorphKeyframe[K] | undefined,
): Defined<K>[] {
  if (points.length === 0 || points[0].at <= 0 || base === undefined) return points
  const implicit = { at: 0, [key]: base } as Defined<K>
  return [implicit, ...points]
}

function sampleWeight(
  keyframes: MorphKeyframe[],
  p: number,
  base: number | undefined,
): number | undefined {
  const points = withImplicitBase(pointsFor(keyframes, 'weight'), 'weight', base)
  const found = bracket(points, p)
  if (!found) return undefined
  return found.from.weight + (found.to.weight - found.from.weight) * found.t
}

function sampleColor(
  keyframes: MorphKeyframe[],
  p: number,
  base: string | undefined,
): string | undefined {
  const points = withImplicitBase(pointsFor(keyframes, 'color'), 'color', base)
  const found = bracket(points, p)
  if (!found) return undefined
  return lerpColor(found.from.color, found.to.color, found.t)
}

/** Discrete properties take the most recent keyframe rather than blending. */
function sampleStep<K extends 'label' | 'media'>(
  keyframes: MorphKeyframe[],
  key: K,
  p: number,
  base: MorphKeyframe[K] | undefined,
): MorphKeyframe[K] | undefined {
  const points = withImplicitBase(pointsFor(keyframes, key), key, base)
  if (points.length === 0) return undefined
  let value = points[0][key]
  for (const point of points) {
    if (point.at <= p) value = point[key]
  }
  return value
}

type RevealKeyframe = MorphKeyframe & { reveal: Reveal | null }

/**
 * Discrete like label and media, but nullable, so a swap can trade a reveal away
 * to a wedge that has none. `sampleStep` cannot express that: its `NonNullable`
 * filter strips the null that carries the meaning.
 */
function sampleReveal(
  keyframes: MorphKeyframe[],
  p: number,
  base: Reveal | undefined,
): Reveal | null | undefined {
  const declared = [...keyframes]
    .sort((a, b) => a.at - b.at)
    .filter((k): k is RevealKeyframe => k.reveal !== undefined)
  if (declared.length === 0) return undefined
  const points = declared[0].at > 0 ? [{ at: 0, reveal: base ?? null }, ...declared] : declared
  let value = points[0].reveal
  for (const point of points) {
    if (point.at <= p) value = point.reveal
  }
  return value
}

export function applyMorphs(segments: Segment[], morphs: Morph[], elapsedMs: number): Segment[] {
  if (morphs.length === 0) return segments
  return segments.map((segment) => {
    const relevant = morphs.filter((m) => m.segmentId === segment.id)
    if (relevant.length === 0) return segment
    const out: Segment = { ...segment }
    for (const morph of relevant) {
      const p = morphProgress(morph, elapsedMs)
      const weight = sampleWeight(morph.keyframes, p, out.weight)
      if (weight !== undefined) out.weight = weight
      const color = sampleColor(morph.keyframes, p, out.color)
      if (color !== undefined) out.color = color
      const label = sampleStep(morph.keyframes, 'label', p, out.label)
      if (label !== undefined) out.label = label as string
      const media = sampleStep(morph.keyframes, 'media', p, out.media)
      if (media !== undefined) out.media = media as Media
      const reveal = sampleReveal(morph.keyframes, p, out.reveal)
      if (reveal === null) out.reveal = undefined
      else if (reveal !== undefined) out.reveal = reveal
    }
    return out
  })
}

/**
 * The weight distribution the pointer will meet when the wheel stops. Selection
 * samples this, never the launch distribution.
 */
export function landingSegments(
  segments: Segment[],
  morphs: Morph[],
  spinDurationMs: number,
): Segment[] {
  return applyMorphs(segments, morphs, spinDurationMs)
}
