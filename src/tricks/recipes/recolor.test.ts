import { describe, expect, it } from 'vitest'
import { wedgeIndexOf } from '../../compose/compose'
import type { Origin } from '../../compose/types'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import { resolveTricks } from '../resolve'
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
  winnerId: null,
}

describe('recolor', () => {
  it('provides no segments', () => {
    expect(recolor.provides({}, 't1')).toEqual([])
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
    // Empty targets means every wedge. Pinned so the loop below cannot pass
    // vacuously on a resolver that returned nothing at all.
    expect(morphs.map((morph) => morph.segmentId)).toEqual(['ana', 'beer'])
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
    expect(recolor.validate({ targets: ['ghost'] }, wedgeIndexOf(segments))).toMatch(/ghost/)
  })

  it('accepts a selector token that matches nothing yet', () => {
    expect(
      recolor.validate({ targets: ['@external'], toColor: '#000000' }, wedgeIndexOf(segments)),
    ).toBeNull()
  })

  it('reports a misspelled token as an unknown wedge', () => {
    expect(
      recolor.validate({ targets: ['@extrenal'], toColor: '#000000' }, wedgeIndexOf(segments)),
    ).toMatch(/@extrenal/)
  })

  it('starts from the color the wheel is painting after churn', () => {
    const base = {
      segments: [
        { id: 'ana', label: 'Ana', weight: 1 },
        { id: 'ben', label: 'Ben', weight: 1 },
        { id: 'cy', label: 'Cy', weight: 1 },
      ],
      origins: new Map<string, Origin>([
        ['ana', { kind: 'static' }],
        ['ben', { kind: 'static' }],
        ['cy', { kind: 'static' }],
      ]),
    }
    const first = resolveTricks(base, [], 1000)
    const painted = first.segments.find((s) => s.id === 'cy')?.color

    // 'ben' leaves. 'cy' moves down a position but keeps its swatch.
    const churned = {
      segments: [base.segments[0], base.segments[2]],
      origins: new Map<string, Origin>([
        ['ana', { kind: 'static' }],
        ['cy', { kind: 'static' }],
      ]),
    }
    const trick = {
      id: 't1',
      name: 'recolor cy',
      recipe: 'recolor' as const,
      enabled: true,
      params: { targets: ['cy'], toColor: '#000000', startAt: 0.5 },
    }
    const resolved = resolveTricks(churned, [trick], 1000, 0, null, {
      previous: first.colors,
      retained: new Set<string>(),
    })

    const morph = resolved.morphs.find((m) => m.segmentId === 'cy')
    expect(morph?.keyframes[0]).toEqual({ at: 0, color: painted })
  })
})
