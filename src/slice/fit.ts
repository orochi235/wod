import type { FitSpec, Measure, Placement } from './types'

const TAU = Math.PI * 2

/** Where a radial run may start and stop, as fractions of the radius. */
const HUB_MARGIN = 0.28
const RIM_MARGIN = 0.96
/** How much of the available chord or arc a line of text may claim. */
const CHORD_FILL = 0.82
const ARC_FILL = 0.85
/** A level disc is otherwise tangent to both the rim and its own wedge edges. */
const DISC_FILL = 0.85
/** Radial thickness a curved band claims, as a fraction of the radius. */
const BAND = 0.34
/** Radial thickness a tangential line claims. */
const TANGENTIAL_BAND = 0.5
const LINE_HEIGHT = 1.2

/** Down, never nearest: rounding a fitted size up puts it back over its budget. */
const floor2 = (n: number): number => Math.floor(n * 100) / 100

/** The straight-line distance across an arc at a given radius. */
const chord = (turns: number, radius: number): number =>
  2 * radius * Math.sin(Math.PI * Math.min(turns, 0.5))

const arcLength = (turns: number, radius: number): number => TAU * radius * turns

/**
 * Radial text centers on this run, not on the layout's anchor: centering it
 * further out and spending the whole budget puts half the label past the rim.
 */
function radialRun(radius: number): { center: number; length: number } {
  const inner = radius * HUB_MARGIN
  const outer = radius * RIM_MARGIN
  return { center: (inner + outer) / 2, length: outer - inner }
}

export type Budget = {
  /** How far the text may run, along whatever direction the orientation uses. */
  length: number
  /** The largest size the perpendicular direction allows, before length shrinks it. */
  natural: number
}

/** Where a placement actually sits, which for radial is not the layout's anchor. */
export function anchorFor(spec: Omit<FitSpec, 'text'>): number {
  if (spec.frame === 'wheel' && spec.orientation === 'radial') {
    return radialRun(spec.radius).center / spec.radius
  }
  return spec.anchor
}

export function budget(spec: Omit<FitSpec, 'text'>): Budget {
  const anchorRadius = spec.radius * anchorFor(spec)
  switch (spec.orientation) {
    case 'radial': {
      const run = radialRun(spec.radius)
      return { length: run.length, natural: chord(spec.width, run.center) * 0.8 }
    }
    case 'tangential':
      return {
        length: chord(spec.width, anchorRadius) * CHORD_FILL,
        natural: (spec.radius * TANGENTIAL_BAND) / LINE_HEIGHT,
      }
    case 'curved':
      return {
        length: arcLength(spec.width, anchorRadius) * ARC_FILL,
        natural: (spec.radius * BAND) / LINE_HEIGHT,
      }
  }
}

/**
 * Level-frame text must stay inside the wedge at every rotation, so its room is
 * the distance from the anchor to the nearest edge — a disc, not a run.
 */
export function levelRoom(spec: Omit<FitSpec, 'text'>): number {
  const anchorRadius = spec.radius * spec.anchor
  const toSide = anchorRadius * Math.sin(Math.PI * Math.min(spec.width, 0.5))
  const toRim = spec.radius - anchorRadius
  return Math.max(0, Math.min(toSide, toRim, anchorRadius) * DISC_FILL)
}

/**
 * Shrink-to-fit for one orientation. Returns null when the text cannot be drawn
 * at or above `minSize` — which is the signal a ladder walks on.
 */
export function createFit(measure: Measure): (spec: FitSpec) => Placement | null {
  return (spec) => {
    if (spec.text.length === 0) return null

    const unit = measure(spec.text, 1)
    if (!(unit > 0)) return null

    let size: number
    if (spec.frame === 'level') {
      const room = levelRoom(spec)
      // A W by H box fits a disc of radius r when hypot(W, H) <= 2r.
      size = Math.min(spec.maxSize, (2 * room) / Math.hypot(unit, LINE_HEIGHT))
    } else {
      const { length, natural } = budget(spec)
      if (!(length > 0) || !(natural > 0)) return null
      size = Math.min(spec.maxSize, natural, length / unit)
    }

    if (!(size >= spec.minSize)) return null
    return {
      orientation: spec.orientation,
      anchor: anchorFor(spec),
      size: floor2(size),
      text: spec.text,
    }
  }
}
