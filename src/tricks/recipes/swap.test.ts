import { describe, expect, it } from 'vitest'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { swap } from './swap'

const DURATION_MS = 4000

const SEGMENTS: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1, color: '#ff0000' },
  { id: 'ben', label: 'Ben', weight: 1, color: '#00ff00' },
  { id: 'cal', label: 'Cal', weight: 1, color: '#0000ff' },
]

const ctx = (winnerId: string | null): RecipeContext => ({
  trickId: 'swap1',
  segments: SEGMENTS,
  origins: new Map(),
  durationMs: DURATION_MS,
  roll: 0,
  winnerId,
})

const params = { otherWedgeId: 'ben', at: 0.95 }

describe('swap', () => {
  it('emits a mirrored pair of morphs', () => {
    const morphs = swap.resolve(params, ctx('ana'))
    expect(morphs.map((m) => m.segmentId).sort()).toEqual(['ana', 'ben'])
    for (const morph of morphs) {
      expect(morph.durationMs).toBe(DURATION_MS)
      expect(morph.keyframes).toHaveLength(2)
    }
  })

  it('holds each wedge as itself until the trade, then snaps', () => {
    const morphs = swap.resolve(params, ctx('ana'))
    const before = applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.9)
    const after = applyMorphs(SEGMENTS, morphs, DURATION_MS)

    expect(before.find((s) => s.id === 'ana')?.label).toBe('Ana')
    expect(before.find((s) => s.id === 'ben')?.label).toBe('Ben')
    expect(after.find((s) => s.id === 'ana')?.label).toBe('Ben')
    expect(after.find((s) => s.id === 'ben')?.label).toBe('Ana')
  })

  it('snaps the color rather than fading it', () => {
    // Both keyframes share one offset, so `bracket` returns t = 1 for the pair
    // and the color jumps. A fade would telegraph the switch to the audience.
    const morphs = swap.resolve(params, ctx('ana'))
    const justBefore = applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.949)
    const justAfter = applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.951)
    expect(justBefore.find((s) => s.id === 'ana')?.color).toBe('#ff0000')
    expect(justAfter.find((s) => s.id === 'ana')?.color).toBe('#00ff00')
  })

  it('fires at the authored offset, not before', () => {
    const morphs = swap.resolve({ otherWedgeId: 'ben', at: 0.5 }, ctx('ana'))
    expect(
      applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.49).find((s) => s.id === 'ana')?.label,
    ).toBe('Ana')
    expect(
      applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.51).find((s) => s.id === 'ana')?.label,
    ).toBe('Ben')
  })

  it('trades both labels and both colors at the landing frame when it fires at at: 1', () => {
    // The landing frame samples at `p === at` exactly, where both keyframes of
    // the duplicate-offset pair are in range.
    const morphs = swap.resolve({ otherWedgeId: 'cal', at: 1 }, ctx('ana'))
    const landing = applyMorphs(SEGMENTS, morphs, DURATION_MS)
    const ana = landing.find((s) => s.id === 'ana')
    const cal = landing.find((s) => s.id === 'cal')
    expect(ana?.label).toBe('Cal')
    expect(cal?.label).toBe('Ana')
    expect(ana?.color).toBeDefined()
    expect(ana?.color).not.toBe('#ff0000')
    expect(cal?.color).toBe('#ff0000')
  })

  it('keeps the pre-swap keyframe first', () => {
    // Both keyframes share an offset, so only sort stability keeps them in the
    // authored order. Reversed, the swap fires backwards: each wedge would
    // start out wearing the other's name and revert at `at`.
    const [winnerMorph] = swap.resolve(params, ctx('ana'))
    expect(winnerMorph.keyframes[0].label).toBe('Ana')
    expect(winnerMorph.keyframes[1].label).toBe('Ben')
  })

  it('never writes weight', () => {
    const morphs = swap.resolve(params, ctx('ana'))
    for (const morph of morphs) {
      for (const keyframe of morph.keyframes) {
        expect(keyframe).not.toHaveProperty('weight')
      }
    }
  })

  describe('emits nothing when', () => {
    it('there is no winner yet', () => {
      // The editor while scrubbing. An unresolvable selection is a no-op.
      expect(swap.resolve(params, ctx(null))).toEqual([])
    })

    it('the chosen wedge is the winner', () => {
      // Trading a wedge with itself would put two contradictory morphs on one id.
      expect(swap.resolve({ otherWedgeId: 'ana', at: 0.95 }, ctx('ana'))).toEqual([])
    })

    it('the chosen wedge is gone', () => {
      expect(swap.resolve({ otherWedgeId: 'ghost', at: 0.95 }, ctx('ana'))).toEqual([])
    })

    it('the winner is not on the wheel', () => {
      expect(swap.resolve(params, ctx('ghost'))).toEqual([])
    })

    it('nothing is chosen', () => {
      expect(swap.resolve({ at: 0.95 }, ctx('ana'))).toEqual([])
    })
  })

  describe('validate', () => {
    const wedges = { has: (id: string) => ['ana', 'ben', 'cal'].includes(id) }

    it('accepts a known wedge', () => {
      expect(swap.validate({ otherWedgeId: 'ben' }, wedges)).toBeNull()
    })

    it('reports an empty choice the way takeover does', () => {
      expect(swap.validate({ otherWedgeId: '' }, wedges)).toBe('no wedge chosen')
      expect(swap.validate({}, wedges)).toBe('no wedge chosen')
    })

    it('reports a wedge nobody can produce', () => {
      expect(swap.validate({ otherWedgeId: 'ghost' }, wedges)).toBe('unknown wedge: ghost')
    })
  })

  describe('writes', () => {
    it('claims both wedges when the winner is known', () => {
      expect(swap.writes(params, ctx('ana'))).toEqual([
        { segmentId: 'ben', property: 'label' },
        { segmentId: 'ben', property: 'color' },
        { segmentId: 'ben', property: 'reveal' },
        { segmentId: 'ana', property: 'label' },
        { segmentId: 'ana', property: 'color' },
        { segmentId: 'ana', property: 'reveal' },
      ])
    })

    it('claims only the chosen wedge when there is no winner', () => {
      // What `findConflicts` sees. The winner half goes unbadged, which is the
      // documented cost of not inventing a speculative winner.
      expect(swap.writes(params, ctx(null))).toEqual([
        { segmentId: 'ben', property: 'label' },
        { segmentId: 'ben', property: 'color' },
        { segmentId: 'ben', property: 'reveal' },
      ])
    })

    it('claims nothing when nothing is chosen', () => {
      expect(swap.writes({}, ctx(null))).toEqual([])
    })
  })

  it('provides no wedges', () => {
    expect(swap.provides({ otherWedgeId: 'ben' }, 'swap1')).toEqual([])
  })
})

