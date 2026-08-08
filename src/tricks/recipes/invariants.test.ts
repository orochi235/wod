import { describe, expect, it } from 'vitest'
import { wedgeIndexOf } from '../../compose/compose'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { Recipe, RecipeContext, TrickParams } from '../types'
import { recolor } from './recolor'
import { relabel } from './relabel'
import { takeover } from './takeover'
import { vanish } from './vanish'

/**
 * Invariants every recipe has to hold, asserted across the whole catalog rather
 * than per recipe. A new recipe added to these lists inherits the coverage.
 */

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

function ctxFor(recipe: Recipe, params: TrickParams): RecipeContext {
  const trickId = 't1'
  return {
    trickId,
    segments: [...segments, ...recipe.provides(params, trickId)],
    origins: new Map(),
    durationMs: 1000,
    roll: 0,
  }
}

describe('a recipe honors its own declared easing default', () => {
  // Compared against `recipe.defaults.easing` rather than a literal, so a recipe
  // whose fallback drifts from its declaration fails here instead of silently
  // animating with the wrong curve.
  for (const recipe of [vanish, takeover, recolor]) {
    it(`${recipe.id} uses defaults.easing when params omit it`, () => {
      // Built without the key rather than set to undefined — the point is the
      // behavior when a stored preset omits it entirely.
      const params = Object.fromEntries(
        Object.entries(recipe.defaults).filter(([key]) => key !== 'easing'),
      )

      const morphs = recipe.resolve(params, ctxFor(recipe, params))

      expect(morphs.length).toBeGreaterThan(0)
      for (const morph of morphs) {
        expect(morph.easing).toBe(recipe.defaults.easing)
      }
    })
  }
})

describe('a color a recipe cannot actually fade is refused', () => {
  // lerpColor only parses hex. A named CSS color would hold the start color for
  // the whole spin then cut on the last frame, so validate rejects it rather
  // than letting the editor promise a fade that never happens.
  const cases = [
    { recipe: recolor, key: 'toColor' },
    { recipe: takeover, key: 'endColor' },
    { recipe: takeover, key: 'wedgeColor' },
  ]

  for (const { recipe, key } of cases) {
    it(`${recipe.id} rejects a named color in ${key}`, () => {
      const params = { ...recipe.defaults, [key]: 'rebeccapurple' }
      expect(recipe.validate(params, wedgeIndexOf(segments))).toMatch(/rebeccapurple/)
    })

    it(`${recipe.id} accepts hex in ${key}`, () => {
      const params = { ...recipe.defaults, [key]: '#ff8811' }
      expect(recipe.validate(params, wedgeIndexOf(segments))).toBeNull()
    })
  }
})

describe('timing parameters at their extremes stay well formed', () => {
  // At 0 and 1 the recipes emit duplicate `at` offsets. That resolves correctly
  // today, but only because of how morph.ts brackets keyframes — these lock the
  // behavior in so a change there fails loudly rather than corrupting geometry.
  const cases = [
    { recipe: vanish, key: 'startAt' },
    { recipe: takeover, key: 'holdUntil' },
    { recipe: takeover, key: 'endShare' },
    { recipe: recolor, key: 'startAt' },
    { recipe: relabel, key: 'at' },
  ]

  for (const { recipe, key } of cases) {
    for (const value of [0, 1]) {
      it(`${recipe.id} with ${key} at ${value}`, () => {
        const params = { ...recipe.defaults, [key]: value }
        const ctx = ctxFor(recipe, params)
        const morphs = recipe.resolve(params, ctx)

        for (const morph of morphs) {
          const offsets = morph.keyframes.map((frame) => frame.at)
          expect(offsets.every((at) => Number.isFinite(at))).toBe(true)
          expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)

          for (const frame of morph.keyframes) {
            if (frame.weight !== undefined) expect(Number.isFinite(frame.weight)).toBe(true)
          }
        }

        // Sampling must never hand the wheel a non-finite weight, which would
        // survive normalization as NaN and blank the whole render.
        for (const progress of [0, 0.5, 1]) {
          for (const segment of applyMorphs(ctx.segments, morphs, progress * ctx.durationMs)) {
            expect(Number.isFinite(segment.weight)).toBe(true)
          }
        }
      })
    }
  }
})
