import type { Field } from '../../form/fields'
import { readNumber, readOptionalString, readString } from '../../tricks/params'
import type { SliceLayout, SliceParams, SlicePart } from '../types'
import { typeset } from '../typeset'

/**
 * The mark's own band, which is furniture rather than content: it sits just
 * inside the rim at whatever size it was given and does not answer to the
 * figure's band the way the figure answers to the hub.
 */
const MARK_BAND: [number, number] = [0.86, 0.94]

const FIELDS: Field[] = [
  { key: 'mark', label: 'Currency mark', kind: 'text' },
  { key: 'font', label: 'Figure face', kind: 'font' },
  { key: 'leading', label: 'Figure leading', kind: 'slider', min: 0.5, max: 2, step: 0.02 },
  { key: 'inner', label: 'Inner edge', kind: 'slider', min: 0.1, max: 0.8, step: 0.01 },
  { key: 'outer', label: 'Outer edge', kind: 'slider', min: 0.3, max: 0.95, step: 0.01 },
  { key: 'markSize', label: 'Mark size', kind: 'slider', min: 6, max: 30, step: 1 },
]

function partsOf(params: SliceParams): SlicePart[] {
  const mark = readString(params, 'mark', '$')
  // Ordered rather than trusted: dragging the inner edge past the outer one
  // narrows the band instead of inverting it, as `PartsField` already does.
  const a = readNumber(params, 'inner', 0.38)
  const b = readNumber(params, 'outer', 0.84)
  const band: [number, number] = [Math.min(a, b), Math.max(a, b)]

  const figure: SlicePart = {
    content: { from: 'label', transform: 'digits' },
    orientation: 'stacked',
    band,
    stretch: 'fill',
    leading: readNumber(params, 'leading', 0.78),
    font: readOptionalString(params, 'font'),
  }

  if (mark === '') return [figure]
  return [
    {
      content: { from: 'text', value: mark },
      orientation: 'stacked',
      band: MARK_BAND,
      maxSize: readNumber(params, 'markSize', 15),
      // Widened, not filled: a mark stretched to the whole chord stops reading
      // as a currency mark at all.
      stretch: 1.5,
    },
    figure,
  ]
}

/**
 * A money face: a small currency mark with the figure stacked under it. The two
 * parts are generated rather than authored, so a board of two dozen of them is
 * one layout to tune instead of two dozen copies of the same pair.
 */
export const cash: SliceLayout = {
  id: 'cash',
  name: 'Cash',
  description:
    'A currency mark inside the rim with the wedge’s figure stacked down the wedge. The digits take the whole band and taper toward the hub.',
  defaults: {
    mark: '$',
    font: 'alfa-slab-one',
    leading: 0.78,
    inner: 0.38,
    outer: 0.84,
    markSize: 15,
  },
  fields: FIELDS,
  draw(params, ctx) {
    return partsOf(params).flatMap((part) => typeset(part, ctx))
  },
}
