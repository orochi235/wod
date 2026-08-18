import type { Breakpoint } from '../slice/breakpoints'
import type { SliceInstance } from '../slice/types'

/** Degrees. A three-wedge wheel is the widest thing worth a breakpoint of its own. */
export const AXIS_MIN_DEG = 2
export const AXIS_MAX_DEG = 120
/** Boundaries land on whole degrees, which is what keeps their turn fraction legible. */
export const STOP_STEP_DEG = 1

/** Doublings, so the narrow end where the layouts change gets its share of the track. */
export const toAxis = (degrees: number): number => Math.log2(degrees)
export const fromAxis = (axis: number): number => 2 ** axis

export const AXIS_MIN = toAxis(AXIS_MIN_DEG)
export const AXIS_MAX = toAxis(AXIS_MAX_DEG)

export type Band = {
  /** Index into the list this came from, or null for the span no breakpoint claims. */
  source: number | null
  /** Degrees. */
  from: number
  to: number
  /** Null where the band resolves to the wheel's own slice. */
  slice: SliceInstance | null
}

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n))

/** Whole degrees on the axis, from a position in axis units. */
export const snapDegrees = (axis: number): number =>
  clamp(Math.round(fromAxis(axis) / STOP_STEP_DEG) * STOP_STEP_DEG, AXIS_MIN_DEG, AXIS_MAX_DEG)

export type Floor = { source: number; degrees: number; slice: SliceInstance }

/**
 * The stored floors, narrowest first, each still knowing where it came from —
 * the stored order is the panel's business and a hand-edited preset need not
 * hold to it.
 */
export function floorsOf(breakpoints: Breakpoint[] | undefined): Floor[] {
  return (breakpoints ?? [])
    .map((point, source) => ({ source, degrees: point.from * 360, slice: point.slice }))
    .sort((a, b) => a.degrees - b.degrees)
}

/**
 * The spans the breakpoints cut the axis into, narrowest first. Derived rather
 * than stored, so a gap or an overlap is not a state the editor can reach.
 */
export function bandsOf(breakpoints: Breakpoint[] | undefined): Band[] {
  const floors = floorsOf(breakpoints)

  const edges: Band[] = [{ source: null, slice: null, from: AXIS_MIN_DEG, to: AXIS_MAX_DEG }]
  for (const floor of floors) {
    const from = clamp(floor.degrees, AXIS_MIN_DEG, AXIS_MAX_DEG)
    const previous = edges[edges.length - 1]
    previous.to = from
    edges.push({ source: floor.source, slice: floor.slice, from, to: AXIS_MAX_DEG })
  }
  return edges.filter((band) => band.to > band.from)
}

export type Split = { next: Breakpoint[]; from: number }

/**
 * A floor at the band's middle, carrying what the band already resolved to —
 * `wheelSlice` for the band no breakpoint claims. Null where the band has no
 * room for one. The inherited params are copied, or an edit to one half of the
 * split would land on the other.
 */
export function splitBand(
  breakpoints: Breakpoint[],
  band: Band,
  wheelSlice: SliceInstance | null,
): Split | null {
  if (band.to - band.from < 2 * STOP_STEP_DEG) return null
  const inherited = band.slice ?? wheelSlice
  if (!inherited) return null

  const middle = clamp(
    snapDegrees((toAxis(band.from) + toAxis(band.to)) / 2),
    band.from + STOP_STEP_DEG,
    band.to - STOP_STEP_DEG,
  )
  const slice = { id: inherited.id, params: structuredClone(inherited.params) }
  return { next: [...breakpoints, { from: middle / 360, slice }], from: middle }
}

/** Merges the band down into the one below it. */
export function removeBand(breakpoints: Breakpoint[], source: number | null): Breakpoint[] {
  if (source === null) return breakpoints
  return breakpoints.filter((_, index) => index !== source)
}
