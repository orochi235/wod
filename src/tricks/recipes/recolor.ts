import type { WedgeIndex } from '../../compose/types'
import { parseHex } from '../../wheel/morph'
import { effectiveColor } from '../../wheel/palette'
import type { Morph } from '../../wheel/types'
import { readEasing, readString, readStringArray, readUnit } from '../params'
import { isSelectorToken, resolveTargets } from '../targets'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeOut', label: 'Ease out' },
  { value: 'easeInOut', label: 'Ease in-out' },
]

export const recolor: Recipe = {
  id: 'recolor',
  name: 'Named wedges change color',
  description: 'The chosen wedges fade to a new color. Weights are untouched.',
  defaults: { targets: [], toColor: '#888888', startAt: 0.5, easing: 'easeInOut' },
  fields: [
    { key: 'targets', label: 'Wedges', kind: 'segments' },
    { key: 'toColor', label: 'Final color', kind: 'color' },
    { key: 'startAt', label: 'Starts at', kind: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'easing', label: 'Easing', kind: 'select', options: EASING_OPTIONS },
  ],

  provides: () => [],

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const toColor = readString(params, 'toColor', '#888888')
    const startAt = readUnit(params, 'startAt', 0.5)
    const easing = readEasing(params, 'easing', 'easeInOut')

    return resolveTargets(readStringArray(params, 'targets'), ctx).map((segment) => {
      // An explicit at:0 keyframe is required. `morph.ts` only synthesizes an
      // implicit base when the segment already carries the property, and a lone
      // late keyframe would otherwise apply from the first frame.
      const from = effectiveColor(ctx.segments, segment.id) ?? '#888888'
      return {
        segmentId: segment.id,
        durationMs: ctx.durationMs,
        easing,
        keyframes: [
          { at: 0, color: from },
          { at: startAt, color: from },
          { at: 1, color: toColor },
        ],
      }
    })
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    return resolveTargets(readStringArray(params, 'targets'), ctx).map((segment) => ({
      segmentId: segment.id,
      property: 'color' as const,
    }))
  },

  validate(params: TrickParams, wedges: WedgeIndex): string | null {
    // A token resolving to nothing is the normal state while authoring with no
    // meeting running. Reporting it would badge every preset as broken.
    const missing = readStringArray(params, 'targets').filter(
      (id) => !isSelectorToken(id) && !wedges.has(id),
    )
    if (missing.length > 0) return `unknown wedge: ${missing.join(', ')}`

    // lerpColor only understands hex. A named CSS color parses as nothing, so
    // it holds the start color for the whole spin and then cuts to the target
    // on the final frame — a fade that never fades. Better to refuse it.
    const toColor = readString(params, 'toColor', '#888888')
    return parseHex(toColor) ? null : `not a hex color: ${toColor}`
  },
}
