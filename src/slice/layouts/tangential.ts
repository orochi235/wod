import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const tangential: SliceLayout = {
  id: 'tangential',
  name: 'Tangential',
  description: 'The label runs across the wedge. Fits fat wedges with short labels.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.68 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const placed = ctx.fit({ ...spec, orientation: 'tangential', text: ctx.segment.label })
    if (!placed) return []
    return [
      {
        kind: 'text',
        text: placed.text,
        along: 'tangential',
        anchor: placed.anchor,
        size: placed.size,
        frame: readFrame(params),
      },
    ]
  },
}
