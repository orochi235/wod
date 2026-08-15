import type { Segment } from './types'

export const DEFAULT_PALETTE = ['#f4a261', '#2a9d8f', '#e76f51', '#e9c46a', '#8ab17d', '#5f8dd3']

export function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
}

/**
 * An authored color, or the palette entry for the segment's position.
 *
 * No longer what the wheel paints: `usePresence` assigns an uncolored wedge a
 * swatch by id and keeps it, so after a departure these disagree for every
 * uncolored segment. A trick reading this for an `at: 0` keyframe starts from a
 * color the wedge is not showing.
 */
export function effectiveColor(segments: Segment[], id: string): string | null {
  const index = segments.findIndex((s) => s.id === id)
  if (index === -1) return null
  return segments[index].color ?? paletteColor(index)
}
