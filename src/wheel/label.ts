export type FittedLabel = { text: string; fontSize: number }

const BASE_FONT_SIZE = 18
const MIN_FONT_SIZE = 8
/** Rough average glyph width as a fraction of font size, for a sans-serif face. */
const CHAR_WIDTH_RATIO = 0.55
/** Fraction of the radius available for text to run along. */
const RADIAL_TEXT_FRACTION = 0.75

export function fitLabel(text: string, arcTurns: number, radius: number): FittedLabel | null {
  if (!(arcTurns > 0) || text.length === 0) return null

  // The chord across the arc at the rim bounds how tall the text can be.
  const chord = 2 * radius * Math.sin(Math.PI * Math.min(arcTurns, 0.5))
  const fontSize = Math.min(BASE_FONT_SIZE, chord * 0.8)
  if (fontSize < MIN_FONT_SIZE) return null

  const available = radius * RADIAL_TEXT_FRACTION
  const maxChars = Math.floor(available / (fontSize * CHAR_WIDTH_RATIO))
  if (maxChars <= 0) return null
  if (text.length <= maxChars) return { text, fontSize }
  if (maxChars === 1) return { text: '…', fontSize }
  return { text: `${text.slice(0, maxChars - 1)}…`, fontSize }
}
