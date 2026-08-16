import { describe, expect, it } from 'vitest'
import { MAX_DEFLECTION_DEG, deflectionDeg, pegCrossings, settledDeflection } from './flapper'

// Four pegs, at 12, 3, 6 and 9 o'clock in wheel-local turns.
const pegs = [0, 0.25, 0.5, 0.75]

describe('deflectionDeg', () => {
  it('rests at zero with a peg nowhere near the hinge', () => {
    // The wheel has turned 45 degrees, so the nearest peg is half a gap away.
    expect(deflectionDeg(45, pegs, 0.4)).toBeCloseTo(0)
  })

  it('is pushed hardest just as a peg reaches the hinge', () => {
    expect(Math.abs(deflectionDeg(0, pegs, 0.4))).toBeCloseTo(MAX_DEFLECTION_DEG)
  })

  it('falls off as the peg leaves', () => {
    const atPeg = Math.abs(deflectionDeg(0, pegs, 0.4))
    const leaving = Math.abs(deflectionDeg(8, pegs, 0.4))
    expect(leaving).toBeLessThan(atPeg)
    expect(leaving).toBeGreaterThan(0)
  })

  /**
   * The arm hangs below its hinge, so the rotation that carries its tip along
   * with the pegs is the one that reads backwards: a clockwise wheel bends it by
   * a negative angle. Getting this the other way round is not subtle on screen —
   * the arm leans into the peg coming at it.
   */
  it('bends the way the pegs are going', () => {
    expect(deflectionDeg(0, pegs, 0.4)).toBeLessThan(0)
    expect(deflectionDeg(0, pegs, -0.4)).toBeGreaterThan(0)
  })

  it('bends the same amount whichever way the wheel turns', () => {
    expect(deflectionDeg(4, pegs, 0.4)).toBeCloseTo(-deflectionDeg(4, pegs, -0.4))
  })

  it('rests at zero with no pegs at all', () => {
    expect(deflectionDeg(45, [], 0.4)).toBe(0)
  })

  it('treats the wheel as circular', () => {
    expect(deflectionDeg(360, pegs, 0.4)).toBeCloseTo(deflectionDeg(0, pegs, 0.4))
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

  it('falls back to upright from the other side too', () => {
    // An arm bent by a counter-clockwise wheel sits at a negative angle, and a
    // fall that only subtracts would drive it further from upright forever.
    let deflection = -MAX_DEFLECTION_DEG
    for (let frame = 0; frame < 60; frame++) deflection = settledDeflection(deflection, -22, 0)
    expect(deflection).toBe(0)
  })

  it('follows the pegs on a wheel turning the other way', () => {
    expect(settledDeflection(0, -18, -0.4)).toBe(-18)
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

  it('counts backwards for a wheel turning the other way', () => {
    // The same step read forwards is 345 degrees, which would click every peg
    // on the wheel, every frame, for as long as it turned.
    expect(pegCrossings(95, 80, pegs, -1)).toBe(1)
    expect(pegCrossings(10, 350, pegs, -1)).toBe(1)
  })

  it('counts nothing when a wheel going the other way has not moved', () => {
    expect(pegCrossings(10, 10, pegs, -1)).toBe(0)
  })
})
