import { describe, expect, it } from 'vitest'
import { rosterDiff } from './diff'

describe('rosterDiff', () => {
  const ada = { id: 'p1', label: 'Ada', kind: 'signedin' as const }
  const bob = { id: 'p2', label: 'Bob', kind: 'signedin' as const }

  it('reports a join', () => {
    expect(rosterDiff([ada], [ada, bob])).toEqual({ joined: [bob], left: [] })
  })

  it('reports a leave', () => {
    expect(rosterDiff([ada, bob], [ada])).toEqual({ joined: [], left: [bob] })
  })

  it('is quiet when nothing moved', () => {
    expect(rosterDiff([ada, bob], [bob, ada])).toEqual({ joined: [], left: [] })
  })

  // Identity is the person id: a rename mid-meeting must not read as one
  // person leaving and another arriving.
  it('does not treat a relabel as a join and a leave', () => {
    expect(rosterDiff([ada], [{ ...ada, label: 'Ada L.' }])).toEqual({ joined: [], left: [] })
  })
})
