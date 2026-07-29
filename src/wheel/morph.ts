import type { EasingName, Media, Morph, MorphKeyframe, Segment } from './types'

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
}

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

type Defined<K extends keyof MorphKeyframe> = MorphKeyframe & Record<K, NonNullable<MorphKeyframe[K]>>

function pointsFor<K extends keyof MorphKeyframe>(
  keyframes: MorphKeyframe[],
  key: K,
): Defined<K>[] {
  return [...keyframes]
    .sort((a, b) => a.at - b.at)
    .filter((k): k is Defined<K> => k[key] !== undefined)
}

/** Finds the pair of keyframes bracketing `p`, plus how far between them it sits. */
function bracket<K extends keyof MorphKeyframe>(
  points: Defined<K>[],
  p: number,
): { from: Defined<K>; to: Defined<K>; t: number } | null {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  if (p <= first.at) return { from: first, to: first, t: 0 }
  if (p >= last.at) return { from: last, to: last, t: 1 }
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    if (p >= from.at && p <= to.at) {
      const span = to.at - from.at
      return { from, to, t: span === 0 ? 1 : (p - from.at) / span }
    }
  }
  return { from: last, to: last, t: 1 }
}

function sampleWeight(keyframes: MorphKeyframe[], p: number): number | undefined {
  const found = bracket(pointsFor(keyframes, 'weight'), p)
  if (!found) return undefined
  return found.from.weight + (found.to.weight - found.from.weight) * found.t
}

function sampleColor(keyframes: MorphKeyframe[], p: number): string | undefined {
  const found = bracket(pointsFor(keyframes, 'color'), p)
  if (!found) return undefined
  return lerpColor(found.from.color, found.to.color, found.t)
}

/** Discrete properties take the most recent keyframe rather than blending. */
function sampleStep<K extends 'label' | 'media'>(
  keyframes: MorphKeyframe[],
  key: K,
  p: number,
): MorphKeyframe[K] | undefined {
  const points = pointsFor(keyframes, key)
  if (points.length === 0) return undefined
  let value = points[0][key]
  for (const point of points) {
    if (point.at <= p) value = point[key]
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
      const weight = sampleWeight(morph.keyframes, p)
      if (weight !== undefined) out.weight = weight
      const color = sampleColor(morph.keyframes, p)
      if (color !== undefined) out.color = color
      const label = sampleStep(morph.keyframes, 'label', p)
      if (label !== undefined) out.label = label as string
      const media = sampleStep(morph.keyframes, 'media', p)
      if (media !== undefined) out.media = media as Media
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
