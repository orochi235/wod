import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Motion } from '../clock/motion'
import type { RetainedIds } from '../wheel/colors'
import type { Arc } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { type EmitTarget, paintPresence, styleOf } from './css'
import { type Drawn, type Track, advance, drawList, release, retire, settle } from './tracks'
import type { Transitions } from './types'

export type WedgeRef = (id: string, target: EmitTarget) => (element: SVGGElement | null) => void

/** Which wedges are drawn on which arcs. Two frames of one shape differ only in what CSS carries. */
function shapeOf(drawn: Drawn[]): string {
  return drawn
    .map(({ segment, arc }) => `${segment.id}:${arc.start.toFixed(6)}:${arc.end.toFixed(6)}`)
    .join('|')
}

export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
  motion: Motion,
  retainedRef?: RetainedIds,
): { drawn: Drawn[]; wedgeRef: WedgeRef } {
  const { ticker, wedges } = motion
  const tracks = useRef(new Map<string, Track>())
  const arcs = useRef(new Map<string, Arc>())
  const shape = useRef('')
  const released = useRef(false)
  const elements = useRef(new Map<string, SVGGElement>()).current
  const targets = useRef(new Map<string, EmitTarget>()).current
  const refs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current
  const [, render] = useState(0)

  const now = ticker.now()
  wedges.sync(now)

  // Rendering, not an effect: the first painted frame has to already show the
  // transition's start, or every arrival flashes at rest before it begins.
  // Safe under StrictMode's double render only because `advance` is idempotent
  // for an unchanged roster — a second pass keeps tracks rather than recueing.
  tracks.current = held
    ? settle(tracks.current, segments, wedges)
    : advance({
        tracks: tracks.current,
        segments,
        arcs: arcs.current,
        transitions,
        now,
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        wedges,
      })

  const { drawn, arcs: laid } = drawList(tracks.current, wedges)
  arcs.current = laid
  shape.current = shapeOf(drawn)

  // Read by App during its own render, one pass stale on purpose: a late read
  // only delays releasing a swatch, never reuses one early.
  if (retainedRef) retainedRef.current = new Set(tracks.current.keys())

  const wedgeRef = useCallback<WedgeRef>(
    (id, target) => {
      targets.set(id, target)
      let ref = refs.get(id)
      if (!ref) {
        ref = (element) => {
          if (element) elements.set(id, element)
          else elements.delete(id)
        }
        refs.set(id, ref)
      }
      return ref
    },
    [elements, targets, refs],
  )

  const paint = useCallback(
    (list: Drawn[]) => {
      for (const { segment, presence } of list) {
        const element = elements.get(segment.id)
        const target = targets.get(segment.id)
        if (element && target) paintPresence(element, styleOf(presence, target))
      }
    },
    [elements, targets],
  )

  useLayoutEffect(() => {
    paint(drawn)
  })

  useEffect(() => {
    if (!wedges.inert) ticker.wake()
  })

  useEffect(() => {
    // StrictMode's remount comes after a release, with every voice gone: replay.
    if (released.current) {
      released.current = false
      render((n) => n + 1)
    }
    const off = ticker.subscribe(() => {
      const next = retire(tracks.current, wedges)
      if (next) {
        tracks.current = next
        render((n) => n + 1)
        return
      }
      const frame = drawList(tracks.current, wedges)
      if (shapeOf(frame.drawn) !== shape.current) render((n) => n + 1)
      else paint(frame.drawn)
    })
    return () => {
      off()
      release(tracks.current, wedges)
      tracks.current = new Map()
      arcs.current = new Map()
      released.current = true
    }
  }, [ticker, wedges, paint])

  return { drawn, wedgeRef }
}
