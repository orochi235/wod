import type { Morph, Segment } from '../../wheel/types'
import { readString, readStringArray, readUnit } from '../params'
import { isSelectorToken, resolveTargets } from '../targets'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

export const relabel: Recipe = {
  id: 'relabel',
  name: 'Named wedges change label',
  description:
    'The chosen wedges switch to new text at a chosen moment. The change is a cut, not a fade.',
  defaults: { targets: [], toLabel: 'LOSER', at: 0.8 },
  fields: [
    { key: 'targets', label: 'Wedges', kind: 'segments' },
    { key: 'toLabel', label: 'New label', kind: 'text' },
    { key: 'at', label: 'Switches at', kind: 'slider', min: 0, max: 1, step: 0.05 },
  ],

  provides: () => [],

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const toLabel = readString(params, 'toLabel', 'LOSER')
    const at = readUnit(params, 'at', 0.8)

    // Labels are step-sampled, so two keyframes are enough: the base holds
    // until `at`, then the new text takes over for the rest of the spin.
    return resolveTargets(readStringArray(params, 'targets'), ctx).map((segment) => ({
      segmentId: segment.id,
      durationMs: ctx.durationMs,
      keyframes: [
        { at: 0, label: segment.label },
        { at, label: toLabel },
      ],
    }))
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    return resolveTargets(readStringArray(params, 'targets'), ctx).map((segment) => ({
      segmentId: segment.id,
      property: 'label' as const,
    }))
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    const missing = readStringArray(params, 'targets').filter(
      (id) => !isSelectorToken(id) && !segments.some((segment) => segment.id === id),
    )
    return missing.length === 0 ? null : `unknown wedge: ${missing.join(', ')}`
  },
}
