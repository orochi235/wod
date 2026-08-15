import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const radial: SliceLayout = {
  id: 'radial',
  name: 'Radial',
  description: 'The label runs outward along the radius. Fits narrow wedges best.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.62 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const placed = ctx.fit({ ...spec, orientation: 'radial', text: ctx.segment.label })
    if (!placed) return []
    return [
      {
        kind: 'text',
        text: placed.text,
        along: 'radial',
        anchor: placed.anchor,
        size: placed.size,
        frame: readFrame(params),
      },
    ]
  },
}
