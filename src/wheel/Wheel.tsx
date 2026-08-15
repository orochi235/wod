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
import { partOn } from './theme'
import type { Theme } from './theme'
import { styleOfTheme } from './themeStyle'
import { flat } from './themes/flat'
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
  /** Which look to wear. Absent is the flat look, which is what the wheel drew before themes. */
  theme?: Theme
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
  theme = flat,
}: WheelProps) {
  const drawn = usePresence(segments, transitions, held)
  const rim = partOn(theme, 'rim') ? theme.metrics.rimWidth : 0
  const half = radius + rim + VIEWBOX_PAD
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
    <svg
      className="wheel"
      viewBox={viewBox}
      role="img"
      aria-label="wheel"
      style={styleOfTheme(theme)}
    >
      <WheelPaints />
      {partOn(theme, 'stage') && (
        <rect
          className="wheel__stage-ground"
          x={-half}
          y={-half}
          width={half * 2}
          height={half * 2}
        />
      )}
      <g className={partOn(theme, 'shadow') ? 'wheel__body wheel__body--shadow' : 'wheel__body'}>
        {partOn(theme, 'rim') && (
          <circle className="wheel__rim" r={radius + theme.metrics.rimWidth} />
        )}
        {partOn(theme, 'face') && <circle className="wheel__face" r={radius} />}
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
                    levelRef={levelRef?.(segment.id, -midDeg(layoutArc))}
                  />
                </g>
              )
            })}
          </g>
        </g>
        {partOn(theme, 'inner-shadow') && <circle className="wheel__inner-shadow" r={radius} />}
        {partOn(theme, 'sheen') && (
          <circle className="wheel__sheen" r={radius + theme.metrics.rimWidth} />
        )}
        {partOn(theme, 'hub') && <circle className="wheel__hub" r={theme.metrics.hubRadius} />}
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

/**
 * The named paints a theme's tokens select with `url(#…)`. A gradient cannot be
 * written as a custom property, so the theme chooses among these rather than
 * describing one. Ids are fixed: the app renders one wheel.
 */
function WheelPaints() {
  return (
    <defs>
      <radialGradient id="wheel-gold" cx="42%" cy="16%" r="88%">
        <stop offset="0%" stopColor="#fff6cf" />
        <stop offset="30%" stopColor="#f0c651" />
        <stop offset="58%" stopColor="#b8871f" />
        <stop offset="82%" stopColor="#7d570f" />
        <stop offset="100%" stopColor="#4b330a" />
      </radialGradient>
      <linearGradient id="wheel-chrome" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="30%" stopColor="#d5dde7" />
        <stop offset="52%" stopColor="#5e6874" />
        <stop offset="72%" stopColor="#aab4c1" />
        <stop offset="100%" stopColor="#f2f6fa" />
      </linearGradient>
      <radialGradient id="wheel-hub" cx="36%" cy="28%" r="82%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="26%" stopColor="#dbe2ea" />
        <stop offset="58%" stopColor="#767f8c" />
        <stop offset="100%" stopColor="#242931" />
      </radialGradient>
      <linearGradient
        id="wheel-gloss"
        gradientUnits="objectBoundingBox"
        x1="0"
        y1="0"
        x2="0.6"
        y2="1"
      >
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#f4efe2" />
        <stop offset="100%" stopColor="#cfc8b8" />
      </linearGradient>
      <linearGradient id="wheel-sheen" x1="0.1" y1="0" x2="0.75" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
        <stop offset="34%" stopColor="#ffffff" stopOpacity="0.09" />
        <stop offset="58%" stopColor="#000000" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.34" />
      </linearGradient>
      <radialGradient id="wheel-inner" cx="50%" cy="50%" r="50%">
        <stop offset="76%" stopColor="#000000" stopOpacity="0" />
        <stop offset="93%" stopColor="#000000" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.62" />
      </radialGradient>
    </defs>
  )
}
