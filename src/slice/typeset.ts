import { pointAt } from '../wheel/geometry'
import type { Media } from '../wheel/types'
import { chord } from './fit'
import { applyTransform } from './ladder'
import { MIN_SIZE } from './layouts/shared'
import type { Glyph, PartContent, SliceContext, SliceElement, SlicePart } from './types'

/** What a part with no `maxSize` of its own may reach. */
export const DEFAULT_MAX_SIZE = 40

/** Added to every glyph's step so letters do not touch. A fraction of the size. */
const TRACKING = 0.08
/** How much of the chord at a glyph's radius it may claim. */
const CHORD_FILL = 0.86
const MAX_STRETCH = 3
/** Re-weighting converges well inside this; it is a bound, not a tuning knob. */
const FAN_PASSES = 6
/**
 * A zero-advance character — a space — would otherwise divide the chord to
 * infinity when the width cap is computed.
 */
const MIN_ADVANCE = 0.3
/** How much of the em a capital spans vertically, for a quarter-turned glyph. */
const CAP_HEIGHT = 0.72

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n))

type Resolved = { kind: 'text'; text: string } | { kind: 'image'; href: string }

const round = (n: number): number => Math.round(n * 100) / 100

function resolveContent(content: PartContent, ctx: SliceContext): Resolved | null {
  switch (content.from) {
    case 'label':
      return { kind: 'text', text: applyTransform(content.transform ?? 'full', ctx.segment.label) }
    case 'text':
      return { kind: 'text', text: content.value }
    case 'media': {
      const media: Media | undefined = ctx.segment.media
      if (!media) return null
      return media.kind === 'emoji'
        ? { kind: 'text', text: media.value }
        : { kind: 'image', href: media.value }
    }
    case 'derived':
      switch (content.value) {
        case 'weight':
          return { kind: 'text', text: String(ctx.segment.weight) }
        case 'index':
          return { kind: 'text', text: String(ctx.index + 1) }
        case 'position':
          return { kind: 'text', text: `${ctx.index + 1}/${ctx.count}` }
      }
  }
}

type FittedOrientation = 'radial' | 'tangential' | 'curved'
type FittedPart = SlicePart & { orientation: FittedOrientation }

const isFitted = (part: SlicePart): part is FittedPart =>
  part.orientation === 'radial' ||
  part.orientation === 'tangential' ||
  part.orientation === 'curved'

/** The three orientations that predate parts, drawn exactly as they were. */
function fitted(part: FittedPart, ctx: SliceContext, text: string): SliceElement[] {
  const frame = part.frame ?? 'wheel'
  const [inner, outer] = part.band
  const placed = ctx.fit({
    text,
    orientation: part.orientation,
    frame,
    width: ctx.arc.end - ctx.arc.start,
    radius: ctx.radius,
    anchor: (inner + outer) / 2,
    maxSize: part.maxSize ?? DEFAULT_MAX_SIZE,
    minSize: MIN_SIZE,
  })
  if (!placed) return []

  // A level run is horizontal by construction, so it has no orientation left to
  // honor and always lays out as a straight line.
  if (frame === 'wheel' && part.orientation === 'curved') {
    return [
      { kind: 'curvedText', text: placed.text, anchor: placed.anchor, size: placed.size, frame },
    ]
  }
  return [
    {
      kind: 'text',
      text: placed.text,
      along: frame === 'level' || part.orientation === 'tangential' ? 'tangential' : 'radial',
      anchor: placed.anchor,
      size: placed.size,
      frame,
    },
  ]
}

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
      const room = chord(width, centre) * CHORD_FILL
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
    const room = chord(width, Math.max(radius, 1)) * CHORD_FILL
    const taken = across * size
    return taken > 0 ? clamp(room / taken, 1, MAX_STRETCH) : 1
  }
  return clamp(stretch, 1 / MAX_STRETCH, MAX_STRETCH)
}

/** `stacked` and `taperedRadial`: a run set along the radius. */
function radialRun(part: SlicePart, ctx: SliceContext, text: string): Glyph[] {
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

export function typeset(part: SlicePart, ctx: SliceContext): SliceElement[] {
  const resolved = resolveContent(part.content, ctx)
  if (resolved === null) return []

  const [inner, outer] = part.band
  if (resolved.kind === 'image') {
    return [
      {
        kind: 'image',
        href: resolved.href,
        anchor: (inner + outer) / 2,
        size: round((outer - inner) * ctx.radius),
        frame: part.frame,
      },
    ]
  }

  if (resolved.text.length === 0) return []
  if (isFitted(part)) return fitted(part, ctx, resolved.text)
  const glyphs = radialRun(part, ctx, resolved.text)
  return glyphs.length > 0 ? [{ kind: 'glyphRun', glyphs }] : []
}
