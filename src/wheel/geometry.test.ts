import { describe, expect, it } from 'vitest'
import type { Weighted } from './geometry'
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

  it('never emits an arc that is backwards or runs past one', () => {
    const distributions = [
      Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, weight: 1 })).concat([
        { id: 'tail', weight: 1e-16 },
      ]),
      Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, weight: 1 / 3 })),
      [
        { id: 'a', weight: 1e300 },
        { id: 'b', weight: 1e-300 },
        { id: 'c', weight: 0 },
      ],
    ]
    for (const items of distributions) {
      for (const arc of arcs(items)) {
        expect(arc.end).toBeGreaterThanOrEqual(arc.start)
        expect(arc.end).toBeLessThanOrEqual(1)
        expect(arc.start).toBeGreaterThanOrEqual(0)
      }
    }
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

import { angleToSegment, pointerTurn, targetRotationDeg } from './geometry'

describe('angleToSegment', () => {
  const list = arcs([
    { id: 'a', weight: 1 },
    { id: 'b', weight: 1 },
    { id: 'c', weight: 2 },
  ])

  it('finds the segment containing a turn', () => {
    expect(angleToSegment(list, 0.1)).toBe('a')
    expect(angleToSegment(list, 0.3)).toBe('b')
    expect(angleToSegment(list, 0.7)).toBe('c')
  })

  it('treats arc start as inside and arc end as outside', () => {
    expect(angleToSegment(list, 0.25)).toBe('b')
  })

  it('wraps turns outside the unit range', () => {
    expect(angleToSegment(list, 1.1)).toBe('a')
    expect(angleToSegment(list, -0.9)).toBe('a')
  })

  it('never returns a zero-width segment', () => {
    const withGhost = arcs([
      { id: 'real', weight: 1 },
      { id: 'ghost', weight: 0 },
    ])
    for (let t = 0; t < 1; t += 0.01) {
      expect(angleToSegment(withGhost, t)).toBe('real')
    }
  })

  it('returns null when there is nothing to land on', () => {
    expect(angleToSegment([], 0.5)).toBeNull()
  })

  it('returns the correct slice at non-binary-exact arc boundaries', () => {
    const five = arcs(['s0', 's1', 's2', 's3', 's4'].map((id) => ({ id, weight: 1 })))
    expect(angleToSegment(five, 0.2)).toBe('s1')
    expect(angleToSegment(five, 0.4)).toBe('s2')
    expect(angleToSegment(five, 0.6)).toBe('s3')
    expect(angleToSegment(five, 0.8)).toBe('s4')
  })

  it('does not wrap the largest turn below one back to the first segment', () => {
    const four = arcs(['a', 'b', 'c', 'd'].map((id) => ({ id, weight: 1 })))
    expect(angleToSegment(four, 1 - 2 ** -53)).toBe('d')
  })
})

describe('rotation mapping', () => {
  it('is the exact inverse of the pointer mapping', () => {
    for (const turn of [0, 0.001, 0.25, 0.5, 0.75, 0.999]) {
      for (const spins of [0, 1, 5]) {
        expect(pointerTurn(targetRotationDeg(turn, spins))).toBeCloseTo(turn, 9)
      }
    }
  })

  it('adds a full revolution per requested spin', () => {
    expect(targetRotationDeg(0, 5)).toBe(1800)
  })

  it('rotates counter to the turn so the pointer meets it', () => {
    expect(targetRotationDeg(0.25, 0)).toBe(270)
  })
})

describe('pointer round trip', () => {
  const distributions: Weighted[][] = [
    [1, 1, 1, 1, 1],
    [1, 1, 1],
    [9, 1],
    [1, 3, 7, 11],
    [95, 5],
    [1, 0, 1, 0, 1],
    [0.02, 1, 1, 1, 1, 1],
    [1],
    [0, 0, 1],
    Array.from({ length: 40 }, () => 1),
  ].map((weights) => weights.map((weight, i) => ({ id: `s${i}`, weight })))

  it('reports the owning segment at every arc start', () => {
    for (const items of distributions) {
      const list = arcs(items)
      for (const arc of list) {
        if (!(arc.end > arc.start)) continue
        expect(angleToSegment(list, arc.start)).toBe(arc.id)
      }
    }
  })

  // Converting a turn to degrees and back is not exactly invertible in IEEE-754,
  // so a probe sitting exactly ON a boundary can come back one ulp low and read
  // as the previous segment. The guarantee this round trip actually offers is
  // for points strictly inside an arc, which is why planSpin insets its landing
  // point away from the edges. Probes below use a 2% margin — six orders of
  // magnitude larger than the observed drift.
  it('survives the full arc to rotation to pointer to segment round trip', () => {
    for (const items of distributions) {
      const list = arcs(items)
      for (const arc of list) {
        const width = arc.end - arc.start
        if (!(width > 0)) continue
        const probes = [arc.start + width * 0.02, arc.start + width * 0.5, arc.end - width * 0.02]
        for (const probe of probes) {
          for (const spins of [0, 1, 7]) {
            const recovered = pointerTurn(targetRotationDeg(probe, spins))
            expect(angleToSegment(list, recovered)).toBe(arc.id)
          }
        }
      }
    }
  })
})
