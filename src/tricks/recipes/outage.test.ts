import { describe, expect, it } from 'vitest'
import { composeBase } from '../../compose/compose'
import { resolveTricks } from '../resolve'
import type { Trick } from '../types'
import { outage } from './outage'

const base = composeBase({
  statics: [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
  ],
  feeds: [],
  items: {},
  overrides: {},
})

const trick = (id: string, params: Trick['params'], enabled = true): Trick => ({
  id,
  name: id,
  recipe: 'outage',
  params,
  enabled,
})

describe('outage', () => {
  it('cues in milliseconds from the seconds it is authored in', () => {
    expect(outage.cues?.({ cruiseS: 12, sparkS: 4 })).toEqual([
      { kind: 'outage', cruiseMs: 12000, sparkMs: 4000 },
    ])
  })

  it('keeps a hand-edited value inside the sliders', () => {
    expect(outage.cues?.({ cruiseS: 900, sparkS: -2 })).toEqual([
      { kind: 'outage', cruiseMs: 30000, sparkMs: 1000 },
    ])
  })

  it('touches no wedge', () => {
    const resolved = resolveTricks(base, [trick('o', outage.defaults)], 4000)
    expect(resolved.morphs).toEqual([])
    expect(resolved.segments.map((segment) => segment.id)).toEqual(['ana', 'ben'])
  })

  it('reaches the resolution only when enabled, and only the first one listed', () => {
    expect(resolveTricks(base, [trick('o', outage.defaults, false)], 4000).outage).toBeUndefined()
    const both = resolveTricks(
      base,
      [trick('a', { cruiseS: 5, sparkS: 2 }), trick('b', { cruiseS: 20, sparkS: 8 })],
      4000,
    )
    expect(both.outage).toEqual({ cruiseMs: 5000, sparkMs: 2000 })
  })
})
