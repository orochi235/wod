import { normalizeWeights } from './geometry'
import type { Weighted } from './geometry'

/** Returns a float in [0, 1). */
export type Rng = () => number

export type SelectionStrategy = (candidates: Weighted[], rng: Rng) => string | null

export const cryptoRng: Rng = () => {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / 2 ** 32
}

export const weightedRandom: SelectionStrategy = (candidates, rng) => {
  if (candidates.length === 0) return null
  const fractions = normalizeWeights(candidates)
  const roll = rng()
  let cumulative = 0
  for (let i = 0; i < candidates.length; i++) {
    cumulative += fractions[i]
    // Strictly greater, so a zero-weight candidate can never win: it does not
    // advance the cumulative total past whatever the previous one already cleared.
    if (cumulative > roll) return candidates[i].id
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (fractions[i] > 0) return candidates[i].id
  }
  return null
}

/** The rig. Degrades to a fair draw rather than erroring mid-spin. */
export function forced(segmentId: string): SelectionStrategy {
  return (candidates, rng) => {
    const target = candidates.find((c) => c.id === segmentId)
    if (target && target.weight > 0) return segmentId
    return weightedRandom(candidates, rng)
  }
}
