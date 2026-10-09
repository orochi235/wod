import { describe, expect, it } from 'vitest'
import type { Segment } from '../wheel/types'
import { drawPool, withPool } from './pool'
import { parsePreset } from './storage'
import type { Pool } from './types'
import { WHEEL_OF_D_POOL, wheelOfD } from './wheelOfD'

/** A small deterministic generator, so a draw can be replayed. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }
}

const seg = (id: string): Segment => ({ id, label: id, weight: 1 })
const pool = (ids: string[], draw: number, affinities: Pool['affinities'] = []): Pool => ({
  segments: ids.map(seg),
  draw,
  affinities,
})

describe('drawPool', () => {
  it('draws the asked-for number, with no repeats', () => {
    const drawn = drawPool(pool(['a', 'b', 'c', 'd', 'e'], 3), seeded(1))
    expect(drawn).toHaveLength(3)
    expect(new Set(drawn.map((s) => s.id)).size).toBe(3)
  })

  it('draws everything when asked for more than it holds', () => {
    expect(drawPool(pool(['a', 'b'], 5), seeded(2))).toHaveLength(2)
  })

  it('replays the same draw from the same seed', () => {
    const p = pool(['a', 'b', 'c', 'd', 'e', 'f'], 3)
    expect(drawPool(p, seeded(7))).toEqual(drawPool(p, seeded(7)))
  })

  it('pulls an affinity mate in far more often than chance', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `w${i}`)
    const together = (boost: number) => {
      const p = pool(ids, 4, [{ ids: ['w0', 'w1'], boost }])
      let both = 0
      let either = 0
      const random = seeded(11)
      for (let run = 0; run < 2000; run++) {
        const drawn = new Set(drawPool(p, random).map((s) => s.id))
        if (drawn.has('w0') || drawn.has('w1')) either++
        if (drawn.has('w0') && drawn.has('w1')) both++
      }
      return both / either
    }
    expect(together(20)).toBeGreaterThan(together(1) * 3)
  })

  it('seats drawn mates side by side, in the affinity order', () => {
    const p = pool(['a', 'b', 'c', 'd', 'e', 'f'], 6, [{ ids: ['c', 'e'], boost: 1 }])
    for (let seed = 0; seed < 20; seed++) {
      const order = drawPool(p, seeded(seed)).map((s) => s.id)
      const at = order.indexOf('c')
      expect(order[at + 1]).toBe('e')
    }
  })
})

describe('withPool', () => {
  it('leaves a preset with no pool alone', () => {
    const preset = parsePreset(null)
    expect(withPool(preset, seeded(1))).toBe(preset)
  })

  it('draws the pool into the segments and drops it', () => {
    const drawn = withPool(wheelOfD, seeded(3))
    expect(drawn.pool).toBeUndefined()
    expect(drawn.segments).toHaveLength(24)
  })
})

describe('the wheel of D pool', () => {
  it('gives every word an id of its own, and every affinity real members', () => {
    const ids = WHEEL_OF_D_POOL.segments.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const affinity of WHEEL_OF_D_POOL.affinities) {
      for (const id of affinity.ids) expect(ids).toContain(id)
    }
  })
})

describe('reading a pool', () => {
  const base = (pool: unknown): string =>
    JSON.stringify({ ...parsePreset(null), segments: [seg('s')], pool })

  it('drops affinity members it has no candidate for, and an affinity left with one', () => {
    const read = parsePreset(
      base({
        segments: [seg('a'), seg('b')],
        draw: 1,
        affinities: [{ ids: ['a', 'zz'], boost: 3 }],
      }),
    )
    expect(read.pool?.affinities).toEqual([])
  })

  it('drops a candidate sharing an id with a static wedge', () => {
    const read = parsePreset(base({ segments: [seg('s'), seg('a')], draw: 1, affinities: [] }))
    expect(read.pool?.segments.map((s) => s.id)).toEqual(['a'])
  })

  it('clamps the draw to what the pool holds', () => {
    expect(parsePreset(base({ segments: [seg('a')], draw: 9, affinities: [] })).pool?.draw).toBe(1)
  })

  it('reads no pool from a preset without one', () => {
    expect(parsePreset(base(undefined)).pool).toBeUndefined()
  })
})
