import { describe, expect, it } from 'vitest'
import { wedgeIndexOf } from '../../compose/compose'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { relabel } from './relabel'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const ctx: RecipeContext = {
  trickId: 't1',
  segments,
  origins: new Map(),
  durationMs: 1000,
  roll: 0,
}

describe('relabel', () => {
  it('provides no segments', () => {
    expect(relabel.provides({}, 't1')).toEqual([])
  })

  it('holds the base label until the switch point', () => {
    const [morph] = relabel.resolve({ targets: ['ana'], toLabel: 'LOSER', at: 0.8 }, ctx)
    expect(morph.keyframes).toEqual([
      { at: 0, label: 'Ana' },
      { at: 0.8, label: 'LOSER' },
    ])
  })

  it('steps rather than blending', () => {
    const morphs = relabel.resolve({ targets: ['ana'], toLabel: 'LOSER', at: 0.8 }, ctx)
    const before = applyMorphs(segments, morphs, 799)
    const after = applyMorphs(segments, morphs, 801)
    expect(before.find((s) => s.id === 'ana')?.label).toBe('Ana')
    expect(after.find((s) => s.id === 'ana')?.label).toBe('LOSER')
  })

  it('never touches weight or color', () => {
    const morphs = relabel.resolve({ targets: [], toLabel: 'X' }, ctx)
    // Empty targets means every wedge. Pinned so the loop below cannot pass
    // vacuously on a resolver that returned nothing at all.
    expect(morphs.map((morph) => morph.segmentId)).toEqual(['ana', 'ben'])
    for (const morph of morphs) {
      expect(morph.keyframes.every((k) => k.weight === undefined && k.color === undefined)).toBe(
        true,
      )
    }
  })

  it('declares exactly the labels it writes', () => {
    expect(relabel.writes({ targets: ['ben'], toLabel: 'X' }, ctx)).toEqual([
      { segmentId: 'ben', property: 'label' },
    ])
  })

  it('rejects a missing target', () => {
    expect(relabel.validate({ targets: ['ghost'] }, wedgeIndexOf(segments))).toMatch(/ghost/)
  })

  it('accepts a selector token that matches nothing yet', () => {
    expect(relabel.validate({ targets: ['@external'] }, wedgeIndexOf(segments))).toBeNull()
  })

  it('reports a misspelled token as an unknown wedge', () => {
    expect(relabel.validate({ targets: ['@extrenal'] }, wedgeIndexOf(segments))).toMatch(
      /@extrenal/,
    )
  })
})
