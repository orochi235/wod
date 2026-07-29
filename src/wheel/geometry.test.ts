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

import { arcPath } from './geometry'

describe('arcPath', () => {
  it('renders nothing for a zero-width arc', () => {
    expect(arcPath(0.5, 0.5, 100)).toBe('')
  })

  it('renders nothing for a negative-width arc', () => {
    expect(arcPath(0.7, 0.3, 100)).toBe('')
  })

  it('renders a full ring using two arc commands when one segment holds everything', () => {
    const d = arcPath(0, 1, 100)
    expect(d).not.toBe('')
    const arcCommands = d.match(/A/g) ?? []
    expect(arcCommands).toHaveLength(2)
  })

  it('sets the large-arc flag for arcs wider than half the circle', () => {
    expect(arcPath(0, 0.75, 100)).toMatch(/A 100 100 0 1 1/)
    expect(arcPath(0, 0.25, 100)).toMatch(/A 100 100 0 0 1/)
  })

  it('starts a quarter arc at twelve o clock and ends at three o clock', () => {
    const d = arcPath(0, 0.25, 100)
    expect(d).toContain('L 0 -100')
    expect(d).toContain('100 0')
  })

  it('never emits NaN for any weight distribution', () => {
    for (const [start, end] of [
      [0, 0],
      [0, 1],
      [0, 0.0001],
      [0.9999, 1],
      [0.5, 0.5],
    ]) {
      expect(arcPath(start, end, 100)).not.toContain('NaN')
    }
  })
})
