import type { Handle, Mix } from '@msb235/blits'
import type { WedgePose } from '../clock/motion'
import { readNumber } from '../tricks/params'
import { type Arc, arcs as layoutArcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { getTransition } from './registry'
import { fade } from './transitions/fade'
import type { Moment, Presence, Transitions } from './types'
import { type PresencePlan, RESTING, presenceOf, presenceVoice } from './voices'

export type Phase = 'entering' | 'present' | 'exiting'

export type Wedges = Mix<string, WedgePose>

export type Track = {
  id: string
  phase: Phase
  /** Last composed, so a departed wedge can still be drawn. */
  segment: Segment
  /** The voice playing this phase; null for a wedge at rest. */
  voice: Handle<string> | null
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
  /** Synced to `now` by the caller. */
  wedges: Wedges
}

/** Played out: its voice holds its last frame, or it has none. */
export function isDone(track: Track): boolean {
  if (track.phase === 'present' || track.voice === null) return true
  return track.voice.state === 'held' || track.voice.state === 'done'
}

function inFlight(track: Track): boolean {
  return track.phase !== 'present' && !isDone(track)
}

function stop(track: Track): void {
  if (track.voice && track.voice.state !== 'done') track.voice.fade({ over: 0 })
}

function forget(wedges: Wedges, track: Track): void {
  stop(track)
  wedges.drop(track.id)
}

function promote(track: Track): Track {
  stop(track)
  return { ...track, phase: 'present', voice: null }
}

function planTrack(
  transitions: Transitions | undefined,
  moment: Moment,
  index: number,
  count: number,
  angle: number,
  reduced: boolean,
): PresencePlan | null {
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

  const { keyframes, delayMs, easing } = transition.frames(params, {
    index,
    count,
    angle,
    durationMs,
    moment,
  })
  return { frames: keyframes, delayMs, durationMs, easing }
}

function angleOf(arc: Arc | undefined): number {
  if (!arc) return 0
  return (arc.start + (arc.end - arc.start) / 2) * 360
}

function restingTrack(segment: Segment): Track {
  return { id: segment.id, phase: 'present', segment, voice: null, ghostArc: null }
}

/**
 * Takes the wedge over from whatever it was playing. blits' `from: 'current'`
 * starts from the subject's last probe, so an interruption probes first.
 */
function start(
  wedges: Wedges,
  track: Track | undefined,
  id: string,
  plan: PresencePlan,
  moment: 'enter' | 'exit',
  now: number,
): Handle<string> | null {
  const from = track && inFlight(track) ? presenceOf(wedges.probe(id)) : null
  if (track) stop(track)
  const spec = presenceVoice(id, plan, moment, now, from)
  return spec ? wedges.cue(spec) : null
}

/**
 * Track order is layout order, so a wedge that has left the roster has to keep
 * the slot it held: appending it instead would swap it with every survivor
 * behind it on the frame it departs, before its exit has animated at all.
 */
function inPlace(
  next: Map<string, Track>,
  previous: Map<string, Track>,
  segments: Segment[],
): Map<string, Track> {
  const live = segments.map((segment) => segment.id).filter((id) => next.has(id))
  const liveIds = new Set(live)
  const held = [...next.keys()].filter((id) => !liveIds.has(id))
  if (held.length === 0) return next

  const heldIds = new Set(held)
  const behind = new Map<string, string[]>()
  const front: string[] = []
  let anchor: string | null = null
  for (const id of previous.keys()) {
    if (liveIds.has(id)) anchor = id
    else if (heldIds.has(id)) {
      if (anchor === null) front.push(id)
      else behind.set(anchor, [...(behind.get(anchor) ?? []), id])
    }
  }

  const ordered = new Map<string, Track>()
  const put = (id: string) => {
    const track = next.get(id)
    if (track) ordered.set(id, track)
  }
  front.forEach(put)
  for (const id of live) {
    put(id)
    behind.get(id)?.forEach(put)
  }
  return ordered
}

/**
 * Diffs the composed roster against the tracks already drawn, cueing a voice
 * for each wedge that starts arriving or leaving. A transition starting on a
 * wedge still in flight carries on from where that wedge stands.
 */
export function advance(input: AdvanceInput): Map<string, Track> {
  const { tracks, segments, arcs, transitions, now, reduced, wedges } = input
  const next = new Map<string, Track>()
  const count = segments.length

  segments.forEach((segment, index) => {
    const existing = tracks.get(segment.id)

    if (existing && existing.phase !== 'exiting') {
      const kept = { ...existing, segment }
      next.set(segment.id, existing.phase === 'entering' && isDone(existing) ? promote(kept) : kept)
      return
    }

    const plan = planTrack(
      transitions,
      'enter',
      index,
      count,
      angleOf(arcs.get(segment.id)),
      reduced,
    )
    const voice = plan && start(wedges, existing, segment.id, plan, 'enter', now)
    if (!voice) {
      if (existing) stop(existing)
      next.set(segment.id, restingTrack(segment))
      return
    }
    next.set(segment.id, {
      id: segment.id,
      phase: 'entering',
      segment,
      voice,
      // A reversal keeps the arc its exit froze: it may still be at share 0, and
      // a wedge holding no arc has nowhere to be drawn without one.
      ghostArc: existing ? existing.ghostArc : null,
    })
  })

  const departing: [string, Track][] = []
  for (const [id, track] of tracks) {
    if (next.has(id)) continue
    if (track.phase === 'exiting') {
      // `arcs` is last frame's layout, so it still names the arc a wedge held
      // right up to the frame its share reaches zero, and drops it after.
      if (isDone(track)) forget(wedges, track)
      else next.set(id, { ...track, ghostArc: arcs.get(id) ?? track.ghostArc })
      continue
    }
    departing.push([id, track])
  }

  departing.forEach(([id, track], index) => {
    const plan = planTrack(
      transitions,
      'exit',
      index,
      departing.length,
      angleOf(arcs.get(id)),
      reduced,
    )
    const voice = plan && start(wedges, track, id, plan, 'exit', now)
    if (!voice) {
      forget(wedges, track)
      return
    }
    next.set(id, { ...track, phase: 'exiting', voice, ghostArc: arcs.get(id) ?? null })
  })

  return inPlace(next, tracks, segments)
}

/**
 * Settles every voice that has played out: an entrance becomes present, an exit
 * leaves. Null when nothing has, so a frame that changes nothing renders nothing.
 */
export function retire(tracks: Map<string, Track>, wedges: Wedges): Map<string, Track> | null {
  let next: Map<string, Track> | null = null
  for (const [id, track] of tracks) {
    if (track.phase === 'present' || !isDone(track)) continue
    next ??= new Map(tracks)
    if (track.phase === 'exiting') {
      forget(wedges, track)
      next.delete(id)
    } else {
      next.set(id, promote(track))
    }
  }
  return next
}

export type Drawn = {
  segment: Segment
  arc: Arc
  presence: Presence
}

/**
 * Each wedge where the mix has it at its last sync. A wedge that has released
 * its arc is drawn where it last stood, so nothing else shifts as it animates out.
 */
export function drawList(
  tracks: Map<string, Track>,
  wedges: Wedges,
): { drawn: Drawn[]; arcs: Map<string, Arc> } {
  const sampled = [...tracks.values()].map((track) => ({
    track,
    presence: track.voice === null ? RESTING : presenceOf(wedges.probe(track.id)),
  }))

  const holding = sampled.filter((item) => item.presence.share > 0)
  const laid = layoutArcs(
    holding.map((item) => ({
      id: item.track.id,
      weight: item.track.segment.weight * item.presence.share,
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
    if (item.presence.share > 0) continue
    // A wedge that released its arc before it was ever laid out has nowhere to
    // be drawn, which is the same as not being on the wheel.
    if (!item.track.ghostArc) continue
    drawn.push({ segment: item.track.segment, arc: item.track.ghostArc, presence: item.presence })
  }

  return { drawn, arcs }
}

/**
 * Everything at its target, now. Built from the roster rather than from the
 * tracks: a spin owns the geometry it is about to plan against, so the drawn set
 * has to become exactly what it planned against, not whatever was mid-flight.
 */
export function settle(
  tracks: Map<string, Track>,
  segments: Segment[],
  wedges: Wedges,
): Map<string, Track> {
  const kept = new Set(segments.map((segment) => segment.id))
  for (const track of tracks.values()) {
    if (kept.has(track.id)) stop(track)
    else forget(wedges, track)
  }
  const next = new Map<string, Track>()
  for (const segment of segments) next.set(segment.id, restingTrack(segment))
  return next
}

/** Takes every voice out and forgets every wedge, for a wheel leaving the page. */
export function release(tracks: Map<string, Track>, wedges: Wedges): void {
  for (const track of tracks.values()) forget(wedges, track)
}
