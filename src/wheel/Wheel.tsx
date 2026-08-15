import type { Ref } from 'react'
import { styleOf } from '../transition/css'
import type { Transitions } from '../transition/types'
import { usePresence } from '../transition/usePresence'
import { arcPath } from './geometry'
import { fitLabel } from './label'
import type { Segment } from './types'
import './Wheel.css'

export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
  transitions?: Transitions
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

export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  held = false,
}: WheelProps) {
  const drawn = usePresence(segments, transitions, held)
  const half = radius + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
          {drawn.map(({ segment, arc, presence }) => {
            const width = arc.end - arc.start
            if (!(width > 0)) return null

            const d = arcPath(arc.start, arc.end, radius)
            if (d === '') return null

            const fitted = fitLabel(segment.label, width, radius)
            const midDeg = (arc.start + width / 2) * 360
            // Radial text reads upside down when its baseline points leftward on
            // screen. Flip those segments so every label reads left-to-right.
            const flipped = Math.cos(((midDeg + 90) * Math.PI) / 180) < 0
            const style = styleOf(presence, { angle: midDeg, radius, pivot: radius * 0.6 })

            return (
              <g
                key={segment.id}
                className="wheel__wedge"
                data-segment-id={segment.id}
                style={style}
              >
                <path className="wheel__segment" d={d} fill={segment.color} />
                {fitted && (
                  <text
                    className="wheel__label"
                    fontSize={fitted.fontSize}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${midDeg}) translate(0 ${-radius * 0.62}) rotate(90)${flipped ? ' rotate(180)' : ''}`}
                  >
                    {fitted.text}
                  </text>
                )}
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
