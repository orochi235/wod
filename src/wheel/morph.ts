import { segmentsAt } from '../clock/compose'
import type { Morph, Segment } from './types'

/**
 * The weight distribution the pointer will meet when the wheel stops. Selection
 * samples this, never the launch distribution.
 */
export function landingSegments(
  segments: Segment[],
  morphs: Morph[],
  spinDurationMs: number,
): Segment[] {
  return segmentsAt(segments, morphs, spinDurationMs)
}
