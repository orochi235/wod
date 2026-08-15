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
/**
 * A run solved to exactly its space lands a float or two over it, and without
 * this it would concede something it never needed to.
 */
const FIT_SLACK = 1e-6
/**
 * What a run gives up, cheapest first, to stay inside the space it was given
 * before the size floor starts pushing it out. Not `ladder.ts`, which climbs
 * orientations and content transforms for the fit path; this is spacing, and
 * only the glyph runs have it. Combinations rather than a stack: dropping the
 * fan costs more, and it buys back the tracking the one before it spent.
 */
const CONCESSIONS: { tracked: boolean; fan: boolean }[] = [
  { tracked: true, fan: true },
  { tracked: false, fan: true },
  { tracked: true, fan: false },
  { tracked: false, fan: false },
]

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
  fan: boolean,
): Solved {
  const width = ctx.arc.end - ctx.arc.start
  const [inner, outer] = part.band
  const length = (outer - inner) * ctx.radius
  // Condensing takes the chord out of the height solve: the band decides how
  // tall a glyph is and the across-wedge squeeze answers the chord on its own.
  const capped = part.shrink !== 'condense'
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
      const cap = capped ? room / across[i] : Number.POSITIVE_INFINITY
      const size = Math.max(MIN_SIZE, Math.min(unit * weights[i], maxSize, cap))
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

/** What an authored `stretch` asks for on its own, before the chord is consulted. */
function authoredStretch(part: SlicePart): number {
  return typeof part.stretch === 'number' ? clamp(part.stretch, 1 / MAX_STRETCH, MAX_STRETCH) : 1
}

/**
 * The factor on the axis that crosses the wedge. `stretch` may widen a glyph
 * with room to spare and `shrink: 'condense'` may narrow one without, so a part
 * that asks for both gets whichever the chord demands.
 */
function acrossFactor(
  part: SlicePart,
  size: number,
  radius: number,
  across: number,
  width: number,
) {
  const authored = authoredStretch(part)
  const upper = part.stretch === 'fill' ? MAX_STRETCH : authored
  const lower = part.shrink === 'condense' ? 1 / MAX_STRETCH : authored
  const taken = across * size
  if (lower === upper || !(taken > 0)) return authored
  const room = chord(width, Math.max(radius, 1)) * GLYPH_CHORD_FILL
  return clamp(room / taken, lower, upper)
}

const spanOf = (sizes: number[], steps: number[]): number =>
  sizes.reduce((sum, size, i) => sum + size * steps[i], 0)

/** `stacked` and `taperedRadial`: a run set along the radius. */
export function runAlongRadius(part: SlicePart, ctx: SliceContext, text: string): Glyph[] {
  const chars = [...text]
  const width = ctx.arc.end - ctx.arc.start
  const mid = ctx.arc.start + width / 2
  const stacked = part.orientation === 'stacked'
  const inward = (part.direction ?? 'rimInward') === 'rimInward'
  const maxSize = part.maxSize ?? DEFAULT_MAX_SIZE
  const fanned = part.fan ?? true
  const length = (part.band[1] - part.band[0]) * ctx.radius
  const advances = chars.map((char) => Math.max(ctx.measure(char, 1), MIN_ADVANCE))

  // What already spans the wedge, per unit of size — the axis stretch works on.
  const across = chars.map((_, i) => (stacked ? advances[i] : CAP_HEIGHT))

  let steps: number[] = []
  let solved: Solved = { sizes: [], radii: [] }
  for (const concession of CONCESSIONS) {
    if (concession.fan && !fanned) continue
    // Upright letters step by the line; quarter-turned ones step by the advance.
    steps = chars.map((_, i) => (stacked ? 1 : advances[i]) + (concession.tracked ? TRACKING : 0))
    solved = solveRadial(steps, across, part, ctx, maxSize, concession.fan)
    if (spanOf(solved.sizes, steps) <= length + FIT_SLACK) break
  }
  const { sizes, radii } = solved

  return chars.map((char, i) => {
    const [x, y] = pointAt(mid, radii[i])
    const factor = round(acrossFactor(part, sizes[i], radii[i], across[i], width))
    return {
      char,
      x,
      y,
      size: round(sizes[i]),
      // A quarter-turned run reads along its own baseline, so the baseline has
      // to point the way the run steps or the word comes out reversed.
      rotate: round(mid * 360 + (stacked ? 0 : inward ? 90 : -90)),
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
  // The only radius used as a divisor: at zero, every coordinate becomes NaN.
  const baseline = Math.max(((inner + outer) / 2) * ctx.radius, 1)
  const advances = chars.map((char) => Math.max(ctx.measure(char, 1), MIN_ADVANCE))

  const run = arcLength(width, baseline) * ARC_FILL
  const thickness = ((outer - inner) * ctx.radius) / LINE_HEIGHT
  const maxSize = part.maxSize ?? DEFAULT_MAX_SIZE
  const condense = part.shrink === 'condense'
  const authored = authoredStretch(part)

  // Nothing narrows on an arc, so the tracking is the only rung there is.
  let tracking = TRACKING
  let demand = 0
  let size = 0
  let factor = authored
  for (const tracked of [TRACKING, 0]) {
    tracking = tracked
    demand = advances.reduce((sum, advance) => sum + advance + tracked, 0)
    const fit = demand > 0 ? run / demand : 0
    const height = condense ? Number.POSITIVE_INFINITY : fit
    size = Math.max(MIN_SIZE, Math.min(maxSize, thickness, height))
    // Same axis as an authored stretch, so it is the same factor.
    factor =
      condense && size * demand > 0
        ? clamp(run / (size * demand), 1 / MAX_STRETCH, authored)
        : authored
    if (size * demand * factor <= run + FIT_SLACK) break
  }

  let along = -(size * demand * factor) / 2
  return chars.map((char, i) => {
    const step = size * (advances[i] + tracking) * factor
    const turn = mid + (along + step / 2) / (TAU * baseline)
    along += step
    const [x, y] = pointAt(turn, baseline)
    return { char, x, y, size: round(size), rotate: round(turn * 360), scale: [round(factor), 1] }
  })
}
