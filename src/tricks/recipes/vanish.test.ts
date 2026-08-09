import { describe, expect, it } from 'vitest'
import { wedgeIndexOf } from '../../compose/compose'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { vanish } from './vanish'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 3 },
]

const ctx: RecipeContext = {
  trickId: 't1',
  segments,
  origins: new Map(),
  durationMs: 1000,
  roll: 0,
  winnerId: null,
}

describe('vanish', () => {
  it('provides no segments', () => {
    expect(vanish.provides({ targets: ['ana'] }, 't1')).toEqual([])
  })

  it('emits one morph per named target and touches nothing else', () => {
    const morphs = vanish.resolve({ targets: ['ana'], startAt: 0.5 }, ctx)
    expect(morphs.map((m) => m.segmentId)).toEqual(['ana'])
  })

  it('holds the base weight until startAt, then drops to zero', () => {
    const [morph] = vanish.resolve({ targets: ['ben'], startAt: 0.5 }, ctx)
    expect(morph.keyframes).toEqual([
      { at: 0, weight: 3 },
      { at: 0.5, weight: 3 },
      { at: 1, weight: 0 },
    ])
  })

  it('targets every segment when targets is empty', () => {
    const morphs = vanish.resolve({ targets: [] }, ctx)
    expect(morphs.map((m) => m.segmentId)).toEqual(['ana', 'ben'])
  })

  it('ignores a target that does not exist', () => {
    const morphs = vanish.resolve({ targets: ['ghost'] }, ctx)
    expect(morphs).toEqual([])
  })

  it('carries the spin duration onto each morph', () => {
    const [morph] = vanish.resolve({ targets: ['ana'] }, ctx)
    expect(morph.durationMs).toBe(1000)
  })

  it('declares exactly the weights it writes', () => {
    expect(vanish.writes({ targets: ['ana'] }, ctx)).toEqual([
      { segmentId: 'ana', property: 'weight' },
    ])
  })

  it('rejects a target that no longer exists', () => {
    expect(vanish.validate({ targets: ['ghost'] }, wedgeIndexOf(segments))).toMatch(/ghost/)
  })

  it('accepts a valid target', () => {
    expect(vanish.validate({ targets: ['ana'] }, wedgeIndexOf(segments))).toBeNull()
  })

  it('accepts a selector token that matches nothing yet', () => {
    // Validate only sees segments, so it cannot tell whether a token resolves.
    // It must not have to: an empty roster is the normal authoring state, and
    // reporting it would badge every preset built before the meeting as broken.
    expect(vanish.validate({ targets: ['@external'] }, wedgeIndexOf(segments))).toBeNull()
  })

  it('reports a misspelled token as an unknown wedge', () => {
    // The one genuinely static error here: '@extrenal' is not a token, so it
    // falls through to the concrete-id branch and gets named.
    expect(vanish.validate({ targets: ['@extrenal'] }, wedgeIndexOf(segments))).toMatch(/@extrenal/)
  })
})
