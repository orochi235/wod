import type { Measure } from './types'

/** Mean glyph width as a fraction of font size, for a sans-serif face. */
const CHAR_WIDTH_RATIO = 0.55

/**
 * Measured at a reference size and divided down rather than measured at 1px:
 * a 1px font rounds to subpixel garbage on every engine.
 */
const REFERENCE_SIZE = 100

export const FONT_STACK = 'system-ui, sans-serif'
export const FONT_WEIGHT = 600

export const estimateWidth: Measure = (text, size) => text.length * CHAR_WIDTH_RATIO * size

/**
 * Canvas metrics, cached per string for the session. Falls back to the estimate
 * wherever a 2d context is unavailable — jsdom, chiefly — so callers never
 * branch on the environment.
 */
export function createMeasure(): Measure {
  const cache = new Map<string, number>()
  let context: CanvasRenderingContext2D | null | undefined

  return (text, size) => {
    if (text.length === 0) return 0

    if (context === undefined) {
      try {
        context = document.createElement('canvas').getContext('2d')
        if (context) context.font = `${FONT_WEIGHT} ${REFERENCE_SIZE}px ${FONT_STACK}`
      } catch {
        context = null
      }
    }
    if (!context) return estimateWidth(text, size)

    let unit = cache.get(text)
    if (unit === undefined) {
      unit = context.measureText(text).width / REFERENCE_SIZE
      cache.set(text, unit)
    }
    return unit * size
  }
}
