import { describe, expect, it } from 'vitest'
import type { FeedConfig, FeedItem, ItemOverride } from '../feed/types'
import type { Segment } from '../wheel/types'
import { composeBase, wedgeId } from './compose'

const statics: Segment[] = [
  { id: 'seg1', label: 'Spin again', weight: 1 },
  { id: 'seg2', label: 'Free beer', weight: 0.5 },
]

const roster: FeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: [],
  autochurn: { intervalMs: 2000, targetSize: 4, volatility: 0.3 },
}

const items: FeedItem[] = [
  { id: 'ana', label: 'Ana' },
  { id: 'ben', label: 'Ben' },
]

function compose(overrides: Record<string, ItemOverride> = {}, feed: FeedConfig = roster) {
  return composeBase({ statics, feeds: [feed], items: { sim: items }, overrides })
}

describe('composeBase', () => {
  it('namespaces external ids by feed', () => {
    expect(wedgeId('sim', 'ana')).toBe('sim:ana')
    expect(compose().segments.map((s) => s.id)).toEqual(['seg1', 'seg2', 'sim:ana', 'sim:ben'])
  })

  it('gives external wedges the feed defaults', () => {
    const feed: FeedConfig = { ...roster, defaults: { weight: 3, color: '#abcdef' } }
    const ana = compose({}, feed).segments.find((s) => s.id === 'sim:ana')
    expect(ana).toEqual({ id: 'sim:ana', label: 'Ana', weight: 3, color: '#abcdef' })
  })

  it('leaves color absent when the feed sets none, so the palette assigns it', () => {
    const ana = compose().segments.find((s) => s.id === 'sim:ana')
    expect(ana).not.toHaveProperty('color')
  })

  it('applies an override field by field', () => {
    const composed = compose({ ana: { label: 'ANA!', weight: 9, color: '#ff0000' } })
    expect(composed.segments.find((s) => s.id === 'sim:ana')).toEqual({
      id: 'sim:ana',
      label: 'ANA!',
      weight: 9,
      color: '#ff0000',
    })
  })

  it('drops an excluded item entirely', () => {
    const composed = compose({ ana: { excluded: true } })
    expect(composed.segments.map((s) => s.id)).toEqual(['seg1', 'seg2', 'sim:ben'])
    expect(composed.origins.has('sim:ana')).toBe(false)
  })

  it('collapses a negative or non-finite override weight to zero', () => {
    const composed = compose({ ana: { weight: -5 }, ben: { weight: Number.NaN } })
    expect(composed.segments.find((s) => s.id === 'sim:ana')?.weight).toBe(0)
    expect(composed.segments.find((s) => s.id === 'sim:ben')?.weight).toBe(0)
  })

  it('lets a static wedge win an id collision', () => {
    const composed = composeBase({
      statics: [{ id: 'sim:ana', label: 'Authored', weight: 7 }],
      feeds: [roster],
      items: { sim: items },
      overrides: {},
    })
    expect(composed.segments.filter((s) => s.id === 'sim:ana')).toHaveLength(1)
    expect(composed.segments[0].label).toBe('Authored')
    expect(composed.origins.get('sim:ana')).toEqual({ kind: 'static' })
  })

  it('places a feed block after its insertAfter anchor', () => {
    const composed = compose({}, { ...roster, insertAfter: 'seg1' })
    expect(composed.segments.map((s) => s.id)).toEqual(['seg1', 'sim:ana', 'sim:ben', 'seg2'])
  })

  it('appends when insertAfter names a segment that is not there', () => {
    const composed = compose({}, { ...roster, insertAfter: 'nope' })
    expect(composed.segments.map((s) => s.id)).toEqual(['seg1', 'seg2', 'sim:ana', 'sim:ben'])
  })

  it('reports an origin for every wedge', () => {
    const composed = compose()
    expect(composed.origins.get('seg1')).toEqual({ kind: 'static' })
    expect(composed.origins.get('sim:ben')).toEqual({
      kind: 'external',
      feedId: 'sim',
      itemId: 'ben',
    })
  })
})
