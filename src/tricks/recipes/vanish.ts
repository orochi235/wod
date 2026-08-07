import type { Morph, Segment } from '../../wheel/types'
import { readEasing, readStringArray, readUnit } from '../params'
import { isSelectorToken, resolveTargets } from '../targets'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

export const vanish: Recipe = {
  id: 'vanish',
  name: 'Named wedges shrink away',
  description: 'The chosen wedges shrink to nothing, so they cannot win.',
  defaults: { targets: [], startAt: 0.5, easing: 'easeIn' },
  fields: [
    { key: 'targets', label: 'Wedges', kind: 'segments' },
    { key: 'startAt', label: 'Starts at', kind: 'slider', min: 0, max: 1, step: 0.05 },
    {
      key: 'easing',
      label: 'Easing',
      kind: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'easeIn', label: 'Ease in' },
        { value: 'easeOut', label: 'Ease out' },
        { value: 'easeInOut', label: 'Ease in-out' },
      ],
    },
  ],

  provides: () => [],

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const startAt = readUnit(params, 'startAt', 0.5)
    const easing = readEasing(params, 'easing', 'easeIn')
    return resolveTargets(readStringArray(params, 'targets'), ctx).map((segment) => ({
      segmentId: segment.id,
      durationMs: ctx.durationMs,
      easing,
      keyframes: [
        { at: 0, weight: segment.weight },
        { at: startAt, weight: segment.weight },
        { at: 1, weight: 0 },
      ],
    }))
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    return resolveTargets(readStringArray(params, 'targets'), ctx).map((segment) => ({
      segmentId: segment.id,
      property: 'weight' as const,
    }))
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    const missing = readStringArray(params, 'targets').filter(
      (id) => !isSelectorToken(id) && !segments.some((segment) => segment.id === id),
    )
    return missing.length === 0 ? null : `unknown wedge: ${missing.join(', ')}`
  },
}
