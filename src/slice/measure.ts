import { DEFAULT_FAMILY } from './fonts/registry'
import type { Measure } from './types'

/** Mean glyph width as a fraction of font size, for the default face. */
const CHAR_WIDTH_RATIO = 0.55

/**
 * Measured at a reference size and divided down rather than measured at 1px:
 * a 1px font rounds to subpixel garbage on every engine.
 */
const REFERENCE_SIZE = 100

/** The fallbacks a face is painted and measured against while it loads. */
const FALLBACK_STACK = 'system-ui, sans-serif'

/**
 * Quoted, because an unquoted family with a word starting in a digit ("Press
 * Start 2P", "Jersey 25") is invalid CSS: the canvas ignores the font and
 * measures in the last one, and `document.fonts.load` rejects, so nothing refits.
 */
const quoted = (family: string): string => `"${family.replace(/"/g, '')}"`

export const FONT_STACK = `${quoted(DEFAULT_FAMILY)}, ${FALLBACK_STACK}`
/** The catalogue ships one weight per face; asking for more synthesises it. */
export const FONT_WEIGHT = 400

/** What `.wheel__label` must paint a part in for its measured size to hold. */
export const familyStack = (family: string): string => `${quoted(family)}, ${FALLBACK_STACK}`

export const estimateWidth: Measure = (text, size) => text.length * CHAR_WIDTH_RATIO * size

/**
 * Canvas metrics, cached per family and string for the session. Falls back to
 * the estimate wherever a 2d context is unavailable — jsdom, chiefly — so
 * callers never branch on the environment.
 */
export function createMeasure(): Measure {
  const cache = new Map<string, number>()
  let context: CanvasRenderingContext2D | null | undefined
  let set: string | undefined

  return (text, size, family) => {
    if (text.length === 0) return 0

    if (context === undefined) {
      try {
        context = document.createElement('canvas').getContext('2d')
      } catch {
        context = null
      }
    }
    if (!context) return estimateWidth(text, size)

    const stack = familyStack(family ?? DEFAULT_FAMILY)
    // Every face measures differently, so the family is half the cache key —
    // sharing one entry would set every part in the first face asked for.
    const key = `${stack} ${text}`
    let unit = cache.get(key)
    if (unit === undefined) {
      if (set !== stack) {
        context.font = `${FONT_WEIGHT} ${REFERENCE_SIZE}px ${stack}`
        set = stack
      }
      unit = context.measureText(text).width / REFERENCE_SIZE
      cache.set(key, unit)
    }
    return unit * size
  }
}
