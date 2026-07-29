import { describe, expect, it } from 'vitest'
import { arcs, normalizeWeights } from './geometry'

describe('normalizeWeights', () => {
  it('returns fractions summing to one', () => {
    const result = normalizeWeights([
      { id: 'a', weight: 1 },
      { id: 'b', weight: 3 },
    ])
    expect(result).toEqual([0.25, 0.75])
  })

  it('falls back to equal weights when the total is zero', () => {
    const result = normalizeWeights([
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
    ])
    expect(result).toEqual([0.5, 0.5])
  })

  it('treats negative and non-finite weights as zero', () => {
    const result = normalizeWeights([
      { id: 'a', weight: -5 },
      { id: 'b', weight: Number.NaN },
      { id: 'c', weight: 2 },
    ])
    expect(result).toEqual([0, 0, 1])
  })

  it('returns an empty array for no segments', () => {
    expect(normalizeWeights([])).toEqual([])
  })
})

describe('arcs', () => {
  it('lays segments out consecutively from zero to one', () => {
    const result = arcs([
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
    ])
    expect(result).toEqual([
      { id: 'a', start: 0, end: 0.5 },
      { id: 'b', start: 0.5, end: 1 },
    ])
  })

  it('gives a zero-weight segment zero width', () => {
    const result = arcs([
      { id: 'a', weight: 1 },
      { id: 'ghost', weight: 0 },
    ])
    const ghost = result.find((a) => a.id === 'ghost')
    expect(ghost?.end).toBe(ghost?.start)
  })

  it('gives a single full-weight segment the entire circle', () => {
    const result = arcs([
      { id: 'beer', weight: 1 },
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
    ])
    expect(result[0]).toEqual({ id: 'beer', start: 0, end: 1 })
  })
})
