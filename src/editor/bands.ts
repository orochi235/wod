import type { Breakpoint } from '../slice/breakpoints'
import type { SliceInstance } from '../slice/types'

/** Degrees. A three-wedge wheel is the widest thing worth a breakpoint of its own. */
export const AXIS_MIN_DEG = 2
export const AXIS_MAX_DEG = 120

/**
 * The widths a wheel of equal wedges can actually have — every divisor of 360
 * the axis covers. A floor authored here is one wedge of an n-wedge wheel, so
 * it reads as `1/n`; whole degrees would not, since 42° is `7/60`.
 *
 * Uniform wedges are the editor's assumption, not the data's: everything below
 * takes the stop list as an argument, and `bandsOf` never snaps, so a preset
 * carrying a floor off this grid keeps it until someone drags that stop.
 */
export const STOPS: readonly number[] = Array.from(
  { length: AXIS_MAX_DEG - AXIS_MIN_DEG + 1 },
  (_, index) => index + AXIS_MIN_DEG,
).filter((degrees) => 360 % degrees === 0)

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

/** The stop nearest a position in axis units, measured along the axis itself. */
export const snapDegrees = (axis: number, stops: readonly number[] = STOPS): number => {
  const target = toAxis(clamp(fromAxis(axis), stops[0], stops[stops.length - 1]))
  let best = stops[0]
  // Ties go to the narrower stop: the log middle of two stops whose product is
  // 360 sits exactly between them, which is where `splitBand` most often lands.
  for (const stop of stops) {
    if (Math.abs(toAxis(stop) - target) < Math.abs(toAxis(best) - target) - 1e-9) best = stop
  }
  return best
}

/** The next stop along, or the end of the axis where there is none. */
export const stopAbove = (degrees: number, stops: readonly number[] = STOPS): number =>
  stops.find((stop) => stop > degrees) ?? stops[stops.length - 1]

export const stopBelow = (degrees: number, stops: readonly number[] = STOPS): number =>
  stops.reduce((below, stop) => (stop < degrees ? stop : below), stops[0])

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
  const low = stopAbove(band.from)
  const high = stopBelow(band.to)
  if (low > high) return null
  const inherited = band.slice ?? wheelSlice
  if (!inherited) return null

  const middle = clamp(snapDegrees((toAxis(band.from) + toAxis(band.to)) / 2), low, high)
  const slice = { id: inherited.id, params: structuredClone(inherited.params) }
  return { next: [...breakpoints, { from: middle / 360, slice }], from: middle }
}

/** Merges the band down into the one below it. */
export function removeBand(breakpoints: Breakpoint[], source: number | null): Breakpoint[] {
  if (source === null) return breakpoints
  return breakpoints.filter((_, index) => index !== source)
}
