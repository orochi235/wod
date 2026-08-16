import type { FitSpec, Measure, Placement } from './types'

const TAU = Math.PI * 2

/** Where a radial run may start and stop, as fractions of the radius. */
const HUB_MARGIN = 0.28
const RIM_MARGIN = 0.96
/** The same pair, for anything that wants to draw the room rather than fill it. */
export const RUN_BAND: [number, number] = [HUB_MARGIN, RIM_MARGIN]
/** How much of the available chord or arc a line of text may claim. */
const CHORD_FILL = 0.82
export const ARC_FILL = 0.85
/** A level disc is otherwise tangent to both the rim and its own wedge edges. */
const DISC_FILL = 0.85
/** Radial thickness a curved band claims, as a fraction of the radius. */
const BAND = 0.34
/** Radial thickness a tangential line claims. */
const TANGENTIAL_BAND = 0.5
export const DEFAULT_LEADING = 1.2
/** Added to every glyph's step so letters do not touch. A fraction of the size. */
export const DEFAULT_TRACKING = 0.08

const leadingOf = (spec: Omit<FitSpec, 'text'>): number => spec.leading ?? DEFAULT_LEADING
/**
 * Zero, not `DEFAULT_TRACKING`: a fitted run is one `<text>` the browser spaces,
 * and it has never carried letter-spacing. The glyph runs are where 0.08 is the
 * standing default, and a part that sets `tracking` reaches both.
 */
const trackingOf = (spec: Omit<FitSpec, 'text'>): number => spec.tracking ?? 0

/** Down, never nearest: rounding a fitted size up puts it back over its budget. */
const floor2 = (n: number): number => Math.floor(n * 100) / 100

/** The straight-line distance across an arc at a given radius. */
export const chord = (turns: number, radius: number): number =>
  2 * radius * Math.sin(Math.PI * Math.min(turns, 0.5))

export const arcLength = (turns: number, radius: number): number => TAU * radius * turns

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
        natural: (spec.radius * TANGENTIAL_BAND) / leadingOf(spec),
      }
    case 'curved':
      return {
        length: arcLength(spec.width, anchorRadius) * ARC_FILL,
        natural: (spec.radius * BAND) / leadingOf(spec),
      }
    default:
      // The glyph-run orientations route through `typeset`, never here.
      return { length: 0, natural: 0 }
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

    // Tracking is spent per character, including the last, which is what CSS
    // `letter-spacing` also does — solving for one less would leave the painted
    // run a space wider than the size it was granted.
    const tracked = trackingOf(spec) * [...spec.text].length
    const unit = measure(spec.text, 1, spec.family) + tracked
    if (!(unit > 0)) return null

    let size: number
    if (spec.frame === 'level') {
      const room = levelRoom(spec)
      // A W by H box fits a disc of radius r when hypot(W, H) <= 2r.
      size = Math.min(spec.maxSize, (2 * room) / Math.hypot(unit, leadingOf(spec)))
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
