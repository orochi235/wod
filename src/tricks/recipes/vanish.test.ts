import { describe, expect, it } from 'vitest'
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
    expect(vanish.validate({ targets: ['ghost'] }, segments)).toMatch(/ghost/)
  })

  it('accepts a valid target', () => {
    expect(vanish.validate({ targets: ['ana'] }, segments)).toBeNull()
  })
})
