import { describe, expect, it } from 'vitest'
import { landingSegments } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { takeover, wedgeIdFor } from './takeover'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const newWedgeParams = {
  wedgeMode: 'new',
  wedgeLabel: 'free beer',
  wedgeColor: '#ffd166',
  holdUntil: 0.6,
  endShare: 1,
  endColor: '#ff8811',
  easing: 'easeIn',
}

describe('takeover.provides', () => {
  it('contributes one weight-zero wedge in new mode', () => {
    expect(takeover.provides(newWedgeParams, 't1')).toEqual([
      { id: 't1:wedge', label: 'free beer', weight: 0, color: '#ffd166' },
    ])
  })

  it('contributes nothing in existing mode', () => {
    expect(takeover.provides({ wedgeMode: 'existing', wedgeSegmentId: 'ana' }, 't1')).toEqual([])
  })

  it('derives the wedge id from the trick id', () => {
    expect(wedgeIdFor('t1')).toBe('t1:wedge')
  })
})

describe('takeover.resolve at full share', () => {
  const segments = [...people, ...takeover.provides(newWedgeParams, 't1')]
  const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }
  const morphs = takeover.resolve(newWedgeParams, ctx)

  it('grows the wedge from zero after the hold', () => {
    const wedge = morphs.find((m) => m.segmentId === 't1:wedge')
    expect(wedge?.keyframes).toEqual([
      { at: 0, weight: 0, color: '#ffd166' },
      { at: 0.6, weight: 0, color: '#ffd166' },
      { at: 1, weight: 1, color: '#ff8811' },
    ])
  })

  it('drives every other segment to zero', () => {
    const others = morphs.filter((m) => m.segmentId !== 't1:wedge')
    expect(others.map((m) => m.segmentId).sort()).toEqual(['ana', 'ben'])
    for (const morph of others) {
      expect(morph.keyframes.at(-1)).toEqual({ at: 1, weight: 0 })
    }
  })

  it('leaves the wedge holding the entire circle at landing', () => {
    const landed = landingSegments(segments, morphs, 1000)
    const nonZero = landed.filter((segment) => segment.weight > 0)
    expect(nonZero.map((segment) => segment.id)).toEqual(['t1:wedge'])
  })
})

describe('takeover.resolve at partial share', () => {
  const params = { ...newWedgeParams, endShare: 0.5 }
  const segments = [...people, ...takeover.provides(params, 't1')]
  const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }
  const morphs = takeover.resolve(params, ctx)

  it('leaves the other segments alone', () => {
    expect(morphs.map((m) => m.segmentId)).toEqual(['t1:wedge'])
  })

  it('gives the wedge the weight that yields the requested share', () => {
    // others total 2, share 0.5 -> 0.5 * 2 / 0.5 = 2
    expect(morphs[0].keyframes.at(-1)?.weight).toBe(2)
  })

  it('renders as the requested share of the circle at landing', () => {
    const landed = landingSegments(segments, morphs, 1000)
    const total = landed.reduce((sum, segment) => sum + segment.weight, 0)
    const wedge = landed.find((segment) => segment.id === 't1:wedge')
    expect((wedge?.weight ?? 0) / total).toBeCloseTo(0.5, 10)
  })
})

describe('takeover in existing mode', () => {
  const params = { wedgeMode: 'existing', wedgeSegmentId: 'ana', holdUntil: 0, endShare: 1 }
  const ctx: RecipeContext = { trickId: 't1', segments: people, durationMs: 1000 }

  it('grows the named segment from its own base weight', () => {
    const morphs = takeover.resolve(params, ctx)
    const wedge = morphs.find((m) => m.segmentId === 'ana')
    expect(wedge?.keyframes[0]).toEqual({ at: 0, weight: 1 })
  })
})

describe('takeover.writes', () => {
  const segments = [...people, ...takeover.provides(newWedgeParams, 't1')]
  const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }

  it('matches the segments and properties resolve actually emits', () => {
    const declared = takeover.writes(newWedgeParams, ctx)
    const emitted = takeover
      .resolve(newWedgeParams, ctx)
      .flatMap((morph) =>
        [
          morph.keyframes.some((k) => k.weight !== undefined)
            ? { segmentId: morph.segmentId, property: 'weight' as const }
            : null,
          morph.keyframes.some((k) => k.color !== undefined)
            ? { segmentId: morph.segmentId, property: 'color' as const }
            : null,
        ].filter((write) => write !== null),
      )
    expect([...declared].sort(byWrite)).toEqual([...emitted].sort(byWrite))
  })
})

function byWrite(a: { segmentId: string; property: string }, b: typeof a): number {
  return a.segmentId.localeCompare(b.segmentId) || a.property.localeCompare(b.property)
}

describe('takeover when nobody else has weight', () => {
  // The proportional solve collapses to zero here, which would leave every
  // segment at weight 0 and make normalizeWeights split the circle evenly —
  // the opposite of the requested share.
  const idle: Segment[] = [
    { id: 'ana', label: 'Ana', weight: 0 },
    { id: 'ben', label: 'Ben', weight: 0 },
  ]
  const params = { wedgeMode: 'existing', wedgeSegmentId: 'ana', holdUntil: 0, endShare: 0.5 }
  const ctx: RecipeContext = { trickId: 't1', segments: idle, durationMs: 1000 }

  it('gives the wedge the whole circle rather than an even split', () => {
    const landed = landingSegments(idle, takeover.resolve(params, ctx), 1000)
    const nonZero = landed.filter((segment) => segment.weight > 0)
    expect(nonZero.map((segment) => segment.id)).toEqual(['ana'])
  })

  it('declares the other weights it now writes', () => {
    expect(takeover.writes(params, ctx)).toContainEqual({ segmentId: 'ben', property: 'weight' })
  })
})

describe('takeover color on a wedge left to the palette', () => {
  // `wedge.color` is undefined for a palette-colored segment, so reading it
  // directly would drop the requested end color without any signal.
  const plain: Segment[] = [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
  ]
  const params = {
    wedgeMode: 'existing',
    wedgeSegmentId: 'ana',
    holdUntil: 0,
    endShare: 1,
    endColor: '#ff8811',
  }
  const ctx: RecipeContext = { trickId: 't1', segments: plain, durationMs: 1000 }

  it('animates from the painted palette color', () => {
    const [morph] = takeover.resolve(params, ctx)
    expect(morph.keyframes[0].color).toBe('#f4a261')
    expect(morph.keyframes.at(-1)?.color).toBe('#ff8811')
  })

  it('declares the color it writes', () => {
    expect(takeover.writes(params, ctx)).toContainEqual({ segmentId: 'ana', property: 'color' })
  })
})

describe('takeover.validate', () => {
  it('rejects an existing-mode target that is gone', () => {
    expect(takeover.validate({ wedgeMode: 'existing', wedgeSegmentId: 'ghost' }, people)).toMatch(
      /ghost/,
    )
  })

  it('accepts new mode regardless of the segment list', () => {
    expect(takeover.validate(newWedgeParams, [])).toBeNull()
  })
})
