import type { Arc } from './geometry'

/** Where the pegs go: on the wedge boundaries, or evenly spaced regardless of them. */
export type PegMode = { kind: 'bounds' } | { kind: 'fixed'; count: number }

/**
 * Peg positions as turns, 0 at 12 o'clock. A `bounds` peg sits on the line
 * between two wedges; a `fixed` one ignores the roster entirely.
 */
export function pegAngles(mode: PegMode, arcs: Arc[]): number[] {
  if (mode.kind === 'fixed') {
    const count = Math.floor(mode.count)
    if (!Number.isFinite(count) || count <= 0) return []
    return Array.from({ length: count }, (_, i) => i / count)
  }
  // A zero-width wedge shares both its boundaries with a neighbor, and two pegs
  // on one angle is one peg the flapper strikes twice.
  return arcs.filter((arc) => arc.end > arc.start).map((arc) => arc.start)
}
