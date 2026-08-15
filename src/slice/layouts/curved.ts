import type { SliceLayout } from '../types'
import { typeset } from '../typeset'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart } from './shared'

export const curved: SliceLayout = {
  id: 'curved',
  name: 'Curved',
  description: 'The label follows the arc clockwise. Holds the longest labels on a fat wedge.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.78 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    return typeset(legacyPart('curved', params), ctx)
  },
}
