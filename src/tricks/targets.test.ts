import { describe, expect, it } from 'vitest'
import type { Origin } from '../compose/types'
import type { Segment } from '../wheel/types'
import { isSelectorToken, resolveTargets } from './targets'

const segments: Segment[] = [
  { id: 'seg1', label: 'Spin again', weight: 1 },
  { id: 'sim:ana', label: 'Ana', weight: 1 },
  { id: 'sim:ben', label: 'Ben', weight: 0 },
  { id: 'beer:wedge', label: 'Free beer', weight: 0 },
]

const origins = new Map<string, Origin>([
  ['seg1', { kind: 'static' }],
  ['sim:ana', { kind: 'external', feedId: 'sim', itemId: 'ana' }],
  ['sim:ben', { kind: 'external', feedId: 'sim', itemId: 'ben' }],
  ['beer:wedge', { kind: 'computed', trickId: 'beer' }],
])

const ctx = { segments, origins, roll: 0 }
const ids = (result: Segment[]) => result.map((segment) => segment.id)

describe('resolveTargets', () => {
  it('treats an empty list as every wedge, as the recipes always have', () => {
    expect(ids(resolveTargets([], ctx))).toEqual(['seg1', 'sim:ana', 'sim:ben', 'beer:wedge'])
  })

  it('resolves concrete ids', () => {
    expect(ids(resolveTargets(['sim:ana'], ctx))).toEqual(['sim:ana'])
  })

  it('ignores an id that is not on the wheel', () => {
    expect(ids(resolveTargets(['gone'], ctx))).toEqual([])
  })

  it('expands each origin token', () => {
    expect(ids(resolveTargets(['@static'], ctx))).toEqual(['seg1'])
    expect(ids(resolveTargets(['@external'], ctx))).toEqual(['sim:ana', 'sim:ben'])
    expect(ids(resolveTargets(['@computed'], ctx))).toEqual(['beer:wedge'])
  })

  it('makes @all the union of the other three', () => {
    expect(ids(resolveTargets(['@all'], ctx))).toEqual(
      ids(resolveTargets(['@static', '@external', '@computed'], ctx)),
    )
  })

  it('selects zero-weight wedges, which is what lets a trick grow one', () => {
    expect(ids(resolveTargets(['@external'], ctx))).toContain('sim:ben')
  })

  it('composes a token with a concrete id, in wheel order and deduped', () => {
    expect(ids(resolveTargets(['@external', 'seg1', 'sim:ana'], ctx))).toEqual([
      'seg1',
      'sim:ana',
      'sim:ben',
    ])
  })

  it('picks a stable external wedge from the roll', () => {
    expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll: 0 }))).toEqual(['sim:ana'])
    expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll: 0.9 }))).toEqual(['sim:ben'])
    // The same roll must give the same answer however many times it is asked,
    // because evaluateWheel re-resolves once per branch depth.
    expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll: 0.9 }))).toEqual(['sim:ben'])
  })

  it('resolves @randomExternal to nothing when no feed has published', () => {
    expect(
      resolveTargets(['@randomExternal'], { segments: [], origins: new Map(), roll: 0 }),
    ).toEqual([])
  })

  it('clamps a roll from outside the unit interval at both ends', () => {
    // Rng promises [0, 1), but an imported or hand-built roll need not honor it,
    // and an out-of-range index would read undefined off the candidate list.
    for (const roll of [-0.0001, -1, Number.NEGATIVE_INFINITY, Number.NaN]) {
      expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll }))).toEqual(['sim:ana'])
    }
    for (const roll of [1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll }))).toEqual(['sim:ben'])
    }
  })

  it('recognizes exactly the five tokens', () => {
    expect(isSelectorToken('@external')).toBe(true)
    expect(isSelectorToken('@nonsense')).toBe(false)
    expect(isSelectorToken('seg1')).toBe(false)
  })
})
