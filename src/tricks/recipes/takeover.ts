import { effectiveColor } from '../../wheel/palette'
import type { Morph, MorphKeyframe, Segment } from '../../wheel/types'
import { readEasing, readOptionalString, readString, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

/** Deterministic so `provides` and `resolve` agree on the wedge's identity. */
export function wedgeIdFor(trickId: string): string {
  return `${trickId}:wedge`
}

function isNewMode(params: TrickParams): boolean {
  return readString(params, 'wedgeMode', 'new') === 'new'
}

function wedgeId(params: TrickParams, trickId: string): string {
  return isNewMode(params) ? wedgeIdFor(trickId) : readString(params, 'wedgeSegmentId', '')
}

/**
 * Whether the wedge ends up owning the whole circle — either because it was
 * asked to, or because nobody else has weight left to share.
 *
 * The second case matters: with `othersTotal` at 0 the proportional solve
 * collapses to `share * 0 / (1 - share)` = 0, so every segment including the
 * wedge would land at zero weight. `normalizeWeights` reads an all-zero wheel
 * as "nothing has been weighted" and splits it evenly, which is the opposite of
 * the requested share. Shared by `resolve` and `writes` so the two cannot
 * disagree about which branch ran.
 */
function takesWholeCircle(endShare: number, othersTotal: number): boolean {
  return endShare >= 1 || othersTotal <= 0
}

export const takeover: Recipe = {
  id: 'takeover',
  name: 'One wedge swallows the wheel',
  description:
    'A wedge sits still, then grows to take the chosen share of the circle. At a full share every other wedge shrinks to nothing, which makes the winner certain.',
  defaults: {
    wedgeMode: 'new',
    wedgeLabel: 'free beer',
    wedgeColor: '#ffd166',
    wedgeSegmentId: '',
    holdUntil: 0.6,
    endShare: 1,
    endColor: '',
    easing: 'easeIn',
  },
  fields: [
    {
      key: 'wedgeMode',
      label: 'Wedge',
      kind: 'select',
      options: [
        { value: 'new', label: 'New wedge owned by this trick' },
        { value: 'existing', label: 'An existing wedge' },
      ],
    },
    { key: 'wedgeLabel', label: 'Wedge label', kind: 'text' },
    { key: 'wedgeColor', label: 'Wedge color', kind: 'color' },
    { key: 'wedgeSegmentId', label: 'Existing wedge', kind: 'segments' },
    { key: 'holdUntil', label: 'Holds until', kind: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'endShare', label: 'Final share', kind: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'endColor', label: 'Final color', kind: 'color' },
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

  provides(params: TrickParams, trickId: string): Segment[] {
    if (!isNewMode(params)) return []
    return [
      {
        id: wedgeIdFor(trickId),
        label: readString(params, 'wedgeLabel', 'free beer'),
        weight: 0,
        color: readString(params, 'wedgeColor', '#ffd166'),
      },
    ]
  },

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const id = wedgeId(params, ctx.trickId)
    const wedge = ctx.segments.find((segment) => segment.id === id)
    if (!wedge) return []

    const holdUntil = readUnit(params, 'holdUntil', 0.6)
    const endShare = readUnit(params, 'endShare', 1)
    const endColor = readOptionalString(params, 'endColor')
    const easing = readEasing(params, 'easing', 'easeIn')

    const others = ctx.segments.filter((segment) => segment.id !== id)
    const othersTotal = others.reduce((sum, segment) => sum + segment.weight, 0)

    // At a full share the others must go to zero, so the wedge's own number is
    // arbitrary. Below that, solve w / (w + T) = share for w.
    const takesAll = takesWholeCircle(endShare, othersTotal)
    const endWeight = takesAll ? 1 : (endShare * othersTotal) / (1 - endShare)

    // The color the wheel actually paints, which is what the fade has to start
    // from. `wedge.color` is undefined for any segment left to the palette, and
    // reading that directly would silently drop the requested end color.
    const baseColor = effectiveColor(ctx.segments, id)

    const grow: MorphKeyframe[] = [
      { at: 0, weight: wedge.weight },
      { at: holdUntil, weight: wedge.weight },
      { at: 1, weight: endWeight },
    ]
    if (endColor && baseColor) {
      grow[0] = { ...grow[0], color: baseColor }
      grow[1] = { ...grow[1], color: baseColor }
      grow[2] = { ...grow[2], color: endColor }
    }

    const morphs: Morph[] = [{ segmentId: id, durationMs: ctx.durationMs, easing, keyframes: grow }]
    if (!takesAll) return morphs

    for (const segment of others) {
      morphs.push({
        segmentId: segment.id,
        durationMs: ctx.durationMs,
        easing,
        keyframes: [
          { at: 0, weight: segment.weight },
          { at: holdUntil, weight: segment.weight },
          { at: 1, weight: 0 },
        ],
      })
    }
    return morphs
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    const id = wedgeId(params, ctx.trickId)
    const wedge = ctx.segments.find((segment) => segment.id === id)
    if (!wedge) return []

    const others = ctx.segments.filter((segment) => segment.id !== id)
    const othersTotal = others.reduce((sum, segment) => sum + segment.weight, 0)

    const writes: Write[] = [{ segmentId: id, property: 'weight' }]
    if (readOptionalString(params, 'endColor') && effectiveColor(ctx.segments, id)) {
      writes.push({ segmentId: id, property: 'color' })
    }
    if (takesWholeCircle(readUnit(params, 'endShare', 1), othersTotal)) {
      for (const segment of others) {
        writes.push({ segmentId: segment.id, property: 'weight' })
      }
    }
    return writes
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    if (isNewMode(params)) return null
    const id = readString(params, 'wedgeSegmentId', '')
    if (id === '') return 'no wedge chosen'
    return segments.some((segment) => segment.id === id) ? null : `unknown wedge: ${id}`
  },
}
