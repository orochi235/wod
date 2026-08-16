import type { Ref } from 'react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Hub } from '../preset/types'
import { createFit } from '../slice/fit'
import { sourceFor } from '../slice/fonts/load'
import { facesUsed } from '../slice/fonts/usage'
import { createMeasure } from '../slice/measure'
import { getSlice, resolveInstance } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
import { styleOf } from '../transition/css'
import type { Transitions } from '../transition/types'
import { usePresence } from '../transition/usePresence'
import { HubEmblem } from './HubEmblem'
import { SliceElements } from './SliceElements'
import type { RetainedIds } from './colors'
import { deflectionDeg, pegCrossings, settledDeflection } from './flapper'
import { createClicker } from './flapperAudio'
import { type Arc, arcPath, arcs, pointAt } from './geometry'
import { wantsInverseInk } from './ink'
import { panelPath } from './panel'
import { pegAngles } from './pegs'
import { partOn } from './theme'
import type { Theme } from './theme'
import { styleOfTheme } from './themeStyle'
import { flat } from './themes/flat'
import type { Segment } from './types'
import { useFaces } from './useFaces'
import { useWheelAngle } from './useWheelAngle'
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
  /**
   * Receives the ids this wheel is drawing, including wedges animating out.
   * Written during render and rewritten on every animation frame, so reading it
   * during your own render is the intended use. One wheel per ref: two wheels
   * given the same ref overwrite each other, and an unmounted wheel leaves its
   * last set in place.
   */
  retainedRef?: RetainedIds
  /** Which look to wear. Absent is the flat look, which is what the wheel drew before themes. */
  theme?: Theme
  /** Silences the flapper without changing the look. */
  muted?: boolean
  /** What sits on the hub cap. Absent leaves it the bare cap the look paints. */
  hub?: Hub
  /** Registers the hub group so a spin can turn it from outside the rotor. */
  riderRef?: (element: SVGGElement | null) => void
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

