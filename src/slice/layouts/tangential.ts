import type { SliceLayout } from '../types'
import { typeset } from '../typeset'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart } from './shared'

export const tangential: SliceLayout = {
  id: 'tangential',
  name: 'Tangential',
  description: 'The label runs across the wedge. Fits fat wedges with short labels.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.68 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    return typeset(legacyPart('tangential', params), ctx)
  },
}
