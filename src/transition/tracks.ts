import { readNumber } from '../tricks/params'
import { type Arc, arcs as layoutArcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { getTransition } from './registry'
import { RESTING, declaresHold, samplePresence } from './sample'
import { fade } from './transitions/fade'
import type { Moment, Presence, PresentationKeyframe, Transitions } from './types'

export type Phase = 'entering' | 'present' | 'exiting'

export type Track = {
  id: string
  phase: Phase
  /** Last composed, so a departed wedge can still be drawn. */
  segment: Segment
  frames: PresentationKeyframe[]
  /** What the keyframes interpolate from wherever they are silent. */
  base: Presence
  startedAt: number
  delayMs: number
  durationMs: number
  declaresHold: boolean
  /** Where it sat when it left the layout, for drawing it once it holds no arc. */
  ghostArc: Arc | null
}

export type AdvanceInput = {
  tracks: Map<string, Track>
  /** The composed roster now. */
  segments: Segment[]
  /** Last frame's layout: where a departing wedge freezes, and the angle each transition points from. */
  arcs: Map<string, Arc>
  transitions: Transitions | undefined
  now: number
  reduced: boolean
}

export function isDone(track: Track, now: number): boolean {
  if (track.phase === 'present') return true
  return now - track.startedAt >= track.delayMs + track.durationMs
}

/** A phase whose animation is still running, and so can be interrupted. */
function inFlight(track: Track, now: number): boolean {
  return track.phase !== 'present' && !isDone(track, now)
}

function progressOf(track: Track, now: number): number {
  const elapsed = now - track.startedAt - track.delayMs
  if (elapsed <= 0) return 0
  return track.durationMs <= 0 ? 1 : Math.min(1, elapsed / track.durationMs)
}

export function sampleTrack(track: Track, now: number): Presence {
  if (track.phase === 'present') return RESTING
  // A wedge waiting out its stagger delay sits at p 0, which is its interrupted
  // sample once a zero frame has been dropped and its declared start otherwise.
  const presence = samplePresence(track.frames, progressOf(track, now), track.base)
  if (!track.declaresHold) presence.hold = track.phase === 'exiting' ? 0 : 1
  return presence
}

/** Drops a declared zero frame so an interrupted transition resumes where it is. */
function withoutZeroFrame(frames: PresentationKeyframe[]): PresentationKeyframe[] {
  return frames.filter((frame) => frame.at > 0)
}

type Plan = { frames: PresentationKeyframe[]; delayMs: number; durationMs: number }

function planTrack(
  transitions: Transitions | undefined,
  moment: Moment,
  index: number,
  count: number,
  angle: number,
  reduced: boolean,
): Plan | null {
  const instance = transitions?.[moment]
  if (!instance) return null
  const authored = getTransition(instance.id)
  if (!authored) return null
  // A stored preset can arm any transition at any moment, including one it does
  // not serve; no registered transition refuses a moment yet, so this is untested.
  if (!authored.moments.includes(moment)) return null

  const transition = reduced ? fade : authored
  const params = reduced ? { staggerMs: 0 } : instance.params
  const durationMs = reduced
    ? REDUCED_MOTION_MS
    : readNumber(instance.params, 'durationMs', readNumber(transition.defaults, 'durationMs', 400))

  const { keyframes, delayMs } = transition.frames(params, {
    index,
    count,
    angle,
    durationMs,
    moment,
  })
  return { frames: keyframes, delayMs, durationMs }
}

function angleOf(arc: Arc | undefined): number {
  if (!arc) return 0
  return (arc.start + (arc.end - arc.start) / 2) * 360
}

function restingTrack(segment: Segment): Track {
  return {
    id: segment.id,
    phase: 'present',
    segment,
    frames: [],
    base: RESTING,
    startedAt: 0,
    delayMs: 0,
    durationMs: 0,
    declaresHold: false,
    ghostArc: null,
  }
}

/**
 * Diffs the composed roster against the tracks already drawn. A transition
 * starting on a wedge that is still animating takes that wedge's current sample
 * as its base and drops its own frame at 0, so the two interpolate into each
 * other instead of the second one snapping to its declared start.
 */
export function advance(input: AdvanceInput): Map<string, Track> {
  const { tracks, segments, arcs, transitions, now, reduced } = input
  const next = new Map<string, Track>()
  const count = segments.length

  segments.forEach((segment, index) => {
    const existing = tracks.get(segment.id)

    if (existing && existing.phase !== 'exiting') {
      next.set(segment.id, {
        ...existing,
        segment,
        phase: isDone(existing, now) ? 'present' : existing.phase,
      })
      return
    }

    const interrupting = existing !== undefined && inFlight(existing, now)
    const plan = planTrack(
      transitions,
      'enter',
      index,
      count,
      angleOf(arcs.get(segment.id)),
      reduced,
    )
    if (!plan) {
      next.set(segment.id, restingTrack(segment))
      return
    }

    const frames = interrupting ? withoutZeroFrame(plan.frames) : plan.frames
    next.set(segment.id, {
      id: segment.id,
      phase: 'entering',
      segment,
      frames,
      base: interrupting ? sampleTrack(existing, now) : RESTING,
      startedAt: now,
      delayMs: plan.delayMs,
      durationMs: plan.durationMs,
      declaresHold: declaresHold(frames),
      // A reversal keeps the arc its exit froze: it may still be at hold 0, and
      // a wedge holding no arc has nowhere to be drawn without one.
      ghostArc: interrupting ? existing.ghostArc : null,
    })
  })

  const departing: [string, Track][] = []
  for (const [id, track] of tracks) {
    if (next.has(id)) continue
    if (track.phase === 'exiting') {
      if (!isDone(track, now)) next.set(id, track)
      continue
    }
    departing.push([id, track])
  }

  departing.forEach(([id, track], index) => {
    const interrupting = inFlight(track, now)
    const plan = planTrack(
      transitions,
      'exit',
      index,
      departing.length,
      angleOf(arcs.get(id)),
      reduced,
    )
    if (!plan) return

    const frames = interrupting ? withoutZeroFrame(plan.frames) : plan.frames
    next.set(id, {
      ...track,
      phase: 'exiting',
      frames,
      base: interrupting ? sampleTrack(track, now) : RESTING,
      startedAt: now,
      delayMs: plan.delayMs,
      durationMs: plan.durationMs,
      declaresHold: declaresHold(frames),
      ghostArc: arcs.get(id) ?? null,
    })
  })

  return next
}

export type Drawn = {
  segment: Segment
  arc: Arc
  presence: Presence
}

/**
 * A wedge still holding arc takes part in layout at `weight * hold`; one that
 * has released it is drawn where it last stood, so nothing else shifts as it
 * animates out.
 */
export function drawList(
  tracks: Map<string, Track>,
  now: number,
): { drawn: Drawn[]; arcs: Map<string, Arc> } {
  const sampled = [...tracks.values()].map((track) => ({
    track,
    presence: sampleTrack(track, now),
  }))

  const holding = sampled.filter((item) => item.presence.hold > 0)
  const laid = layoutArcs(
    holding.map((item) => ({
      id: item.track.id,
      weight: item.track.segment.weight * item.presence.hold,
    })),
  )

  const arcs = new Map<string, Arc>()
  const drawn: Drawn[] = []
  holding.forEach((item, index) => {
    const arc = laid[index]
    arcs.set(item.track.id, arc)
    drawn.push({ segment: item.track.segment, arc, presence: item.presence })
  })

  for (const item of sampled) {
    if (item.presence.hold > 0) continue
    // A wedge that released its arc before it was ever laid out has nowhere to
    // be drawn, which is the same as not being on the wheel.
    if (!item.track.ghostArc) continue
    drawn.push({ segment: item.track.segment, arc: item.track.ghostArc, presence: item.presence })
  }

  return { drawn, arcs }
}

/**
 * Everything at its target, now. A spin owns the geometry it is about to plan
 * against, so nothing may still be arriving or leaving underneath it.
 */
export function settle(tracks: Map<string, Track>): Map<string, Track> {
  const next = new Map<string, Track>()
  for (const [id, track] of tracks) {
    if (track.phase === 'exiting') continue
    next.set(id, restingTrack(track.segment))
  }
  return next
}
