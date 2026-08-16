import { createFit } from '../slice/fit'
import { sourceFor } from '../slice/fonts/load'
import { getSlice } from '../slice/registry'
import type { FontId, Measure, SliceElement, SliceInstance } from '../slice/types'
import type { Segment } from '../wheel/types'

/** The widths worth checking a part against, in degrees. */
export const ARC_STEPS = [4, 8, 12, 20, 30]

/**
 * The preview's radius, in the same user units the wheel uses, and fixed. Every
 * arc width is drawn at this radius so px-per-unit never moves: a preview that
 * rescaled to fit its own wedge would show the same type at every width, which
 * is the one thing showing five of them side by side exists to disprove.
 */
export const PREVIEW_RADIUS = 100

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

export const MIN_ARC_DEG = 2
/** The scrubber's ceiling, and what the shared box is sized to hold. */
export const MAX_ARC_DEG = 45

const MARGIN = 8

/**
 * One box for every width, sized to the widest the scrubber can reach —
 * cropped to the wedge rather than the wheel, but never cropped per wedge: a
 * box that hugged each width would rescale the type it is there to compare.
 */
export function previewBox(): { x: number; y: number; width: number; height: number } {
  const half = PREVIEW_RADIUS * Math.sin(Math.PI * (MAX_ARC_DEG / 360)) + MARGIN
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
