import type { Segment } from '../wheel/types'
import { auto } from './layouts/auto'
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
}

export const SLICE_LIST: SliceLayout[] = [auto, composed, curved, tangential, radial]

export const DEFAULT_SLICE: SliceInstance = { id: 'auto', params: { ...auto.defaults } }

/**
 * Returns null rather than throwing, matching getTransition: ids come out of
 * localStorage, and a stored id of 'constructor' resolves through the prototype
 * chain to something that is not a layout.
 */
export function getSlice(id: string): SliceLayout | null {
  return Object.hasOwn(SLICE_LAYOUTS, id) ? SLICE_LAYOUTS[id as SliceLayoutId] : null
}

/** Segment override beats the wheel default beats the built-in. */
export function resolveInstance(
  segment: Segment,
  wheelDefault: SliceInstance | undefined,
): SliceInstance {
  return segment.slice ?? wheelDefault ?? DEFAULT_SLICE
}
