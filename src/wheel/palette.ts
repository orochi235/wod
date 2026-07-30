import type { Segment } from './types'

export const DEFAULT_PALETTE = ['#f4a261', '#2a9d8f', '#e76f51', '#e9c46a', '#8ab17d', '#5f8dd3']

export function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
}

/** The color the wheel actually paints, resolving the palette fallback. */
export function effectiveColor(segments: Segment[], id: string): string | null {
  const index = segments.findIndex((s) => s.id === id)
  if (index === -1) return null
  return segments[index].color ?? paletteColor(index)
}
