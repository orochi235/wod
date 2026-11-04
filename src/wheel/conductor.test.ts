import { describe, expect, it } from 'vitest'
import { createConductor, createScheduledConductor, onsetsOf } from './conductor'

const pegs = (conductor: ReturnType<typeof createConductor>, n: number, intervalS: number) =>
  Array.from({ length: n }, () => conductor.peg(intervalS))

describe('onsetsOf', () => {
  it('starts each note where the ones before it end', () => {
    expect(onsetsOf([1, 2, 3])).toEqual([0, 1, 3])
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

describe('createScheduledConductor', () => {
  const play = (units: number[], advance: number[], startUnits: number) => {
    const conductor = createScheduledConductor(units, { advance, startUnits })
    return advance.map(() => conductor.peg())
  }

  it('starts each note on the peg its onset is reached', () => {
    expect(play([1, 2, 1], [1, 1, 1, 1], 0)).toEqual([0, 1, null, 2])
  })

  it('stays silent through a lead-in', () => {
    expect(play([1, 1], [0.5, 0.5, 1, 1], -1)).toEqual([null, null, 0, 1])
  })

  it('skips the opening when the tune is longer than the spin', () => {
    expect(play([1, 1, 1], [1, 1], 1)).toEqual([1, 2])
  })

  it('plays nothing past its last peg', () => {
    const conductor = createScheduledConductor([1, 1, 1], { advance: [1], startUnits: 0 })
    expect([conductor.peg(), conductor.peg()]).toEqual([0, null])
  })
})
