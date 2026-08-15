import type { Field } from '../../form/fields'
import { readNumber } from '../../tricks/params'
import type { FitSpec, Frame, Orientation, SliceContext, SliceParams, SlicePart } from '../types'

export const MIN_SIZE = 9

/** What a part with no `maxSize` of its own may reach. */
export const DEFAULT_MAX_SIZE = 40

export function readFrame(params: SliceParams): Frame {
  return params.frame === 'level' ? 'level' : 'wheel'
}

/** The fields every layout shares, in the order the panel shows them. */
export const COMMON_FIELDS: Field[] = [
  {
    key: 'frame',
    label: 'Frame',
    kind: 'select',
    options: [
      { value: 'wheel', label: 'Wheel — painted on' },
      { value: 'level', label: 'Level — stays horizontal' },
    ],
  },
  { key: 'anchor', label: 'Anchor', kind: 'slider', min: 0.3, max: 0.9, step: 0.01 },
  { key: 'maxSize', label: 'Max size', kind: 'slider', min: 10, max: 40, step: 1 },
]

export const COMMON_DEFAULTS = { frame: 'wheel', anchor: 0.7, maxSize: 26 }

/** Everything a fit needs except the text and the orientation. */
export function specOf(
  params: SliceParams,
  ctx: SliceContext,
): Omit<FitSpec, 'text' | 'orientation'> {
  return {
    frame: readFrame(params),
    width: ctx.arc.end - ctx.arc.start,
    radius: ctx.radius,
    anchor: readNumber(params, 'anchor', 0.7),
    maxSize: readNumber(params, 'maxSize', 26),
    minSize: MIN_SIZE,
  }
}

/**
 * A pre-parts layout's params as a single part. The band collapses to the
 * anchor, because `typeset` reads a fitted part's anchor as the band's midpoint.
 */
export function legacyPart(orientation: Orientation, params: SliceParams): SlicePart {
  const anchor = readNumber(params, 'anchor', 0.7)
  return {
    content: { from: 'label' },
    orientation,
    band: [anchor, anchor],
    frame: readFrame(params),
    maxSize: readNumber(params, 'maxSize', 26),
  }
}
