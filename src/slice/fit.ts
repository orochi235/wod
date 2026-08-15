import type { FitSpec, Measure, Placement } from './types'

const TAU = Math.PI * 2

/** Fraction of the radius a radial run may occupy. */
const RADIAL_RUN = 0.75
/** How much of the available chord or arc a line of text may claim. */
const CHORD_FILL = 0.86
const ARC_FILL = 0.9
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

export type Budget = {
  /** How far the text may run, along whatever direction the orientation uses. */
  length: number
  /** The largest size the perpendicular direction allows, before length shrinks it. */
  natural: number
}

export function budget(spec: Omit<FitSpec, 'text'>): Budget {
  const anchorRadius = spec.radius * spec.anchor
  switch (spec.orientation) {
    case 'radial':
      return {
        length: spec.radius * RADIAL_RUN,
        natural: chord(spec.width, anchorRadius) * 0.8,
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
  return Math.max(0, Math.min(toSide, toRim, anchorRadius))
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
      anchor: spec.anchor,
      size: floor2(size),
      text: spec.text,
    }
  }
}
