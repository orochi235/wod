import { describe, expect, it } from 'vitest'
import { MAX_DEFLECTION_DEG, deflectionDeg, pegCrossings, settledDeflection } from './flapper'

// Four pegs, at 12, 3, 6 and 9 o'clock in wheel-local turns.
const pegs = [0, 0.25, 0.5, 0.75]

describe('deflectionDeg', () => {
  it('rests at zero with a peg nowhere near the hinge', () => {
    // The wheel has turned 45 degrees, so the nearest peg is half a gap away.
    expect(deflectionDeg(45, pegs)).toBeCloseTo(0)
  })

  it('is pushed hardest just as a peg reaches the hinge', () => {
    expect(deflectionDeg(0, pegs)).toBeCloseTo(MAX_DEFLECTION_DEG)
  })

  it('falls off as the peg leaves', () => {
    const atPeg = deflectionDeg(0, pegs)
    const leaving = deflectionDeg(8, pegs)
    expect(leaving).toBeLessThan(atPeg)
    expect(leaving).toBeGreaterThan(0)
  })

  it('rests at zero with no pegs at all', () => {
    expect(deflectionDeg(45, [])).toBe(0)
  })

  it('treats the wheel as circular', () => {
    expect(deflectionDeg(360, pegs)).toBeCloseTo(deflectionDeg(0, pegs))
  })
})

describe('settledDeflection', () => {
  it('follows the pegs while the wheel is turning', () => {
    expect(settledDeflection(0, 18, 0.4)).toBe(18)
  })

  it('falls back toward upright once the wheel is still', () => {
    const stopped = settledDeflection(18, 18, 0)
    expect(stopped).toBeLessThan(18)
    expect(stopped).toBeGreaterThan(0)
  })

  it('reaches upright rather than creeping toward it', () => {
    let deflection = MAX_DEFLECTION_DEG
    // A second of frames: an arm still propped after that reads as stuck, which
    // is the whole thing this exists to stop.
    for (let frame = 0; frame < 60; frame++) deflection = settledDeflection(deflection, 22, 0)
    expect(deflection).toBe(0)
  })

  it('stays upright once it gets there', () => {
    expect(settledDeflection(0, 22, 0)).toBe(0)
  })
})

describe('pegCrossings', () => {
  it('counts nothing when the wheel has not moved', () => {
    expect(pegCrossings(10, 10, pegs)).toBe(0)
  })

  it('counts one peg passing the hinge', () => {
    // 80 to 95 degrees crosses the peg at 90.
    expect(pegCrossings(80, 95, pegs)).toBe(1)
  })

  it('counts every peg a long step passed', () => {
    expect(pegCrossings(0, 200, pegs)).toBe(2)
  })

  it('counts across the top of the wheel', () => {
    expect(pegCrossings(350, 10, pegs)).toBe(1)
  })

  it('counts nothing with no pegs', () => {
    expect(pegCrossings(0, 200, [])).toBe(0)
  })
})
