import { describe, expect, it } from 'vitest'
import type { Arc } from './geometry'
import { pegAngles } from './pegs'

const arcs: Arc[] = [
  { id: 'ana', start: 0, end: 0.5 },
  { id: 'ben', start: 0.5, end: 0.75 },
  { id: 'cy', start: 0.75, end: 1 },
]

describe('pegAngles', () => {
  it('puts one peg on each wedge boundary', () => {
    expect(pegAngles({ kind: 'bounds' }, arcs)).toEqual([0, 0.5, 0.75])
  })

  it('spaces a fixed count evenly, whatever the roster is', () => {
    expect(pegAngles({ kind: 'fixed', count: 4 }, arcs)).toEqual([0, 0.25, 0.5, 0.75])
    expect(pegAngles({ kind: 'fixed', count: 4 }, [])).toEqual([0, 0.25, 0.5, 0.75])
  })

  it('has no pegs at a count of zero', () => {
    expect(pegAngles({ kind: 'fixed', count: 0 }, arcs)).toEqual([])
  })

  it('refuses a count that is not a whole positive number', () => {
    expect(pegAngles({ kind: 'fixed', count: -3 }, arcs)).toEqual([])
    expect(pegAngles({ kind: 'fixed', count: 2.5 }, arcs)).toEqual([0, 0.5])
    expect(pegAngles({ kind: 'fixed', count: Number.NaN }, arcs)).toEqual([])
  })

  it('drops a zero-width wedge rather than stacking two pegs on one angle', () => {
    const withEmpty: Arc[] = [
      { id: 'ana', start: 0, end: 0.5 },
      { id: 'gone', start: 0.5, end: 0.5 },
      { id: 'ben', start: 0.5, end: 1 },
    ]
    expect(pegAngles({ kind: 'bounds' }, withEmpty)).toEqual([0, 0.5])
  })

  it('has no pegs with no wedges', () => {
    expect(pegAngles({ kind: 'bounds' }, [])).toEqual([])
  })
})
