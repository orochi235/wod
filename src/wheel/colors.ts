import type { Origin } from '../compose/types'
import { DEFAULT_PALETTE, paletteColor } from './palette'
import type { Segment } from './types'

export type ColorContext = {
  index: number
  count: number
  /** Colors already spoken for this pass, so a pick cannot duplicate one. */
  taken: ReadonlySet<string>
  origin: Origin | undefined
  palette: readonly string[]
}

/** Returning undefined falls through to the default palette assignment. */
export type ChooseColor = (segment: Segment, ctx: ColorContext) => string | undefined

/** Ids a wheel is still drawing, including wedges animating out. */
export type RetainedIds = { current: ReadonlySet<string> }

export type ColorState = {
  previous: ReadonlyMap<string, string>
  retained: ReadonlySet<string>
  choose?: ChooseColor
}

export const EMPTY_COLOR_STATE: ColorState = {
  previous: new Map(),
  retained: new Set(),
}

/**
 * Assigns a palette color to every wedge that has none, keeping a wedge on the
 * swatch it already had. `retained` names wedges that have left the roster but
 * are still being drawn, whose swatches stay reserved for the length of an exit.
 *
 * The returned map holds default assignments only — never authored or chosen
 * colors, which are recomputed each pass so a consumer's mapping can change.
 */
export function assignColors(
  segments: Segment[],
  origins: ReadonlyMap<string, Origin>,
  state: ColorState,
): { segments: Segment[]; colors: Map<string, string> } {
  const { previous, retained, choose } = state
  const keep = new Set<string>(retained)
  for (const segment of segments) keep.add(segment.id)

  const colors = new Map<string, string>()
  for (const [id, color] of previous) {
    if (keep.has(id)) colors.set(id, color)
  }

  const taken = new Set<string>(colors.values())
  const chosen = new Map<string, string>()
  segments.forEach((segment, index) => {
    if (segment.color !== undefined) {
      taken.add(segment.color)
      return
    }
    const picked = choose?.(segment, {
      index,
      count: segments.length,
      taken,
      origin: origins.get(segment.id),
      palette: DEFAULT_PALETTE,
    })
    if (picked !== undefined) {
      chosen.set(segment.id, picked)
      taken.add(picked)
    }
  })

  const out = segments.map((segment) => {
    if (segment.color !== undefined) return segment
    const picked = chosen.get(segment.id)
    if (picked !== undefined) return { ...segment, color: picked }
    let color = colors.get(segment.id)
    if (color === undefined) {
      color = DEFAULT_PALETTE.find((swatch) => !taken.has(swatch)) ?? paletteColor(colors.size)
      colors.set(segment.id, color)
      taken.add(color)
    }
    return { ...segment, color }
  })

  return { segments: out, colors }
}
