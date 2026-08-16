import { describe, expect, it } from 'vitest'
import { ARC_STEPS, turnFraction } from './wedge'

describe('turnFraction', () => {
  it('names each step the share of the wheel it is', () => {
    expect(ARC_STEPS.map(turnFraction)).toEqual(['1/45', '1/30', '1/24', '1/18', '1/12'])
  })

  it('reduces to lowest terms rather than leaving 4/360', () => {
    expect(turnFraction(90)).toBe('1/4')
    expect(turnFraction(180)).toBe('1/2')
    expect(turnFraction(360)).toBe('1/1')
  })

  // A width the steps do not cover still has to read as a fraction, and most
  // of them do not land on a unit numerator.
  it('keeps a numerator when the width divides no better', () => {
    expect(turnFraction(7)).toBe('7/360')
    expect(turnFraction(27)).toBe('3/40')
  })

  it('carries a fractional degree rather than rounding it away', () => {
    expect(turnFraction(4.5)).toBe('1/80')
    expect(turnFraction(0.5)).toBe('1/720')
  })
})
