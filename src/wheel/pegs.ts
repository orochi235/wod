import type { Arc } from './geometry'

/**
 * Where the pegs go: on the wedge boundaries, or evenly spaced regardless of
 * them. `per` puts that many on each wedge — the first on the boundary and the
 * rest spaced across it — for a rim that wants more studs than it has seams.
 */
export type PegMode = { kind: 'bounds'; per?: number } | { kind: 'fixed'; count: number }

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
  const per = Math.floor(mode.per ?? 1)
  const each = Number.isFinite(per) && per > 0 ? per : 1
  // A zero-width wedge shares both its boundaries with a neighbor, and two pegs
  // on one angle is one peg the flapper strikes twice.
  return arcs
    .filter((arc) => arc.end > arc.start)
    .flatMap((arc) =>
      Array.from({ length: each }, (_, i) => arc.start + ((arc.end - arc.start) * i) / each),
    )
}
