import type { Ref } from 'react'
import { useMemo, useRef } from 'react'
import { createFit } from '../slice/fit'
import { createMeasure } from '../slice/measure'
import { getSlice, resolveInstance } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
import { styleOf } from '../transition/css'
import type { Transitions } from '../transition/types'
import { usePresence } from '../transition/usePresence'
import { SliceElements } from './SliceElements'
import { type Arc, arcPath, arcs } from './geometry'
import type { Segment } from './types'
import './Wheel.css'

export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
  transitions?: Transitions
  /** The wheel's default layout. A segment's own `slice` beats it. */
  slice?: SliceInstance
  /**
   * Geometry the layouts resolve against, when it differs from what is drawn.
   * A morph changes weights every frame; resolving against those would pop
   * labels between orientations mid-spin.
   */
  layoutFrom?: Segment[]
  /** Registers a level group by segment id so a spin can counter-rotate it. */
  levelRef?: (id: string, restingDeg: number) => (element: SVGGElement | null) => void
  /**
   * Something other than the roster owns the geometry, so presences settle and
   * stay settled. Takes the condition rather than the cause: a running spin and
   * a landed frame not yet released both mean it.
   */
  held?: boolean
}

/**
 * How far the tip reaches past the rim. A physical pointer wants to just brush
 * each wedge as it goes by — enough to catch an edge, not enough to jam the
 * wheel — so this stays small on purpose.
 */
const POINTER_BITE = 3
const POINTER_LENGTH = 22
const POINTER_HALF_WIDTH = 12
/** The outer end, which is where a flicking pointer would pivot. */
const POINTER_BASE = POINTER_LENGTH - POINTER_BITE
// Two extra units so the base is not sitting exactly on the clip edge.
const VIEWBOX_PAD = POINTER_BASE + 2

const midDeg = (arc: { start: number; end: number }): number =>
  (arc.start + (arc.end - arc.start) / 2) * 360

export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  slice,
  layoutFrom,
  levelRef,
  held = false,
}: WheelProps) {
  const drawn = usePresence(segments, transitions, held)
  const half = radius + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  // One measurer per wheel, so the string cache outlives a render.
  const measure = useMemo(() => createMeasure(), [])
  const fit = useMemo(() => createFit(measure), [measure])

  // A departing wedge re-fitted against its closing arc would shrink its label
  // every frame. Written during render, idempotently — as `usePresence` does.
  const lastLayoutArcs = useRef(new Map<string, Arc>()).current
  for (const arc of arcs(layoutFrom ?? segments)) lastLayoutArcs.set(arc.id, arc)
  const stillDrawn = new Set(drawn.map((item) => item.segment.id))
  for (const id of [...lastLayoutArcs.keys()]) {
    if (!stillDrawn.has(id)) lastLayoutArcs.delete(id)
  }

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
          {drawn.map(({ segment, arc: presenceArc, presence }, index) => {
            const width = presenceArc.end - presenceArc.start
            if (!(width > 0)) return null

            const d = arcPath(presenceArc.start, presenceArc.end, radius)
            if (d === '') return null

            const layoutArc = lastLayoutArcs.get(segment.id) ?? presenceArc
            const instance = resolveInstance(segment, slice)
            const authored = getSlice(instance.id)
            const elements = authored
              ? authored.draw(instance.params, {
                  segment,
                  arc: { start: layoutArc.start, end: layoutArc.end },
                  radius,
                  index,
                  count: drawn.length,
                  measure,
                  fit,
                })
              : []

            return (
              <g
                key={segment.id}
                className="wheel__wedge"
                data-segment-id={segment.id}
                style={styleOf(presence, {
                  angle: midDeg(presenceArc),
                  radius,
                  pivot: radius * 0.6,
                })}
              >
                <path className="wheel__segment" d={d} fill={segment.color} />
                <SliceElements
                  elements={elements}
                  arc={presenceArc}
                  radius={radius}
                  id={segment.id}
                  levelRef={levelRef?.(segment.id, -midDeg(presenceArc))}
                />
              </g>
            )
          })}
        </g>
      </g>
      {/* Apex inward: the tip is the thing that names a winner, so it points at
          the wedge rather than away from it, dipping just past the rim. */}
      <polygon
        className="wheel__pointer"
        points={`0,${-radius + POINTER_BITE} ${-POINTER_HALF_WIDTH},${-radius - POINTER_BASE} ${POINTER_HALF_WIDTH},${-radius - POINTER_BASE}`}
      />
    </svg>
  )
}
