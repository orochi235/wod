import { useEffect, useRef, useState } from 'react'
import type { Arc } from '../wheel/geometry'
import { DEFAULT_PALETTE, paletteColor } from '../wheel/palette'
import type { Segment } from '../wheel/types'
import { type Drawn, type Track, advance, drawList, isDone, settle } from './tracks'
import type { Transitions } from './types'

/**
 * Palette colors stick to an id rather than to a roster position, so a wedge
 * neither recolors when a neighbor leaves nor lands on the color the departing
 * wedge is still holding for the length of its exit.
 */
function withColor(
  segments: Segment[],
  colors: Map<string, string>,
  drawn: Set<string>,
): Segment[] {
  for (const id of [...colors.keys()]) {
    if (!drawn.has(id)) colors.delete(id)
  }
  const taken = new Set(colors.values())
  return segments.map((segment) => {
    if (segment.color !== undefined) return segment
    let color = colors.get(segment.id)
    if (color === undefined) {
      color = DEFAULT_PALETTE.find((swatch) => !taken.has(swatch)) ?? paletteColor(colors.size)
      colors.set(segment.id, color)
      taken.add(color)
    }
    return { ...segment, color }
  })
}

export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
): Drawn[] {
  const tracks = useRef(new Map<string, Track>())
  const arcs = useRef(new Map<string, Arc>())
  const colors = useRef(new Map<string, string>())
  const frame = useRef<number | null>(null)
  const [, tick] = useState(0)

  const now = performance.now()
  const colored = withColor(
    segments,
    colors.current,
    new Set([...segments.map((segment) => segment.id), ...tracks.current.keys()]),
  )

  // Rendering, not an effect: the first painted frame has to already show the
  // transition's start, or every arrival flashes at rest before it begins.
  // Safe under StrictMode's double render only because `advance` is idempotent
  // for an unchanged roster — a second pass keeps tracks rather than replanning.
  tracks.current = held
    ? settle(colored)
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
