import { pointAt } from '../wheel/geometry'
import type { Contour, GlyphSource, PlacedGlyph, PlacedRun, RunFrame } from './types'

const TAU = Math.PI * 2

const round = (n: number): number => Math.round(n * 100) / 100

/**
 * A point in the glyph's own space, at size 1: x along its baseline from the
 * glyph's centre, y up from the line it is centred on.
 */
type Local = [number, number]

/**
 * The wedge's sides are straight, so the room at a radius is proportional to it:
 * scaling a point's across-offset by its own radius is the wedge's own taper,
 * and it keeps every point inside the room the solve reserved at the glyph's
 * inner corner.
 */
function warpRadial(frame: Extract<RunFrame, { kind: 'radial' }>, glyph: PlacedGlyph) {
  const { mid, upright, inward } = frame
  const sign = upright || inward ? 1 : -1

  return ([lx, ly]: Local): [number, number] => {
    // A quarter-turned run has swapped its axes: the glyph's baseline runs along
    // the radius, and its up direction crosses the wedge.
    const alongRadius = upright ? ly : inward ? -lx : lx
    const across = (upright ? lx : sign * ly) * glyph.factor
    const radius = glyph.along + alongRadius * glyph.size
    const [cx, cy] = pointAt(mid, radius)
    const taper = glyph.along > 0 ? radius / glyph.along : 1
    const offset = across * glyph.size * taper
    // The tangent at `mid`, which is where the across axis points.
    const angle = mid * TAU
    return [cx + Math.cos(angle) * offset, cy + Math.sin(angle) * offset]
  }
}

/** A baseline that is an arc: the run bends rather than stepping letter by letter. */
function warpArc(frame: Extract<RunFrame, { kind: 'arc' }>, glyph: PlacedGlyph) {
  const { mid, baseline } = frame

  return ([lx, ly]: Local): [number, number] => {
    const along = glyph.along + lx * glyph.size * glyph.factor
    const turn = mid + along / (TAU * baseline)
    return pointAt(turn, baseline + ly * glyph.size)
  }
}

/**
 * The placed run as one shape. Null when the face cannot set it — one missing
 * character drops the whole part back to glyph mode rather than leaving a
 * half-warped word.
 */
export function outline(run: PlacedRun, source: GlyphSource): string | null {
  if (run.glyphs.length === 0) return null

  const parts: string[] = []
  for (const glyph of run.glyphs) {
    const contours = source.contours(glyph.char)
    if (contours === null) return null

    const warp = run.frame.kind === 'arc' ? warpArc(run.frame, glyph) : warpRadial(run.frame, glyph)
    // Centred on its own origin, the way `textAnchor` and `dominantBaseline`
    // centre a glyph-mode character: the two shapes have to sit in one place.
    const shift = source.advance(glyph.char) / 2
    for (const contour of contours) {
      if (contour.length === 0) continue
      const drawn = contour.map(([x, y]) => warp([x - shift, -(y + source.centre)]))
      const [first, ...rest] = drawn
      parts.push(
        `M${round(first[0])} ${round(first[1])}` +
          rest.map(([x, y]) => `L${round(x)} ${round(y)}`).join('') +
          'Z',
      )
    }
  }

  return parts.length > 0 ? parts.join('') : null
}

export type { Contour, GlyphSource }
