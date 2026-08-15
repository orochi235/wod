import type { SliceLayout } from '../types'
import { typeset } from '../typeset'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart } from './shared'

export const radial: SliceLayout = {
  id: 'radial',
  name: 'Radial',
  description: 'The label runs outward along the radius. Fits narrow wedges best.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.62 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    return typeset(legacyPart('radial', params), ctx)
  },
}
