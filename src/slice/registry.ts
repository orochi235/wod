import type { Segment } from '../wheel/types'
import { type Breakpoint, sliceAt } from './breakpoints'
import { auto } from './layouts/auto'
import { cash } from './layouts/cash'
import { composed } from './layouts/composed'
import { curved } from './layouts/curved'
import { radial } from './layouts/radial'
import { tangential } from './layouts/tangential'
import type { SliceInstance, SliceLayout, SliceLayoutId } from './types'

export const SLICE_LAYOUTS: Record<SliceLayoutId, SliceLayout> = {
  auto,
  radial,
  tangential,
  curved,
  composed,
  cash,
}

export const SLICE_LIST: SliceLayout[] = [auto, composed, cash, curved, tangential, radial]

/**
 * The name plate: given name on an arc inside the rim, surname in capitals down
 * the wedge. Two parts rather than one run, because a full name set either way
 * alone is bad at the size a roster needs — horizontal it is bounded by the
 * chord, stacked it solves below the floor and overruns its band.
 */
export const DEFAULT_SLICE: SliceInstance = {
  id: 'composed',
  params: {
    parts: [
      // Capped, or the arc's room makes the given name the loudest thing on the
      // wedge — the surname is the one being called out.
      {
        content: { from: 'label', transform: 'firstName' },
        orientation: 'archedRim',
        band: [0.82, 0.95],
        maxSize: 22,
      },
      {
        content: { from: 'label', transform: 'lastName' },
        orientation: 'stacked',
        band: [0.2, 0.78],
        caps: true,
        stretch: 'fill',
      },
    ],
  },
}

/**
 * Returns null rather than throwing, matching getTransition: ids come out of
 * localStorage, and a stored id of 'constructor' resolves through the prototype
 * chain to something that is not a layout.
 */
export function getSlice(id: string): SliceLayout | null {
  return Object.hasOwn(SLICE_LAYOUTS, id) ? SLICE_LAYOUTS[id as SliceLayoutId] : null
}

/** Segment override beats a matching breakpoint beats the wheel default beats the built-in. */
export function resolveInstance(
  segment: Segment,
  wheelDefault: SliceInstance | undefined,
  breakpoints?: Breakpoint[],
  /** Turns. Absent resolves as it did before there were breakpoints. */
  width?: number,
): SliceInstance {
  return segment.slice ?? sliceAt(breakpoints, width) ?? wheelDefault ?? DEFAULT_SLICE
}

/**
 * Every instance a wheel could resolve to, whatever its wedges end up as wide
 * as. What font preloading needs: it runs before any wedge has a width, and a
 * face fetched only once a wedge reaches the breakpoint that wants it arrives
 * after the run that measured against the fallback has already been cached.
 */
export function instancesUsed(
  segments: Segment[],
  wheelDefault: SliceInstance | undefined,
  breakpoints: Breakpoint[] | undefined,
): SliceInstance[] {
  return [
    ...segments.map((segment) => resolveInstance(segment, wheelDefault)),
    ...(breakpoints ?? []).map((point) => point.slice),
  ]
}