/** Empty for a wedge the look's own ink already reads on. */
const inkOf = (color: string | undefined): Record<string, string> =>
  wantsInverseInk(color) ? { '--label-ink': 'var(--wheel-label-inverse, #f7f3e8)' } : {}

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
  retainedRef,
  theme = flat,
  muted = false,
  hub,
  riderRef,
}: WheelProps) {
  const emblemId = useId()
  const drawn = usePresence(segments, transitions, held, retainedRef)
  const pegs = partOn(theme, 'peg')
    ? pegAngles(
        theme.pegs,
        drawn.map((item) => item.arc),
      )
    : []
  const rim = partOn(theme, 'rim') ? theme.metrics.rimWidth : 0
  const half = radius + rim + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  const ownRotorRef = useRef<SVGGElement>(null)
  const [deflection, setDeflection] = useState(0)
  const hasFlapper = partOn(theme, 'flapper')

  const clickerRef = useRef<ReturnType<typeof createClicker> | null>(null)
  // On demand and never during render, so a caller after a cleanup gets a live
  // clicker rather than the retired one a render had already handed out.
  const clicker = useCallback(() => {
    if (clickerRef.current === null) clickerRef.current = createClicker()
    return clickerRef.current
  }, [])

  const lastAngleRef = useRef<number | null>(null)

  useWheelAngle(ownRotorRef, hasFlapper, (angle, speed) => {
    setDeflection((current) => settledDeflection(current, deflectionDeg(angle, pegs, speed), speed))
    const previous = lastAngleRef.current
    lastAngleRef.current = angle
    if (previous === null || theme.flapper === 'silent') return
    // The clicker rates its own volume off how fast, never which way.
    clicker().click(pegCrossings(previous, angle, pegs, speed), Math.abs(speed))
  })

  useEffect(() => {
    const unlock = () => clicker().unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      clickerRef.current?.close()
      clickerRef.current = null
    }
  }, [clicker])

  useEffect(() => {
    clicker().setMuted(muted)
  }, [muted, clicker])

  // Every face a wedge is set in is a webfont, so the first render measures
  // whatever the fallback is.
  const faces = useMemo(
    () =>
      facesUsed(
        segments.map((segment) => resolveInstance(segment, slice)),
        theme.font,
      ),
    [segments, slice, theme.font],
  )
  const faceLoaded = useFaces(faces)

  // One measurer per wheel, so the string cache outlives a render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `faceLoaded` is the point — it is what retires the cache.
  const measure = useMemo(() => createMeasure(), [faceLoaded])
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
          <g
            className="wheel__rotor"
            transform={`rotate(${rotationDeg})`}
            ref={(node) => {
              ownRotorRef.current = node
              if (typeof rotorRef === 'function') rotorRef(node)
              else if (rotorRef) rotorRef.current = node
            }}
          >
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
                    font: theme.font,
                    outlines: sourceFor,
                  })
                : []

              return (
                <g
                  key={segment.id}
                  className="wheel__wedge"
                  data-segment-id={segment.id}
                  style={{
                    ...styleOf(presence, {
                      angle: midDeg(presenceArc),
                      radius,
                      pivot: radius * 0.6,
                    }),
                    ...inkOf(segment.color),
                  }}
                >
                  <path className="wheel__segment" d={d} fill={segment.color} />
                  {partOn(theme, 'divider') &&
                    // Both edges, not just the start: a wedge's fill covers half
                    // of any stroke already on the seam it shares, so each seam
                    // needs the stroke that comes after both of its fills.
                    [presenceArc.start, presenceArc.end].map((edge) => {
                      const [x2, y2] = pointAt(edge, radius)
                      return (
                        <line key={edge} className="wheel__divider" x1={0} y1={0} x2={x2} y2={y2} />
                      )
                    })}
                  {partOn(theme, 'panel') &&
                    (() => {
                      const panel = panelPath(
                        presenceArc.start,
                        presenceArc.end,
                        radius,
                        theme.metrics.panel,
                        Math.min(0.011, width * 0.13),
                      )
                      return panel === '' ? null : <path className="wheel__panel" d={panel} />
                    })()}
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
            {pegs.map((turn) => {
              const [cx, cy] = pointAt(turn, radius + theme.metrics.rimWidth / 2)
              return (
                <circle
                  key={turn}
                  className="wheel__peg"
                  cx={cx}
                  cy={cy}
                  r={theme.metrics.pegRadius}
                />
              )
            })}
          </g>
        </g>
        {partOn(theme, 'inner-shadow') && <circle className="wheel__inner-shadow" r={radius} />}
        {partOn(theme, 'sheen') && (
          <circle className="wheel__sheen" r={radius + theme.metrics.rimWidth} />
        )}
        {partOn(theme, 'hub') && (
          // Outside the rotor, so the cap stays over the sheen the way it always
          // has. A spinning emblem rides the rotor's own track instead.
          <g
            className="wheel__hub-group"
            transform={hub?.spins ? `rotate(${rotationDeg})` : undefined}
            ref={hub?.spins ? riderRef : undefined}
          >
            <circle className="wheel__hub" r={theme.metrics.hubRadius} />
            {hub?.emblem && (
              <HubEmblem emblem={hub.emblem} radius={theme.metrics.hubRadius} id={emblemId} />
            )}
          </g>
        )}
      </g>
      {/* Apex inward: the tip is the thing that names a winner, so it points at
          the wedge rather than away from it, dipping just past the rim. */}
      {partOn(theme, 'pointer') && (
        <polygon
          className="wheel__pointer"
          points={`0,${-radius + POINTER_BITE} ${-POINTER_HALF_WIDTH},${-radius - POINTER_BASE} ${POINTER_HALF_WIDTH},${-radius - POINTER_BASE}`}
        />
      )}
      {hasFlapper && (
        <g
          className="wheel__flapper"
          transform={`translate(0 ${-(radius + theme.metrics.rimWidth + 20)}) rotate(${deflection})`}
        >
          <rect x={-6} y={-10} width={12} height={11} rx={2.5} />
          <path
            d={`M -6.5 -1 L 6.5 -1 L 2.6 ${theme.metrics.rimWidth + 26} L -2.6 ${theme.metrics.rimWidth + 26} Z`}
          />
        </g>
      )}
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
