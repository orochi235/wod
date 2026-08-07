import { describe, expect, it } from 'vitest'
import { composeBase } from '../compose/compose'
import { landingSegments } from '../wheel/morph'
import type { Segment } from '../wheel/types'
import { getRecipe } from './registry'
import { resolveTricks, wedgeOwners } from './resolve'
import type { Trick } from './types'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const base = composeBase({ statics: people, feeds: [], items: {}, overrides: {} })

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
    const result = resolveTricks(base, [], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('appends a provided wedge at weight zero', () => {
    const result = resolveTricks(base, [beerTakeover], 1000)
    expect(result.segments.map((s) => s.id)).toEqual(['ana', 'ben', 'beer:wedge'])
    expect(result.segments[2].weight).toBe(0)
  })

  it('makes a provided wedge visible to another trick that resolves after it', () => {
    // The two-pass ordering: recolor targets "everything", and everything must
    // include the wedge the takeover contributes, even though recolor is listed first.
    const result = resolveTricks(base, [grayEveryone, beerTakeover], 1000)
    const recolored = result.morphs.filter((morph) =>
      morph.keyframes.some((k) => k.color !== undefined),
    )
    expect(recolored.map((m) => m.segmentId)).toContain('beer:wedge')
  })

  it('contributes nothing for a disabled trick', () => {
    const result = resolveTricks(base, [{ ...beerTakeover, enabled: false }], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('ignores a trick naming an unknown recipe', () => {
    const bogus = { ...beerTakeover, recipe: 'nonsense' } as unknown as Trick
    const result = resolveTricks(base, [bogus], 1000)
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
    const takeoverFirst = resolveTricks(base, [beerTakeover, vanishAna], 1000)
    const vanishFirst = resolveTricks(base, [vanishAna, beerTakeover], 1000)
    const ids = (result: { morphs: { segmentId: string }[] }) =>
      result.morphs.map((morph) => morph.segmentId)
    expect(ids(takeoverFirst).at(-1)).toBe('ana')
    expect(ids(vanishFirst).at(0)).toBe('ana')
  })

  it('leaves exactly one candidate at landing for a full-share takeover', () => {
    const result = resolveTricks(base, [beerTakeover], 1000)
    const landed = landingSegments(result.segments, result.morphs, 1000)
    expect(landed.filter((segment) => segment.weight > 0).map((s) => s.id)).toEqual(['beer:wedge'])
  })
})

describe('trick data that names something on Object.prototype', () => {
  // Recipe ids come out of localStorage. A bare `RECIPES[id] ?? null` lookup
  // resolves these through the prototype chain to something non-undefined, so
  // the coalesce never fires and the caller treats Object as a recipe.
  const inherited = ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']

  for (const id of inherited) {
    it(`treats '${id}' as an unknown recipe`, () => {
      expect(getRecipe(id)).toBeNull()
    })

    it(`resolves a trick naming '${id}' without throwing`, () => {
      const trick = {
        id: 'x',
        name: 'x',
        recipe: id,
        params: {},
        enabled: true,
      } as unknown as Trick

      expect(() => resolveTricks(base, [trick], 1000)).not.toThrow()
      expect(resolveTricks(base, [trick], 1000).morphs).toEqual([])
    })
  }
})

describe('wedgeOwners', () => {
  it('reports the trick that contributed a wedge', () => {
    expect(wedgeOwners(base, [beerTakeover]).get('beer:wedge')?.id).toBe('beer')
  })

  it('reports nothing for a disabled trick, which contributes no wedge', () => {
    // Must agree with resolveTricks, or the editor labels a segment that is
    // not on the wheel.
    expect(wedgeOwners(base, [{ ...beerTakeover, enabled: false }]).size).toBe(0)
  })

  it('reports nothing for an unknown recipe', () => {
    const bogus = { ...beerTakeover, recipe: 'nonsense' } as unknown as Trick
    expect(wedgeOwners(base, [bogus]).size).toBe(0)
  })

  it('reports nothing when the base already owns the id', () => {
    // resolveTricks drops the computed wedge in favor of the composed one, so
    // claiming ownership here would draw a ghost row for a wedge the wheel
    // does not have.
    const taken = composeBase({
      statics: [...people, { id: 'beer:wedge', label: 'free beer', weight: 1 }],
      feeds: [],
      items: {},
      overrides: {},
    })
    expect(wedgeOwners(taken, [beerTakeover]).size).toBe(0)
  })

  it('gives a contested id to the first trick, as resolveTricks does', () => {
    const second: Trick = { ...beerTakeover, name: 'second claim' }
    const owners = wedgeOwners(base, [beerTakeover, second])
    expect(owners.get('beer:wedge')?.name).toBe('slow burn')
  })
})

describe('resolveTricks origins', () => {
  it('marks a trick-provided wedge as computed', () => {
    const result = resolveTricks(base, [beerTakeover], 1000)
    expect(result.origins.get('beer:wedge')).toEqual({ kind: 'computed', trickId: 'beer' })
  })

  it('carries the base origins through untouched', () => {
    const result = resolveTricks(base, [beerTakeover], 1000)
    expect(result.origins.get('ana')).toEqual({ kind: 'static' })
  })

  it('reports no computed origin for a disabled trick', () => {
    const result = resolveTricks(base, [{ ...beerTakeover, enabled: false }], 1000)
    expect(result.origins.has('beer:wedge')).toBe(false)
  })
})
