import { DEFAULT_PART, MAX_PARTS, readParts } from '../parts'
import type { SliceLayout } from '../types'
import { typeset } from '../typeset'

export const composed: SliceLayout = {
  id: 'composed',
  name: 'Composed',
  description:
    'Several pieces of type and imagery, each owning its own band of the radius. Nothing reflows when a neighbour changes.',
  defaults: { parts: [DEFAULT_PART] },
  fields: [{ key: 'parts', label: 'Part', kind: 'parts', max: MAX_PARTS }],
  draw(params, ctx) {
    return readParts(params.parts).flatMap((part) => typeset(part, ctx))
  },
}
