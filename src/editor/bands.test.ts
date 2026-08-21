import { describe, expect, it } from 'vitest'
import type { Breakpoint } from '../slice/breakpoints'
import { turnFraction } from '../slice/turns'
import {
  AXIS_MAX_DEG,
  AXIS_MIN_DEG,
  STOPS,
  bandsOf,
  fromAxis,
  removeBand,
  snapDegrees,
  splitBand,
  stopAbove,
  stopBelow,
  toAxis,
} from './bands'

const at = (degrees: number, id: string): Breakpoint => ({
  from: degrees / 360,
  slice: { id: id as 'curved', params: {} },
})

/** Widest-first, the order the panel stores. */
const list = [at(30, 'curved'), at(12, 'cash'), at(4, 'radial')]

describe('bandsOf', () => {
  it('spans each floor up to the next one, narrowest first', () => {
    expect(bandsOf(list).map((band) => [band.from, band.to])).toEqual([
      [AXIS_MIN_DEG, 4],
      [4, 12],
      [12, 30],
      [30, AXIS_MAX_DEG],
    ])
  })

  it('names the span below the lowest floor as claimed by nothing', () => {
    const [fallThrough, first] = bandsOf(list)

    expect(fallThrough.source).toBeNull()
    expect(fallThrough.slice).toBeNull()
    expect(first.slice?.id).toBe('radial')
  })

  it('indexes a band back into the widest-first list it came from', () => {
    expect(bandsOf(list).map((band) => band.source)).toEqual([null, 2, 1, 0])
  })

  it('drops the fall-through when a floor sits at the axis minimum', () => {
    expect(bandsOf([at(AXIS_MIN_DEG, 'radial')]).map((band) => band.source)).toEqual([0])
  })

  it('covers the whole axis with the wheel default when there are no breakpoints', () => {
    expect(bandsOf(undefined)).toEqual([
      { source: null, slice: null, from: AXIS_MIN_DEG, to: AXIS_MAX_DEG },
    ])
  })

  // Two equal floors are legal JSON, and a band of no width is not a thing to draw.
  it('drops a band of no width', () => {
    expect(bandsOf([at(12, 'cash'), at(12, 'curved')]).map((band) => [band.from, band.to])).toEqual(
      [
        [AXIS_MIN_DEG, 12],
        [12, AXIS_MAX_DEG],
      ],
    )
  })

  it('reads a hand-edited list that is not sorted', () => {
    expect(bandsOf([at(4, 'radial'), at(30, 'curved')]).map((band) => band.from)).toEqual([
      AXIS_MIN_DEG,
      4,
      30,
    ])
  })
})

describe('splitBand', () => {
  const bands = bandsOf(list)

  it('adds a floor inside the band, inheriting what the band resolved to', () => {
    const split = splitBand(list, bands[2], null)

    expect(split?.from).toBe(18)
    expect(split?.next).toHaveLength(4)
    expect(split?.next.find((point) => point.from === 18 / 360)?.slice.id).toBe('cash')
  })

  it('cuts at the middle of the log axis, not of the degrees', () => {
    expect(splitBand(list, bands[3], null)?.from).toBe(60)
  })

  it('takes the wheel default when the band below no floor is split', () => {
    const wheel = { id: 'auto' as const, params: { ladder: 'plate' } }

    expect(splitBand(list, bands[0], wheel)?.next.find((p) => p.from === 3 / 360)?.slice).toEqual(
      wheel,
    )
  })

  // The split has to resolve every width exactly as it did, so a shared params
  // object would make an edit to one band silently edit the other.
  it('copies the params rather than sharing them', () => {
    const parted = [{ from: 12 / 360, slice: { id: 'composed' as const, params: { parts: [{}] } } }]
    const split = splitBand(parted, bandsOf(parted)[1], null)

    expect(split?.next[1].slice.params.parts).not.toBe(parted[0].slice.params.parts)
  })

  it('refuses a band with no room for a floor of its own', () => {
    expect(splitBand(list, { source: 0, slice: null, from: 12, to: 13 }, null)).toBeNull()
  })

  // 12 and 15 are adjacent stops: the band spans a boundary but contains none.
  it('refuses a band that holds no stop, however wide', () => {
    expect(splitBand(list, { source: 0, slice: null, from: 12, to: 15 }, null)).toBeNull()
  })
})

describe('removeBand', () => {
  it('merges a band down into the one below it', () => {
    expect(removeBand(list, 1).map((point) => point.from * 360)).toEqual([30, 4])
  })

  it('leaves the list alone when the band is claimed by no floor', () => {
    expect(removeBand(list, null)).toBe(list)
  })
})

describe('the axis', () => {
  it('round-trips a width through the log scale', () => {
    expect(fromAxis(toAxis(15))).toBeCloseTo(15)
  })

  it('gives every doubling the same room', () => {
    expect(toAxis(8) - toAxis(4)).toBeCloseTo(toAxis(60) - toAxis(30))
  })
})

describe('the stops', () => {
  // The whole point of the grid: a width the wheel can actually be cut into.
  it('is every width that divides the wheel evenly', () => {
    for (const stop of STOPS) expect(360 % stop).toBe(0)
  })

  it('names every stop as one wedge of an n-wedge wheel', () => {
    for (const stop of STOPS) expect(turnFraction(stop)).toMatch(/^1\/\d+$/)
  })

  it('spans the axis end to end', () => {
    expect(STOPS[0]).toBe(AXIS_MIN_DEG)
    expect(STOPS[STOPS.length - 1]).toBe(AXIS_MAX_DEG)
  })

  it('takes the nearest stop along the log axis, not the nearest degree', () => {
    // 42 is nearer 40 than 45 by degrees and by ratio alike; 44 flips by ratio.
    expect(snapDegrees(toAxis(42))).toBe(40)
    expect(snapDegrees(toAxis(44))).toBe(45)
  })

  it('lands inside the axis however far the drag went', () => {
    expect(snapDegrees(toAxis(1000))).toBe(AXIS_MAX_DEG)
    expect(snapDegrees(toAxis(0.1))).toBe(AXIS_MIN_DEG)
  })

  it('steps to the neighbouring stop, which is not a degree away', () => {
    expect(stopAbove(12)).toBe(15)
    expect(stopBelow(12)).toBe(10)
    expect(stopAbove(90)).toBe(120)
  })

  it('holds at the ends rather than stepping off the axis', () => {
    expect(stopAbove(AXIS_MAX_DEG)).toBe(AXIS_MAX_DEG)
    expect(stopBelow(AXIS_MIN_DEG)).toBe(AXIS_MIN_DEG)
  })
})
