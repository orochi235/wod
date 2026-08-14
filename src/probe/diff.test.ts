import { describe, expect, it } from 'vitest'
import type { Participant } from '../meet/api'
import { personOf, rosterDiff } from './diff'

const participant = (name: string, patch: Partial<Participant> = {}): Participant => ({
  name,
  ...patch,
})

describe('personOf', () => {
  it('names a signed-in user', () => {
    expect(
      personOf(participant('p1', { signedinUser: { user: 'users/1', displayName: 'Ada' } })),
    ).toEqual({ id: 'p1', label: 'Ada', kind: 'signedin' })
  })

  it('keeps the kind when a display name is missing, rather than dropping the person', () => {
    expect(personOf(participant('p2', { phoneUser: {} }))).toEqual({
      id: 'p2',
      label: '(no display name)',
      kind: 'phone',
    })
  })

  it('falls back to unknown for a shape the API adds later', () => {
    expect(personOf(participant('p3')).kind).toBe('unknown')
  })
})

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

  // Identity is the participant resource name: a rename mid-meeting must not
  // read as one person leaving and another arriving.
  it('does not treat a relabel as a join and a leave', () => {
    expect(rosterDiff([ada], [{ ...ada, label: 'Ada L.' }])).toEqual({ joined: [], left: [] })
  })
})
