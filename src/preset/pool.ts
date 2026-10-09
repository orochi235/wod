import type { Segment } from '../wheel/types'
import type { Pool, Preset } from './types'

/** A number in [0, 1), as `Math.random` gives one. */
export type Random = () => number

/**
 * Draws `pool.draw` candidates without replacement. Every candidate starts at the
 * same odds; drawing one multiplies the odds of each of its affinity mates by the
 * affinity's boost. The draw is laid out in blocks, shuffled: a candidate drawn
 * with mates is one block, the mates following it in the affinity's order.
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

  const picked = new Set(drawn.map((segment) => segment.id))
  const placed = new Set<string>()
  const blocks: Segment[][] = []
  for (const segment of drawn) {
    if (placed.has(segment.id)) continue
    // The whole group comes in at its first drawn member, each in the group's own order.
    const order = [
      ...new Set(
        pool.affinities
          .filter((affinity) => affinity.ids.includes(segment.id))
          .flatMap((affinity) => affinity.ids),
      ),
    ]
    const block =
      order.length === 0
        ? [segment]
        : order
            .filter((id) => picked.has(id) && !placed.has(id))
            .map((id) => drawn.find((other) => other.id === id) as Segment)
    for (const member of block) placed.add(member.id)
    blocks.push(block)
  }
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
  }
  return blocks.flat()
}

/** The preset with its pool drawn into its segments, and no pool left to draw. */
export function withPool(preset: Preset, random: Random): Preset {
  if (!preset.pool) return preset
  const { pool, ...rest } = preset
  return { ...rest, segments: [...preset.segments, ...drawPool(pool, random)] }
}
