import { describe, expect, it } from 'vitest'
import { createConductor, unitsOf } from './conductor'

const pegs = (conductor: ReturnType<typeof createConductor>, n: number, intervalS: number) =>
  Array.from({ length: n }, () => conductor.peg(intervalS))

describe('unitsOf', () => {
  it('measures each slice in the shortest one', () => {
    expect(
      unitsOf([
        { offset: 0, duration: 0.25 },
        { offset: 0.25, duration: 0.5 },
        { offset: 0.75, duration: 0.75 },
      ]),
    ).toEqual([1, 2, 3])
  })
})

describe('createConductor', () => {
  it('plays one unit per peg on a slow wheel, holding long notes across pegs', () => {
    const conductor = createConductor([1, 2, 1])
    expect(pegs(conductor, 5, 0.5)).toEqual([0, 1, null, 2, 0])
    expect(conductor.pegsPerUnit).toBe(1)
  })

  it('spreads a unit over enough pegs to keep a fast wheel melodic', () => {
    const conductor = createConductor([1, 1])
    const played = pegs(conductor, 17, 0.01)
    expect(conductor.pegsPerUnit).toBe(16)
    expect(played[0]).toBe(0)
    expect(played.slice(1, 16).every((note) => note === null)).toBe(true)
    expect(played[16]).toBe(1)
  })

  it('halves the grid only once the wheel is clearly slower, not at the boundary', () => {
    const conductor = createConductor([1])
    conductor.peg(0.01)
    expect(conductor.pegsPerUnit).toBe(16)
    conductor.peg(0.0155)
    expect(conductor.pegsPerUnit).toBe(16)
    conductor.peg(0.019)
    expect(conductor.pegsPerUnit).toBe(8)
  })

  it('starts the tune over on restart', () => {
    const conductor = createConductor([1, 1, 1])
    pegs(conductor, 2, 0.5)
    conductor.restart()
    expect(conductor.peg(0.5)).toBe(0)
  })
})
