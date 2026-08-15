import { pointAt } from '../wheel/geometry'
import { ARC_FILL, LINE_HEIGHT, arcLength, chord } from './fit'
import { DEFAULT_MAX_SIZE, MIN_SIZE } from './layouts/shared'
import type { Glyph, SliceContext, SlicePart } from './types'

/** Added to every glyph's step so letters do not touch. A fraction of the size. */
const TRACKING = 0.08
/** How much of the chord at a glyph's radius it may claim. */
const GLYPH_CHORD_FILL = 0.86
const MAX_STRETCH = 3
/** Re-weighting converges well inside this; it is a bound, not a tuning knob. */
const FAN_PASSES = 6
/**
 * A zero-advance character — a space — would otherwise divide the chord to
 * infinity when the width cap is computed.
 */
const MIN_ADVANCE = 0.3
/**
 * How much of the em a capital spans vertically, for a quarter-turned glyph.
 * One value for every face until a font registry supplies a real one.
 */
const CAP_HEIGHT = 0.72
const TAU = Math.PI * 2

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n))

const round = (n: number): number => Math.round(n * 100) / 100

type Solved = { sizes: number[]; radii: number[] }

/**
 * One division per pass: sizes are linear in the fit unit, so `unit` is
 * `bandLength / Σ(weight × step)` rather than the result of a search. With fan
 * on, the next pass re-weights by the chord at each glyph's settled radius.
 */
function solveRadial(
  steps: number[],
  across: number[],
  part: SlicePart,
  ctx: SliceContext,
  maxSize: number,
): Solved {
  const width = ctx.arc.end - ctx.arc.start
  const [inner, outer] = part.band
  const length = (outer - inner) * ctx.radius
  const fan = part.fan ?? true
  const inward = (part.direction ?? 'rimInward') === 'rimInward'
  const sign = inward ? -1 : 1

  let weights = steps.map(() => 1)
  let sizes: number[] = []
  let radii: number[] = []

  for (let pass = 0; pass < (fan ? FAN_PASSES : 1); pass++) {
    const demand = steps.reduce((sum, step, i) => sum + weights[i] * step, 0)
    const unit = demand > 0 ? length / demand : 0
    let edge = (inward ? outer : inner) * ctx.radius
    sizes = []
    radii = []

    for (let i = 0; i < steps.length; i++) {
      const nominal = unit * weights[i] * steps[i]
      const centre = Math.max(edge + (sign * nominal) / 2, 1)
      const room = chord(width, centre) * GLYPH_CHORD_FILL
      const size = Math.max(MIN_SIZE, Math.min(unit * weights[i], maxSize, room / across[i]))
      const extent = size * steps[i]
      radii.push(edge + (sign * extent) / 2)
      sizes.push(size)
      edge += sign * extent
    }

    if (!fan) break
    weights = radii.map((radius) => chord(width, Math.max(radius, 1)))
  }

  return { sizes, radii }
}

function stretchOf(part: SlicePart, size: number, radius: number, across: number, width: number) {
  const stretch = part.stretch ?? 'none'
  if (stretch === 'none') return 1
  if (stretch === 'fill') {
    const room = chord(width, Math.max(radius, 1)) * GLYPH_CHORD_FILL
    const taken = across * size
    return taken > 0 ? clamp(room / taken, 1, MAX_STRETCH) : 1
  }
  return clamp(stretch, 1 / MAX_STRETCH, MAX_STRETCH)
}

/** `stacked` and `taperedRadial`: a run set along the radius. */
export function runAlongRadius(part: SlicePart, ctx: SliceContext, text: string): Glyph[] {
  const chars = [...text]
  const width = ctx.arc.end - ctx.arc.start
  const mid = ctx.arc.start + width / 2
  const stacked = part.orientation === 'stacked'
  const maxSize = part.maxSize ?? DEFAULT_MAX_SIZE
  const advances = chars.map((char) => Math.max(ctx.measure(char, 1), MIN_ADVANCE))

  // Upright letters step by the line; quarter-turned ones step by the advance.
  const steps = chars.map((_, i) => (stacked ? 1 : advances[i]) + TRACKING)
  // What already spans the wedge, per unit of size — the axis stretch works on.
  const across = chars.map((_, i) => (stacked ? advances[i] : CAP_HEIGHT))

  const { sizes, radii } = solveRadial(steps, across, part, ctx, maxSize)

  return chars.map((char, i) => {
    const [x, y] = pointAt(mid, radii[i])
    const factor = round(stretchOf(part, sizes[i], radii[i], across[i], width))
    return {
      char,
      x,
      y,
      size: round(sizes[i]),
      rotate: round(mid * 360 + (stacked ? 0 : -90)),
      scale: stacked ? [factor, 1] : [1, factor],
    }
  })
}

/** `archedRim`: a baseline on an arc, so nothing narrows and nothing tapers. */
export function runAlongArc(part: SlicePart, ctx: SliceContext, text: string): Glyph[] {
  const chars = [...text]
  const width = ctx.arc.end - ctx.arc.start
  const mid = ctx.arc.start + width / 2
  const [inner, outer] = part.band
  const baseline = Math.max(((inner + outer) / 2) * ctx.radius, 1)
  const advances = chars.map((char) => Math.max(ctx.measure(char, 1), MIN_ADVANCE))
  const demand = advances.reduce((sum, advance) => sum + advance + TRACKING, 0)

  const run = arcLength(width, baseline) * ARC_FILL
  const thickness = ((outer - inner) * ctx.radius) / LINE_HEIGHT
  const maxSize = part.maxSize ?? DEFAULT_MAX_SIZE
  const size = Math.max(MIN_SIZE, Math.min(maxSize, thickness, demand > 0 ? run / demand : 0))

  const factor =
    typeof part.stretch === 'number' ? clamp(part.stretch, 1 / MAX_STRETCH, MAX_STRETCH) : 1

  let along = -(size * demand) / 2
  return chars.map((char, i) => {
    const step = size * (advances[i] + TRACKING)
    const turn = mid + (along + step / 2) / (TAU * baseline)
    along += step
    const [x, y] = pointAt(turn, baseline)
    return { char, x, y, size: round(size), rotate: round(turn * 360), scale: [factor, 1] }
  })
}
