import { landingSegments } from './morph'
import { type OutagePlan, withOutage } from './outage'
import type { PegMode } from './pegs'
import { type RotationTrack, rotationTrack } from './rotation'
import { type Rng, type SelectionStrategy, weightedRandom } from './selection'
import { type SpinPlan, planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

export type ShowInput = {
  segments: Segment[]
  config: SpinConfig
  strategy?: SelectionStrategy
  rng: Rng
  /** Where the wheel rests now. */
  from: number
  /** How long the authored spin plays: the config's, or shorter under reduced motion. */
  durationMs: number
  /** Whether the outage prologue may play. Reduced motion is spared it. */
  outage?: boolean
  resolveLate?: (winnerId: string) => Morph[]
  catchPegs?: PegMode
}

/** One spin, planned: who wins, how the wheel turns there, and what plays on the way. */
export type Show = {
  plan: SpinPlan
  segments: Segment[]
  morphs: Morph[]
  landedFrame: Segment[]
  track: RotationTrack
  outagePlan: OutagePlan | null
  /** When the morphs start, ms from the start of the show. */
  morphsAt: number
}

export function planShow(input: ShowInput): Show | null {
  const { segments, config, rng, from, durationMs } = input
  const plan = planSpin(segments, config, input.strategy ?? weightedRandom, rng, input.catchPegs)
  if (!plan) return null
  const late = input.resolveLate?.(plan.winnerId)
  const morphs = late ?? config.morphs
  // plan.landing was sampled from pass 1 and still shows the pre-swap labels;
  // landing on it would undo the trick as it fires.
  const landedFrame = late ? landingSegments(segments, late, config.durationMs) : plan.landing
  const planned = rotationTrack(from, plan.restingRotationDeg, config, durationMs)
  const outaged =
    config.outage && (input.outage ?? true) && durationMs > 0
      ? withOutage(planned, config.outage)
      : null
  return {
    plan,
    segments,
    morphs,
    landedFrame,
    track: outaged?.track ?? planned,
    outagePlan: outaged?.plan ?? null,
    morphsAt: outaged?.plan.resumedAtMs ?? 0,
  }
}
