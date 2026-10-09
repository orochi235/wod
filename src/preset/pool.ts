import type { Segment } from '../wheel/types'
import type { Pool, Preset } from './types'

/** A number in [0, 1), as `Math.random` gives one. */
export type Random = () => number

/**
 * Draws `pool.draw` candidates without replacement, in a shuffled order. Every
 * candidate starts at the same odds; drawing one multiplies the odds of each of
 * its affinity mates by the affinity's boost.
 */
export function drawPool(pool: Pool, random: Random): Segment[] {
  const odds = new Map(pool.segments.map((segment) => [segment.id, 1]))
  const drawn: Segment[] = []
  while (drawn.length < pool.draw && odds.size > 0) {
    let total = 0
    for (const value of odds.values()) total += value
    let roll = random() * total
    let pick = pool.segments.find((segment) => odds.has(segment.id)) as Segment
    for (const segment of pool.segments) {
      const value = odds.get(segment.id)
      if (value === undefined) continue
      if (roll < value) {
        pick = segment
        break
      }
      roll -= value
    }
    odds.delete(pick.id)
    drawn.push(pick)
    for (const affinity of pool.affinities) {
      if (!affinity.ids.includes(pick.id)) continue
      for (const id of affinity.ids) {
        const value = odds.get(id)
        if (value !== undefined) odds.set(id, value * affinity.boost)
      }
    }
  }
  // Drawn in order of odds, so a boosted mate would trail its partner without a shuffle.
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[drawn[i], drawn[j]] = [drawn[j], drawn[i]]
  }
  return drawn
}

/** The preset with its pool drawn into its segments, and no pool left to draw. */
export function withPool(preset: Preset, random: Random): Preset {
  if (!preset.pool) return preset
  const { pool, ...rest } = preset
  return { ...rest, segments: [...preset.segments, ...drawPool(pool, random)] }
}
