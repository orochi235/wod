import { mix } from '@msb235/blits'
import { hexString } from '../wheel/hex'
import type { Morph, Segment } from '../wheel/types'
import { cueMorphs } from './morphVoices'
import { type WedgePose, wedgeKit } from './motion'

/** A roster entry with its pose applied. Returns `base` itself when the pose changes nothing. */
export function composeSegment(base: Segment, pose: WedgePose): Segment {
  const weight = Math.max(0, base.weight + (pose.weight ?? 0))
  const color = pose.color === undefined ? base.color : hexString(pose.color)
  const label = pose.label ?? base.label
  const media = pose.media ?? base.media
  const reveal = pose.reveal === undefined ? base.reveal : (pose.reveal ?? undefined)
  if (
    weight === base.weight &&
    color === base.color &&
    label === base.label &&
    media === base.media &&
    reveal === base.reveal
  ) {
    return base
  }
  return { ...base, weight, color, label, media, reveal }
}

/** `wedges` is the mix, or a projection of it. */
export function composeSegments(
  segments: Segment[],
  wedges: { probe(subject: string): WedgePose },
): Segment[] {
  return segments.map((segment) => composeSegment(segment, wedges.probe(segment.id)))
}

/** Whether two frames draw the same wheel, so a frame that changed nothing skips a render. */
export function sameFrame(a: Segment[], b: Segment[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => {
      const o = b[i]
      return (
        s === o ||
        (s.id === o.id &&
          s.weight === o.weight &&
          s.color === o.color &&
          s.label === o.label &&
          s.media === o.media &&
          s.reveal === o.reveal)
      )
    })
  )
}

/** The wheel `ms` into a spin, from the same voices a live spin cues, on a mix of its own. */
export function segmentsAt(segments: Segment[], morphs: Morph[], ms: number): Segment[] {
  if (morphs.length === 0) return segments
  const scratch = mix<string, WedgePose>(wedgeKit)
  cueMorphs(scratch, segments, morphs, 0)
  scratch.sync(ms)
  return composeSegments(segments, scratch)
}
