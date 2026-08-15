import { useEffect, useRef, useState } from 'react'
import type { RetainedIds } from '../wheel/colors'
import type { Arc } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { type Drawn, type Track, advance, drawList, isDone, settle } from './tracks'
import type { Transitions } from './types'

export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
  retainedRef?: RetainedIds,
): Drawn[] {
  const tracks = useRef(new Map<string, Track>())
  const arcs = useRef(new Map<string, Arc>())
  const frame = useRef<number | null>(null)
  const [, tick] = useState(0)

  const now = performance.now()

  // Rendering, not an effect: the first painted frame has to already show the
  // transition's start, or every arrival flashes at rest before it begins.
  // Safe under StrictMode's double render only because `advance` is idempotent
  // for an unchanged roster — a second pass keeps tracks rather than replanning.
  tracks.current = held
    ? settle(segments)
    : advance({
        tracks: tracks.current,
        segments,
        arcs: arcs.current,
        transitions,
        now,
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      })

  const { drawn, arcs: laid } = drawList(tracks.current, now)
  arcs.current = laid

  // Read by App during its own render, one pass stale on purpose: a late read
  // only delays releasing a swatch, never reuses one early.
  if (retainedRef) retainedRef.current = new Set(tracks.current.keys())

  const running = [...tracks.current.values()].some((track) => !isDone(track, now))

  // Self-scheduling: `running` only changes on the frame the last track
  // finishes, so one frame per change would render twice and stop.
  useEffect(() => {
    if (!running) return
    let active = true
    const step = () => {
      if (!active) return
      tick((n) => n + 1)
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => {
      active = false
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [running])

  return drawn
}
