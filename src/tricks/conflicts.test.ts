import { describe, expect, it } from 'vitest'
import { composeBase } from '../compose/compose'
import type { Segment } from '../wheel/types'
import { findConflicts } from './conflicts'
import type { Trick } from './types'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const base = composeBase({ statics: people, feeds: [], items: {}, overrides: {} })

const takeoverAll: Trick = {
  id: 'beer',
  name: 'slow burn',
  recipe: 'takeover',
  params: { wedgeMode: 'new', wedgeLabel: 'beer', wedgeColor: '#ffd166', endShare: 1 },
  enabled: true,
}

const vanishAna: Trick = {
  id: 'v',
  name: 'ana goes',
  recipe: 'vanish',
  params: { targets: ['ana'] },
  enabled: true,
}

const grayEveryone: Trick = {
  id: 'gray',
  name: 'gray',
  recipe: 'recolor',
  params: { targets: [], toColor: '#888888' },
  enabled: true,
}

describe('findConflicts', () => {
  it('reports nothing for a single trick', () => {
    expect(findConflicts(base, [takeoverAll], 1000)).toEqual([])
  })

  it('reports nothing when two tricks write different properties', () => {
    expect(findConflicts(base, [takeoverAll, grayEveryone], 1000)).toEqual([])
  })

  it('reports a segment two tricks both write the weight of', () => {
    const conflicts = findConflicts(base, [takeoverAll, vanishAna], 1000)
    expect(conflicts).toEqual([{ segmentId: 'ana', property: 'weight', trickIds: ['beer', 'v'] }])
  })

  it('ignores disabled tricks', () => {
    const conflicts = findConflicts(base, [takeoverAll, { ...vanishAna, enabled: false }], 1000)
    expect(conflicts).toEqual([])
  })
})
