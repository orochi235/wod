import { LADDERS, LADDER_OPTIONS, isLadderId, walkLadder } from '../ladder'
import type { SliceLayout } from '../types'
import { typeset } from '../typeset'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart, specOf } from './shared'

export const auto: SliceLayout = {
  id: 'auto',
  name: 'Auto',
  description: 'Picks an orientation that fits, then shortens the label rather than dropping it.',
  defaults: { ...COMMON_DEFAULTS, ladder: 'shrinkNameInitials' },
  fields: [
    { key: 'ladder', label: "When it won't fit", kind: 'select', options: LADDER_OPTIONS },
    ...COMMON_FIELDS,
  ],
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const rungs = isLadderId(params.ladder) ? LADDERS[params.ladder] : LADDERS.shrinkNameInitials
    const placed = walkLadder(ctx.segment.label, rungs, spec, ctx.fit, ctx.measure)
    if (!placed) return []

    // The ladder chose the orientation and already shortened the text; `typeset`
    // re-runs the same fit against the same spec and lands on the same size.
    return typeset(
      { ...legacyPart(placed.orientation, params), content: { from: 'text', value: placed.text } },
      ctx,
    )
  },
}
