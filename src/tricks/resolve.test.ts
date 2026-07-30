import { describe, expect, it } from 'vitest'
import { landingSegments } from '../wheel/morph'
import type { Segment } from '../wheel/types'
import { resolveTricks } from './resolve'
import type { Trick } from './types'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const beerTakeover: Trick = {
  id: 'beer',
  name: 'slow burn',
  recipe: 'takeover',
  params: {
    wedgeMode: 'new',
    wedgeLabel: 'free beer',
    wedgeColor: '#ffd166',
    holdUntil: 0.6,
    endShare: 1,
    easing: 'easeIn',
  },
  enabled: true,
}

const grayEveryone: Trick = {
  id: 'gray',
  name: 'everyone goes gray',
  recipe: 'recolor',
  params: { targets: [], toColor: '#888888', startAt: 0 },
  enabled: true,
}

describe('resolveTricks', () => {
  it('returns the original segments when no tricks are enabled', () => {
    const result = resolveTricks(people, [], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('appends a provided wedge at weight zero', () => {
    const result = resolveTricks(people, [beerTakeover], 1000)
    expect(result.segments.map((s) => s.id)).toEqual(['ana', 'ben', 'beer:wedge'])
    expect(result.segments[2].weight).toBe(0)
  })

  it('makes a provided wedge visible to another trick that resolves after it', () => {
    // The two-pass ordering: recolor targets "everything", and everything must
    // include the wedge the takeover contributes, even though recolor is listed first.
    const result = resolveTricks(people, [grayEveryone, beerTakeover], 1000)
    const recolored = result.morphs.filter((morph) =>
      morph.keyframes.some((k) => k.color !== undefined),
    )
    expect(recolored.map((m) => m.segmentId)).toContain('beer:wedge')
  })

  it('contributes nothing for a disabled trick', () => {
    const result = resolveTricks(people, [{ ...beerTakeover, enabled: false }], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('ignores a trick naming an unknown recipe', () => {
    const bogus = { ...beerTakeover, recipe: 'nonsense' } as unknown as Trick
    const result = resolveTricks(people, [bogus], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('orders morphs by trick list order, so the lower trick wins', () => {
    const vanishAna: Trick = {
      id: 'v',
      name: 'ana goes',
      recipe: 'vanish',
      params: { targets: ['ana'], startAt: 0 },
      enabled: true,
    }
    const takeoverFirst = resolveTricks(people, [beerTakeover, vanishAna], 1000)
    const vanishFirst = resolveTricks(people, [vanishAna, beerTakeover], 1000)
    const ids = (result: { morphs: { segmentId: string }[] }) =>
      result.morphs.map((morph) => morph.segmentId)
    expect(ids(takeoverFirst).at(-1)).toBe('ana')
    expect(ids(vanishFirst).at(0)).toBe('ana')
  })

  it('leaves exactly one candidate at landing for a full-share takeover', () => {
    const result = resolveTricks(people, [beerTakeover], 1000)
    const landed = landingSegments(result.segments, result.morphs, 1000)
    expect(landed.filter((segment) => segment.weight > 0).map((s) => s.id)).toEqual(['beer:wedge'])
  })
})
