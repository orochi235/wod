import type { SliceInstance } from './types'

/** Turns. The narrowest wedge this instance still suits. */
export type Breakpoint = { from: number; slice: SliceInstance }

/**
 * What a wedge this wide is set as, or undefined when no breakpoint claims it —
 * which is the caller's cue to resolve as it did before there were any.
 *
 * Resolved by the widest floor at or below the width rather than by list order,
 * so a hand-edited preset that lists its breakpoints the other way up still
 * answers the same.
 */
export function sliceAt(
  breakpoints: Breakpoint[] | undefined,
  width: number | undefined,
): SliceInstance | undefined {
  if (!breakpoints || width === undefined) return undefined

  let best: Breakpoint | undefined
  for (const point of breakpoints) {
    if (width >= point.from && (best === undefined || point.from > best.from)) best = point
  }
  return best?.slice
}
