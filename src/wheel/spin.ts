import { arcs, restingRotationDeg } from './geometry'
import { landingSegments } from './morph'
import type { Rng, SelectionStrategy } from './selection'
import type { Segment, SpinConfig } from './types'

export type SpinPlan = {
  winnerId: string
  /** Wheel-local turn that will sit under the pointer when the wheel stops. */
  landingTurn: number
  /** Resting angle in [0, 360). Revolutions are added by the animator. */
  restingRotationDeg: number
  /** The segments as they will be at the moment of landing. */
  landing: Segment[]
}

/**
 * Fraction of the winning arc kept clear at each edge, so the pointer never
 * settles on a boundary where rounding could flip which segment it reads as.
 */
const EDGE_INSET = 0.08

export function planSpin(
  segments: Segment[],
  config: SpinConfig,
  strategy: SelectionStrategy,
  rng: Rng,
): SpinPlan | null {
  if (segments.length === 0) return null

  // Sample the distribution the pointer will actually meet, not the one on
  // screen right now. With morphs running, these are different wheels.
  const landing = landingSegments(segments, config.morphs, config.durationMs)
  const winnerId = strategy(landing, rng)
  if (!winnerId) return null

  const landingArcs = arcs(landing)
  const arc = landingArcs.find((a) => a.id === winnerId)
  if (!arc || !(arc.end > arc.start)) return null

  // Jitter within the arc. Always landing dead center would make repeated
  // spins look identical and give away that the outcome is precomputed.
  const width = arc.end - arc.start
  const inset = width * EDGE_INSET
  const landingTurn = arc.start + inset + rng() * (width - inset * 2)

  return {
    winnerId,
    landingTurn,
    restingRotationDeg: restingRotationDeg(landingTurn),
    landing,
  }
}
