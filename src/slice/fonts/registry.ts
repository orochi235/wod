import type { FontId } from '../types'
import { CATALOG, type Font } from './catalog'

export type { Font, FontClass } from './catalog'

export const FONT_LIST: Font[] = CATALOG

export const FONTS: Record<FontId, Font> = Object.fromEntries(
  CATALOG.map((font) => [font.id, font]),
)

/** What a wedge is set in when neither the part nor the look names a face. */
export const DEFAULT_FONT_ID = 'bevan'

/**
 * Null rather than a throw, matching getSlice: ids come out of localStorage, and
 * a stored id of 'constructor' resolves through the prototype chain to something
 * that is not a face.
 */
export function getFont(id: string | undefined): Font | null {
  if (id === undefined) return null
  return Object.hasOwn(FONTS, id) ? FONTS[id] : null
}

export const DEFAULT_FAMILY = (getFont(DEFAULT_FONT_ID) as Font).family

/** Part beats look beats built-in, and an id no build carries beats nothing. */
export function resolveFamily(part: FontId | undefined, theme: FontId | undefined): string {
  return (getFont(part) ?? getFont(theme))?.family ?? DEFAULT_FAMILY
}

export function resolveFont(part: FontId | undefined, theme: FontId | undefined): Font {
  return getFont(part) ?? getFont(theme) ?? (getFont(DEFAULT_FONT_ID) as Font)
}
