import { useEffect, useRef, useState } from 'react'
import type { Arc } from '../wheel/geometry'
import { paletteColor } from '../wheel/palette'
import type { Segment } from '../wheel/types'
import { type Drawn, type Track, advance, drawList, isDone, settle } from './tracks'
import type { Transitions } from './types'

/** Freezes the palette color onto the segment, so a departed wedge keeps it. */
function withColor(segments: Segment[]): Segment[] {
  return segments.map((segment, index) =>
    segment.color === undefined ? { ...segment, color: paletteColor(index) } : segment,
  )
}

export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
): Drawn[] {
  const tracks = useRef(new Map<string, Track>())
  const arcs = useRef(new Map<string, Arc>())
  const frame = useRef<number | null>(null)
  const [, tick] = useState(0)

  const now = typeof performance === 'undefined' ? 0 : performance.now()
  const colored = withColor(segments)

  // Rendering, not an effect: the first painted frame has to already show the
  // transition's start, or every arrival flashes at rest before it begins.
  tracks.current = held
    ? settle(tracks.current)
    : advance({
        tracks: tracks.current,
        segments: colored,
        arcs: arcs.current,
        transitions,
        now,
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      })

  const { drawn, arcs: laid } = drawList(tracks.current, now)
  arcs.current = laid

  const running = [...tracks.current.values()].some((track) => !isDone(track, now))

  // Self-scheduling: `running` only changes on the frame the last track
  // finishes, so an effect that scheduled one frame per change would render
  // exactly twice and stop.
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
