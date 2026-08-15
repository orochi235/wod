import { describe, expect, it } from 'vitest'
import { bracket } from './bracket'

const p = (at: number, value: number) => ({ at, value })

describe('bracket', () => {
  it('returns null for no points', () => {
    expect(bracket([], 0.5)).toBeNull()
  })

  it('finds the surrounding pair and the fraction between them', () => {
    const found = bracket([p(0, 10), p(1, 20)], 0.25)
    expect(found?.from.value).toBe(10)
    expect(found?.to.value).toBe(20)
    expect(found?.t).toBeCloseTo(0.25)
  })

  it('clamps below the first point', () => {
    const found = bracket([p(0.4, 10), p(1, 20)], 0)
    expect(found).toEqual({ from: p(0.4, 10), to: p(0.4, 10), t: 0 })
  })

  it('clamps past the last point', () => {
    const found = bracket([p(0, 10), p(0.6, 20)], 1)
    expect(found).toEqual({ from: p(0.6, 20), to: p(0.6, 20), t: 1 })
  })

  it('gives a tie to the later point when two share an offset', () => {
    const found = bracket([p(0.5, 10), p(0.5, 20)], 0.5)
    expect(found?.to.value).toBe(20)
    expect(found?.t).toBe(1)
  })
})
