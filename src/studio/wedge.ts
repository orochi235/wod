import { RUN_BAND, createFit } from '../slice/fit'
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

/**
 * What the clip uses when the look wears no hub at all. The flat look has none,
 * and a lab whose clip silently did nothing on half the themes is a lab that
 * teaches the wrong thing about the tip of a wedge.
 */
export const FALLBACK_HUB_RADIUS = 62

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

/** The wedges too wide for the shared box, each given one that just holds it. */
export const WIDE_ARC_STEPS = [60, 120]

/**
 * A box cropped to the wedge rather than the wheel, sized to hold `degrees`.
 * The five stepped previews and the scrubber share one, sized to the scrubber's
 * ceiling; a wedge wider than that gets its own rather than shrinking everyone.
 *
 * Scale stays constant across all of them without any of this having to match:
 * every box is the same height, and the previews are drawn at a fixed height,
 * so px-per-unit is decided by that height alone and a wider box is wider
 * background rather than smaller type.
 */
export function previewBox(degrees: number = MAX_ARC_DEG): {
  x: number
  y: number
  width: number
  height: number
} {
  const half = PREVIEW_RADIUS * Math.sin(Math.PI * (Math.min(degrees, 180) / 360)) + MARGIN
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

/**
 * The bands the layout will set type into — the room, not what took it. A
 * layout that names none is one whose room is the wedge's own run, which is
 * what `RUN_BAND` is.
 */
export function bandsOf(instance: SliceInstance): [number, number][] {
  const authored = getSlice(instance.id)
  if (!authored) return []
  return authored.bands?.(instance.params) ?? [RUN_BAND]
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
