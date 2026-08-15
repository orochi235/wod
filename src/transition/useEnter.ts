import { useEffect, useRef } from 'react'
import { readNumber } from '../tricks/params'
import { arcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { toKeyframes } from './css'
import { getTransition } from './registry'
import { fade } from './transitions/fade'
import type { TransitionInstance } from './types'

/** Where a wedge's own transform frame points, degrees clockwise from 12 o'clock. */
function anglesOf(segments: Segment[]): Map<string, number> {
  const angles = new Map<string, number>()
  for (const arc of arcs(segments)) {
    angles.set(arc.id, (arc.start + (arc.end - arc.start) / 2) * 360)
  }
  return angles
}

export function useEnter(
  segments: Segment[],
  instance: TransitionInstance | undefined,
  radius: number,
): (id: string) => (element: SVGGElement | null) => void {
  const seen = useRef<Set<string> | null>(null)
  const wedges = useRef(new Map<string, SVGGElement>()).current
  const wedgeRefs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current

  useEffect(() => {
    const ids = new Set(segments.map((segment) => segment.id))
    const previous = seen.current
    seen.current = ids

    if (!instance) return

    // First paint enters everything; after that, only what is new.
    const arriving = segments.filter((segment) => previous === null || !previous.has(segment.id))
    if (arriving.length === 0) return

    const authored = getTransition(instance.id)
    if (!authored) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const transition = reduced ? fade : authored
    const params = reduced ? { staggerMs: 0 } : instance.params
    const durationMs = reduced
      ? REDUCED_MOTION_MS
      : readNumber(
          instance.params,
          'durationMs',
          readNumber(transition.defaults, 'durationMs', 400),
        )

    const angles = anglesOf(segments)

    for (const segment of arriving) {
      const element = wedges.get(segment.id)
      if (!element) continue

      const angle = angles.get(segment.id) ?? 0
      const { keyframes, delayMs } = transition.frames(params, {
        index: segments.indexOf(segment),
        count: segments.length,
        angle,
        durationMs,
        moment: 'enter',
      })

      // Nothing cancels this yet: a spin starting mid-enter should snap the wedge
      // to rest, but that belongs to the spin moment, a later step in this plan.
      element.animate(toKeyframes(keyframes, { angle, radius, pivot: radius * 0.6 }), {
        duration: durationMs,
        delay: delayMs,
        easing: 'ease-out',
        fill: 'backwards',
      })
    }
  }, [segments, instance, radius, wedges])

  return (id: string) => {
    let ref = wedgeRefs.get(id)
    if (!ref) {
      ref = (element) => {
        if (element) wedges.set(id, element)
        else wedges.delete(id)
      }
      wedgeRefs.set(id, ref)
    }
    return ref
  }
}
