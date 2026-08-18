import { describe, expect, it } from 'vitest'
import type { Breakpoint } from '../slice/breakpoints'
import {
  AXIS_MAX_DEG,
  AXIS_MIN_DEG,
  bandsOf,
  fromAxis,
  removeBand,
  splitBand,
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

    expect(split?.from).toBe(19)
    expect(split?.next).toHaveLength(4)
    expect(split?.next.find((point) => point.from === 19 / 360)?.slice.id).toBe('cash')
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
