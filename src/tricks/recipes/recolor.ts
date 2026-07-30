import { effectiveColor } from '../../wheel/palette'
import type { Morph, Segment } from '../../wheel/types'
import { readEasing, readString, readStringArray, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeOut', label: 'Ease out' },
  { value: 'easeInOut', label: 'Ease in-out' },
]

function resolveTargets(params: TrickParams, segments: Segment[]): Segment[] {
  const names = readStringArray(params, 'targets')
  if (names.length === 0) return segments
  return segments.filter((segment) => names.includes(segment.id))
}

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

    return resolveTargets(params, ctx.segments).map((segment) => {
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
    return resolveTargets(params, ctx.segments).map((segment) => ({
      segmentId: segment.id,
      property: 'color' as const,
    }))
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    const missing = readStringArray(params, 'targets').filter(
      (id) => !segments.some((segment) => segment.id === id),
    )
    return missing.length === 0 ? null : `unknown wedge: ${missing.join(', ')}`
  },
}
