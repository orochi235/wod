import { createFit } from '../slice/fit'
import { sourceFor } from '../slice/fonts/load'
import { getSlice } from '../slice/registry'
import type { FontId, Measure, SliceElement, SliceInstance } from '../slice/types'
import type { Segment } from '../wheel/types'

/** The widths worth checking a part against, in degrees. 15 is the cash board's. */
export const ARC_STEPS = [8, 12, 15, 20, 30]

/**
 * The preview's radius, in the same user units the wheel uses, and fixed. Every
 * arc width is drawn at this radius so px-per-unit never moves: a preview that
 * rescaled to fit its own wedge would show the same type at every width, which
 * is the one thing showing five of them side by side exists to disprove.
 */
export const PREVIEW_RADIUS = 100

/** The radius a theme's metrics are authored against — `Wheel`'s own default. */
const METRIC_RADIUS = 200

/** A theme's hub, in the preview's units rather than the wheel's. */
export const previewHubRadius = (hubRadius: number): number =>
  (hubRadius / METRIC_RADIUS) * PREVIEW_RADIUS

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * A width as the share of the wheel it is, in lowest terms. What a wedge has to
 * hold is a function of how many of them there are, and "1/90" says that where
 * "4°" makes you divide.
 */
export function turnFraction(degrees: number): string {
  const whole = Math.round(degrees * 100)
  const divisor = gcd(whole, 36000)
  return `${whole / divisor}/${36000 / divisor}`
}

/** Straddling 12 o'clock, where turns are zero. */
export function previewArc(degrees: number): { start: number; end: number } {
  const turns = degrees / 360
  return { start: -turns / 2, end: turns / 2 }
}

/**
 * What a wedge is painted when its segment names no color. SVG's own default is
 * black, and the label ink is dark too — a preview of black type on a black
 * wedge shows nothing at all.
 */
export const PREVIEW_FILL = '#3b6ea5'

export const MIN_ARC_DEG = 2
/** The scrubber's ceiling, and what the shared box is sized to hold. */
export const MAX_ARC_DEG = 45

const MARGIN = 8

/** The wedges too wide for the standard box, which take a doubled one. */
export const WIDE_ARC_STEPS = [60, 120]

/**
 * One box for every width, sized to the widest the scrubber can reach — cropped
 * to the wedge rather than the wheel, but never cropped per wedge: a box that
 * hugged each width would rescale the type it is there to compare.
 *
 * `scale` doubles the box for a wedge the standard one cannot hold. Drawn into
 * twice the CSS width it is the same px-per-unit, which is the whole point: a
 * half-turn wedge has to look wider, not the same at a smaller size.
 */
export function previewBox(scale = 1): { x: number; y: number; width: number; height: number } {
  const half = (PREVIEW_RADIUS * Math.sin(Math.PI * (MAX_ARC_DEG / 360)) + MARGIN) * scale
  return {
    x: -half,
    y: -(PREVIEW_RADIUS + MARGIN),
    width: half * 2,
    // The wedge runs from the hub at the origin out to the rim.
    height: PREVIEW_RADIUS + MARGIN * 2,
  }
}

export type WedgeSpec = {
  instance: SliceInstance
  segment: Segment
  degrees: number
  measure: Measure
  font?: FontId
}

export function drawWedge({
  instance,
  segment,
  degrees,
  measure,
  font,
}: WedgeSpec): SliceElement[] {
  const authored = getSlice(instance.id)
  if (!authored) return []
  return authored.draw(instance.params, {
    segment,
    arc: previewArc(degrees),
    radius: PREVIEW_RADIUS,
    index: 0,
    // What a whole wheel of wedges this wide would hold, so a part set to draw
    // its position reads as a position rather than as 1 of 1.
    count: Math.max(1, Math.round(360 / degrees)),
    measure,
    fit: createFit(measure),
    font,
    outlines: sourceFor,
  })
}