describe('swap reveal', () => {
  const withReveals: Segment[] = [
    { id: 'ana', label: 'Ana', weight: 1, color: '#ff0000', reveal: { headline: 'mine' } },
    { id: 'ben', label: 'Ben', weight: 1, color: '#00ff00', reveal: { headline: 'theirs' } },
  ]

  const ctxFor = (segments: Segment[], winnerId: string | null): RecipeContext => ({
    trickId: 'swap1',
    segments,
    origins: new Map(),
    durationMs: DURATION_MS,
    roll: 0,
    winnerId,
  })

  it('trades the reveal along with the label', () => {
    const morphs = swap.resolve(params, ctxFor(withReveals, 'ana'))
    const landed = applyMorphs(withReveals, morphs, DURATION_MS)
    expect(landed.find((s) => s.id === 'ana')?.reveal).toEqual({ headline: 'theirs' })
    expect(landed.find((s) => s.id === 'ben')?.reveal).toEqual({ headline: 'mine' })
  })

  it('strips the winner reveal when the wedge it trades with has none', () => {
    const oneSided: Segment[] = [
      { id: 'ana', label: 'Ana', weight: 1, color: '#ff0000', reveal: { headline: 'mine' } },
      { id: 'ben', label: 'Ben', weight: 1, color: '#00ff00' },
    ]
    const morphs = swap.resolve(params, ctxFor(oneSided, 'ana'))
    const landed = applyMorphs(oneSided, morphs, DURATION_MS)
    // Wearing another identity while still firing your own punchline is the bug
    // this trade exists to prevent.
    expect(landed.find((s) => s.id === 'ana')?.reveal).toBeUndefined()
    expect(landed.find((s) => s.id === 'ben')?.reveal).toEqual({ headline: 'mine' })
  })

  it('holds each reveal until the trade fires', () => {
    const morphs = swap.resolve(params, ctxFor(withReveals, 'ana'))
    const before = applyMorphs(withReveals, morphs, DURATION_MS * 0.9)
    expect(before.find((s) => s.id === 'ana')?.reveal).toEqual({ headline: 'mine' })
  })

  it('claims the reveal it writes', () => {
    const claims = swap.writes(params, ctxFor(withReveals, 'ana'))
    expect(claims).toContainEqual({ segmentId: 'ana', property: 'reveal' })
    expect(claims).toContainEqual({ segmentId: 'ben', property: 'reveal' })
  })
})
