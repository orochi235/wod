import type { Contour, FontId, GlyphSource } from '../types'
import { getFont } from './registry'

/**
 * How finely a curve is subdivided. A non-affine warp moves the points
 * themselves, so a curve has to become points before it can bend; at wedge
 * sizes the joins are invisible well below this.
 */
const CURVE_STEPS = 8

type OpenTypePath = {
  commands: { type: string; x?: number; y?: number; x1?: number; y1?: number }[]
}

type OpenTypeGlyph = {
  index: number
  advanceWidth?: number
  getPath(x: number, y: number, size: number): OpenTypePath
}

type OpenTypeFont = {
  unitsPerEm: number
  ascender: number
  descender: number
  charToGlyph(char: string): OpenTypeGlyph
}

const quadratic = (from: number, control: number, to: number, t: number): number =>
  (1 - t) * (1 - t) * from + 2 * (1 - t) * t * control + t * t * to

const cubic = (from: number, a: number, b: number, to: number, t: number): number =>
  (1 - t) ** 3 * from + 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3 * to

/** The face's own outlines at size 1, closed and flattened. */
function contoursOf(font: OpenTypeFont, char: string): Contour[] | null {
  const glyph = font.charToGlyph(char)
  // .notdef. Every character in the run has to be one the face carries, or the
  // part falls back whole.
  if (glyph.index === 0) return null

  const contours: Contour[] = []
  let current: Contour = []
  let x = 0
  let y = 0

  for (const command of glyph.getPath(0, 0, 1).commands) {
    switch (command.type) {
      case 'M':
        if (current.length > 0) contours.push(current)
        current = [[command.x ?? 0, command.y ?? 0]]
        break
      case 'L':
        current.push([command.x ?? 0, command.y ?? 0])
        break
      case 'Q':
        for (let step = 1; step <= CURVE_STEPS; step++) {
          const t = step / CURVE_STEPS
          current.push([
            quadratic(x, command.x1 ?? 0, command.x ?? 0, t),
            quadratic(y, command.y1 ?? 0, command.y ?? 0, t),
          ])
        }
        break
      case 'C':
        for (let step = 1; step <= CURVE_STEPS; step++) {
          const t = step / CURVE_STEPS
          const bend = command as { x2?: number; y2?: number }
          current.push([
            cubic(x, command.x1 ?? 0, bend.x2 ?? 0, command.x ?? 0, t),
            cubic(y, command.y1 ?? 0, bend.y2 ?? 0, command.y ?? 0, t),
          ])
        }
        break
      case 'Z':
        if (current.length > 0) contours.push(current)
        current = []
        break
    }
    const last = current.at(-1)
    if (last) [x, y] = last
  }
  if (current.length > 0) contours.push(current)

  return contours
}

function sourceOf(font: OpenTypeFont): GlyphSource {
  const memo = new Map<string, Contour[] | null>()

  return {
    // A roster of repeating letters costs one flatten each, not one per wedge.
    contours(char) {
      let cached = memo.get(char)
      if (cached === undefined) {
        cached = contoursOf(font, char)
        memo.set(char, cached)
      }
      return cached
    },
    advance: (char) => (font.charToGlyph(char).advanceWidth ?? 0) / font.unitsPerEm,
    centre: (font.ascender + font.descender) / (2 * font.unitsPerEm),
  }
}

const settled = new Map<FontId, GlyphSource | null>()
const asked = new Map<FontId, Promise<GlyphSource | null>>()

async function parseFace(id: FontId): Promise<GlyphSource | null> {
  const font = getFont(id)
  if (!font) return null

  const response = await fetch(font.file)
  if (!response.ok) throw new Error(`${response.status} ${font.file}`)
  const bytes = await response.arrayBuffer()
  // Loaded only here: glyph mode never pays for the parser, and the whole
  // catalogue stays out of the bundle.
  const opentype = await import('opentype.js')
  return sourceOf(opentype.parse(bytes) as unknown as OpenTypeFont)
}

/**
 * One fetch and one parse per face, whatever asks. A face that fails to load
 * settles as null rather than retrying: the part draws in glyph mode, which is
 * what it was doing while the face was on its way.
 */
export function requestFace(id: FontId | undefined): Promise<GlyphSource | null> {
  if (id === undefined) return Promise.resolve(null)
  const already = asked.get(id)
  if (already) return already

  const request = parseFace(id)
    .catch(() => null)
    .then((source) => {
      settled.set(id, source)
      return source
    })
  asked.set(id, request)
  return request
}

/** What `draw` reads: the parse, if it has landed. Never a promise. */
export function sourceFor(id: FontId | undefined): GlyphSource | null {
  return id === undefined ? null : (settled.get(id) ?? null)
}

/** Tests only: the caches outlive a component, which is the point of them. */
export function forgetFaces(): void {
  settled.clear()
  asked.clear()
}
