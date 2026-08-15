import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const curved: SliceLayout = {
  id: 'curved',
  name: 'Curved',
  description: 'The label follows the arc clockwise. Holds the longest labels on a fat wedge.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.78 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const placed = ctx.fit({ ...spec, orientation: 'curved', text: ctx.segment.label })
    if (!placed) return []
    return [
      {
        kind: 'curvedText',
        text: placed.text,
        anchor: placed.anchor,
        size: placed.size,
        frame: readFrame(params),
      },
    ]
  },
}
