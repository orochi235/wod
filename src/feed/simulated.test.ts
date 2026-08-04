import { describe, expect, it } from 'vitest'
import type { Rng } from '../wheel/selection'
import { churn, itemsFor } from './simulated'
import type { SimulatedFeedConfig } from './types'

const config: SimulatedFeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: ['Ana', 'Ben', 'Cal', 'Dee'],
  autochurn: { intervalMs: 1000, targetSize: 2, volatility: 0.5 },
}

/** Replays a fixed sequence, then repeats the last value. */
function rolls(...values: number[]): Rng {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('churn', () => {
  it('adds one person when below target', () => {
    expect(churn(config, [], rolls(0))).toEqual(['Ana'])
  })

  it('removes one person when above target', () => {
    expect(churn(config, ['Ana', 'Ben', 'Cal'], rolls(0))).toEqual(['Ben', 'Cal'])
  })

  it('converges on the target size', () => {
    const rng = rolls(0.1, 0.9, 0.4, 0.7)
    let present: string[] = []
    for (let i = 0; i < 10; i++) present = churn(config, present, rng)
    expect(present).toHaveLength(2)
  })

  it('saturates at the pool when the target exceeds it', () => {
    const small: SimulatedFeedConfig = {
      ...config,
      pool: ['Ana'],
      autochurn: { ...config.autochurn, targetSize: 5 },
    }
    let present: string[] = []
    for (let i = 0; i < 5; i++) present = churn(small, present, rolls(0))
    expect(present).toEqual(['Ana'])
  })

  it('holds steady at target when the volatility roll does not clear', () => {
    expect(churn(config, ['Ana', 'Ben'], rolls(0.99))).toEqual(['Ana', 'Ben'])
  })

  it('swaps one person for another when it does clear', () => {
    const next = churn(config, ['Ana', 'Ben'], rolls(0.1, 0, 0))
    expect(next).toHaveLength(2)
    expect(next).not.toEqual(['Ana', 'Ben'])
  })

  it('drops anyone no longer in the pool', () => {
    expect(churn(config, ['Ana', 'Zed'], rolls(0.99))).toEqual(['Ana'])
  })

  it('draws exactly three rolls for a swap, in order: volatility gate, who leaves, who joins', () => {
    let calls = 0
    const values = [0.1, 0, 0]
    const counting: Rng = () => values[Math.min(calls++, values.length - 1)]
    expect(churn(config, ['Ana', 'Ben'], counting)).toEqual(['Ben', 'Cal'])
    expect(calls).toBe(3)
  })
})

describe('itemsFor', () => {
  it('derives a stable id from the name, so overrides survive a rejoin', () => {
    expect(itemsFor(['Ana Lovelace'])).toEqual([{ id: 'ana-lovelace', label: 'Ana Lovelace' }])
    expect(itemsFor(['Ana Lovelace'])[0].id).toBe(itemsFor(['Ana Lovelace'])[0].id)
  })

  it('disambiguates two names that slugify the same', () => {
    expect(itemsFor(['Ana!', 'Ana?']).map((item) => item.id)).toEqual(['ana', 'ana-2'])
  })

  it('never emits an empty id', () => {
    expect(itemsFor(['!!!'])[0].id).toBe('item')
  })
})
