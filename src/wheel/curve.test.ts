import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTLE_CURVE, cssCurve, initialSlope, isSettleCurve, parseCurve } from './curve'
import type { Curve } from './types'

describe('parseCurve', () => {
  it('reads every CSS keyword an older preset could be carrying', () => {
    expect(parseCurve('linear')).toEqual([0, 0, 1, 1])
    expect(parseCurve('ease')).toEqual([0.25, 0.1, 0.25, 1])
    expect(parseCurve('ease-in')).toEqual([0.42, 0, 1, 1])
    expect(parseCurve('ease-out')).toEqual([0, 0, 0.58, 1])
    expect(parseCurve('ease-in-out')).toEqual([0.42, 0, 0.58, 1])
  })

  it('trims whitespace around a keyword', () => {
    expect(parseCurve('  linear  ')).toEqual([0, 0, 1, 1])
  })

  it('reads a cubic-bezier string', () => {
    expect(parseCurve('cubic-bezier(0.1, 0.8, 0.2, 1)')).toEqual([0.1, 0.8, 0.2, 1])
  })

  it('reads the array form, which is what an exported preset now carries', () => {
    expect(parseCurve([0.33, 1, 0.68, 1])).toEqual([0.33, 1, 0.68, 1])
  })

  it('clamps x into the unit interval and leaves y alone', () => {
    // Overshoot is a feature: a y past 1 carries the wheel beyond the winner
    // and drifts back. CSS only constrains x, and so does this.
    expect(parseCurve([-1, -0.5, 2, 1.4])).toEqual([0, -0.5, 1, 1.4])
  })

  it('hands back a fresh tuple, so a caller cannot poison the keyword table', () => {
    const parsed = parseCurve('linear') as Curve
    parsed[0] = 0.5
    expect(parseCurve('linear')).toEqual([0, 0, 1, 1])
  })

  it('rejects anything it cannot read', () => {
    expect(parseCurve('steps(4)')).toBeNull()
    expect(parseCurve('cubic-bezier(0.1, 0.8)')).toBeNull()
    expect(parseCurve('cubic-bezier(a, b, c, d)')).toBeNull()
    expect(parseCurve([0.1, 0.8, 0.2])).toBeNull()
    expect(parseCurve([0.1, 0.8, 0.2, Number.NaN])).toBeNull()
    expect(parseCurve([0.1, 0.8, 0.2, '1'])).toBeNull()
    expect(parseCurve(undefined)).toBeNull()
    expect(parseCurve(42)).toBeNull()
  })

  it('does not resolve a stored name up the prototype chain', () => {
    expect(parseCurve('constructor')).toBeNull()
    expect(parseCurve('toString')).toBeNull()
  })
})

describe('initialSlope', () => {
  it('is y1 over x1 in the ordinary case', () => {
    expect(initialSlope([0.33, 1, 0.68, 1])).toBeCloseTo(1 / 0.33, 9)
  })

  it('falls through to the second control point when the first sits on the origin', () => {
    // ease-out is exactly this case, and y1/x1 would be 0/0.
    expect(initialSlope([0, 0, 0.58, 1])).toBeCloseTo(1 / 0.58, 9)
  })

  it('is 1 when both control points sit on the origin', () => {
    expect(initialSlope([0, 0, 0, 0])).toBe(1)
  })
})

describe('isSettleCurve', () => {
  it('accepts a curve with a positive finite handover speed', () => {
    expect(isSettleCurve(DEFAULT_SETTLE_CURVE)).toBe(true)
    expect(isSettleCurve([0, 0, 0.58, 1])).toBe(true)
  })

  it('rejects the slopes that would make the solve divide by zero or run backwards', () => {
    // Flat start: the settle would have to cover infinite ground.
    expect(isSettleCurve([0.5, 0, 0.68, 1])).toBe(false)
    // Backwards.
    expect(isSettleCurve([0.5, -0.2, 0.68, 1])).toBe(false)
    // Vertical start: an instant stop, which is the stutter this design exists
    // to avoid rather than an aggressive settle.
    expect(isSettleCurve([0, 1, 0.68, 1])).toBe(false)
  })
})

describe('cssCurve', () => {
  it('serializes to the string the Web Animations API takes', () => {
    expect(cssCurve([0.33, 1, 0.68, 1])).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('round-trips through the parser', () => {
    const curve: Curve = [0.1, 0.8, 0.2, 1]
    expect(parseCurve(cssCurve(curve))).toEqual(curve)
  })
})
