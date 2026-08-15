import { LADDERS, LADDER_OPTIONS, isLadderId, walkLadder } from '../ladder'
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

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

    const frame = readFrame(params)
    // Level frame has no orientation to honor: the text is horizontal by
    // construction, so every rung that fits draws the same element.
    if (frame === 'level' || placed.orientation !== 'curved') {
      return [
        {
          kind: 'text',
          text: placed.text,
          along: frame === 'level' || placed.orientation === 'tangential' ? 'tangential' : 'radial',
          anchor: placed.anchor,
          size: placed.size,
          frame,
        },
      ]
    }

    return [
      { kind: 'curvedText', text: placed.text, anchor: placed.anchor, size: placed.size, frame },
    ]
  },
}
