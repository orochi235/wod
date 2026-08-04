import type { Segment } from '../wheel/types'

/**
 * Derived from which list a wedge came from, never stored on the segment.
 * Storing it would let an imported preset claim a static wedge is external
 * with nothing to catch it.
 */
export type Origin =
  | { kind: 'static' }
  | { kind: 'external'; feedId: string; itemId: string }
  | { kind: 'computed'; trickId: string }

export type Composition = {
  segments: Segment[]
  origins: Map<string, Origin>
}
