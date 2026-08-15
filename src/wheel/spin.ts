import { arcs, restingRotationDeg } from './geometry'
import { landingSegments } from './morph'
import { type PegMode, pegAngles } from './pegs'
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
  catchPegs?: PegMode,
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
  const jittered = arc.start + inset + rng() * (width - inset * 2)
  // Pegs at the landing, not now: the roster it will meet is `landing`.
  const landingTurn = catchPegs
    ? caughtLandingTurn(
        jittered,
        pegAngles(catchPegs, landingArcs),
        arc.start + inset,
        arc.end - inset,
      )
    : jittered

  return {
    winnerId,
    landingTurn,
    restingRotationDeg: restingRotationDeg(landingTurn),
    landing,
  }
}

/** How far off a peg the arm holds the wheel, in turns. */
export const CATCH_REACH = 0.004

const wrapTurn = (turn: number): number => ((turn % 1) + 1) % 1

/** Shortest signed distance from `to` to `from`, in [-0.5, 0.5). */
function apart(from: number, to: number): number {
  let delta = wrapTurn(from) - wrapTurn(to)
  if (delta > 0.5) delta -= 1
  if (delta < -0.5) delta += 1
  return delta
}

/**
 * Where a wheel that died against a peg actually comes to rest. Planned rather
 * than emergent: this runs before the winner's arc is left behind, and its
 * result is clamped to that arc, so what the pointer shows and what is announced
 * cannot come apart.
 *
 * `min` and `max` are the winner's arc, already inset from its edges.
 */
export function caughtLandingTurn(
  landingTurn: number,
  pegs: number[],
  min: number,
  max: number,
): number {
  if (pegs.length === 0) return landingTurn

  let nearest = pegs[0]
  let closest = Math.abs(apart(landingTurn, pegs[0]))
  for (const peg of pegs) {
    const distance = Math.abs(apart(landingTurn, peg))
    if (distance < closest) {
      closest = distance
      nearest = peg
    }
  }
  if (closest >= CATCH_REACH) return landingTurn

  // Off the peg, on whichever side is still inside the wedge that won.
  const at = landingTurn - apart(landingTurn, nearest)
  const back = at - CATCH_REACH
  if (back >= min && back <= max) return back
  const forward = at + CATCH_REACH
  if (forward >= min && forward <= max) return forward
  // The wedge is narrower than the arm's reach. Leaving the arc would change
  // the winner, so the landing stands.
  return landingTurn
}
