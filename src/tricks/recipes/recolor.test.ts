import { describe, expect, it } from 'vitest'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { recolor } from './recolor'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 1, color: '#ffd166' },
]

const ctx: RecipeContext = {
  trickId: 't1',
  segments,
  origins: new Map(),
  durationMs: 1000,
  roll: 0,
}

describe('recolor', () => {
  it('provides no segments', () => {
    expect(recolor.provides({}, 't1')).toEqual([])
  })

  it('starts from the palette fallback when a segment has no color', () => {
    const [morph] = recolor.resolve({ targets: ['ana'], toColor: '#888888' }, ctx)
    expect(morph.keyframes[0]).toEqual({ at: 0, color: '#f4a261' })
  })

  it('starts from an explicit color when the segment has one', () => {
    const [morph] = recolor.resolve({ targets: ['beer'], toColor: '#888888' }, ctx)
    expect(morph.keyframes[0]).toEqual({ at: 0, color: '#ffd166' })
  })

  it('holds the base color until startAt, then shifts', () => {
    const [morph] = recolor.resolve({ targets: ['beer'], toColor: '#000000', startAt: 0.4 }, ctx)
    expect(morph.keyframes).toEqual([
      { at: 0, color: '#ffd166' },
      { at: 0.4, color: '#ffd166' },
      { at: 1, color: '#000000' },
    ])
  })

  it('interpolates rather than stepping', () => {
    const morphs = recolor.resolve(
      { targets: ['beer'], toColor: '#000000', startAt: 0, easing: 'linear' },
      ctx,
    )
    const midway = applyMorphs(segments, morphs, 500)
    const beer = midway.find((segment) => segment.id === 'beer')
    expect(beer?.color).not.toBe('#ffd166')
    expect(beer?.color).not.toBe('#000000')
  })

  it('never touches weight', () => {
    const morphs = recolor.resolve({ targets: [], toColor: '#000000' }, ctx)
    for (const morph of morphs) {
      expect(morph.keyframes.every((k) => k.weight === undefined)).toBe(true)
    }
  })

  it('declares exactly the colors it writes', () => {
    expect(recolor.writes({ targets: ['ana'], toColor: '#000000' }, ctx)).toEqual([
      { segmentId: 'ana', property: 'color' },
    ])
  })

  it('rejects a missing target', () => {
    expect(recolor.validate({ targets: ['ghost'] }, segments)).toMatch(/ghost/)
  })
})
