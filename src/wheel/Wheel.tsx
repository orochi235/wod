import type { Ref } from 'react'
import { useMemo } from 'react'
import { createFit } from '../slice/fit'
import { createMeasure } from '../slice/measure'
import { getSlice, resolveInstance } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
import type { Transitions } from '../transition/types'
import { useEnter } from '../transition/useEnter'
import { SliceElements } from './SliceElements'
import { arcPath, arcs } from './geometry'
import { paletteColor } from './palette'
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

export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  slice,
  layoutFrom,
  levelRef,
}: WheelProps) {
  const layout = arcs(segments)
  const half = radius + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  const wedgeRef = useEnter(segments, transitions?.enter, radius)

  // One measurer per wheel, so the string cache outlives a render.
  const measure = useMemo(() => createMeasure(), [])
  const fit = useMemo(() => createFit(measure), [measure])

  const resolveArcs = layoutFrom ? arcs(layoutFrom) : layout

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
          {layout.map((arc, index) => {
            const width = arc.end - arc.start
            if (!(width > 0)) return null

            const segment = segments[index]
            const d = arcPath(arc.start, arc.end, radius)
            if (d === '') return null

            const color = segment.color ?? paletteColor(index)
            const instance = resolveInstance(segment, slice)
            const authored = getSlice(instance.id)
            const resolveArc = resolveArcs[index] ?? arc
            const elements = authored
              ? authored.draw(instance.params, {
                  segment,
                  arc: { start: resolveArc.start, end: resolveArc.end },
                  radius,
                  index,
                  count: segments.length,
                  measure,
                  fit,
                })
              : []

            return (
              <g
                key={segment.id}
                className="wheel__wedge"
                data-segment-id={segment.id}
                ref={wedgeRef(segment.id)}
              >
                <path className="wheel__segment" d={d} fill={color} />
                <SliceElements
                  elements={elements}
                  arc={arc}
                  radius={radius}
                  id={segment.id}
                  levelRef={levelRef?.(segment.id, -(arc.start + width / 2) * 360)}
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
