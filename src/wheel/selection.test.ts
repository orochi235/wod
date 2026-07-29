import { describe, expect, it } from 'vitest'
import { forced, weightedRandom } from './selection'
import type { Rng } from './selection'

/** Deterministic generator so weight fidelity is reproducible in tests. */
function lcg(seed: number): Rng {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('weightedRandom', () => {
  it('returns null when there are no candidates', () => {
    expect(weightedRandom([], lcg(1))).toBeNull()
  })

  it('always returns the only weighted candidate', () => {
    const result = weightedRandom(
      [
        { id: 'only', weight: 1 },
        { id: 'ghost', weight: 0 },
      ],
      lcg(7),
    )
    expect(result).toBe('only')
  })

  it('never returns a zero-weight candidate', () => {
    const rng = lcg(42)
    const candidates = [
      { id: 'a', weight: 1 },
      { id: 'ghost', weight: 0 },
      { id: 'b', weight: 1 },
    ]
    for (let i = 0; i < 5000; i++) {
      expect(weightedRandom(candidates, rng)).not.toBe('ghost')
    }
  })

  it('honors weights proportionally', () => {
    const rng = lcg(99)
    const candidates = [
      { id: 'common', weight: 95 },
      { id: 'rare', weight: 5 },
    ]
    const counts: Record<string, number> = { common: 0, rare: 0 }
    const draws = 100_000
    for (let i = 0; i < draws; i++) {
      const winner = weightedRandom(candidates, rng)
      if (winner) counts[winner]++
    }
    expect(counts.rare / draws).toBeGreaterThan(0.04)
    expect(counts.rare / draws).toBeLessThan(0.06)
  })

  it('selects the first candidate at the bottom of the range', () => {
    expect(
      weightedRandom(
        [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 1 },
        ],
        () => 0,
      ),
    ).toBe('a')
  })

  it('selects the last candidate at the top of the range', () => {
    const almostOne = () => 1 - Number.EPSILON
    expect(
      weightedRandom(
        [
          { id: 'a', weight: 1 },
          { id: 'b', weight: 1 },
        ],
        almostOne,
      ),
    ).toBe('b')
  })
})

describe('forced', () => {
  it('returns its target when the target still has weight', () => {
    const result = forced('rigged')(
      [
        { id: 'fair', weight: 10 },
        { id: 'rigged', weight: 1 },
      ],
      lcg(3),
    )
    expect(result).toBe('rigged')
  })

  it('falls back to a fair draw when the target has been zeroed out', () => {
    const result = forced('gone')(
      [
        { id: 'here', weight: 1 },
        { id: 'gone', weight: 0 },
      ],
      lcg(3),
    )
    expect(result).toBe('here')
  })

  it('falls back to a fair draw when the target no longer exists', () => {
    const result = forced('missing')([{ id: 'here', weight: 1 }], lcg(3))
    expect(result).toBe('here')
  })

  it('rigs a visible target on an all-zero-weight wheel', () => {
    const zeros = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
      { id: 'c', weight: 0 },
    ]
    for (let i = 0; i < 50; i++) {
      expect(forced('c')(zeros, lcg(i))).toBe('c')
    }
  })
})
