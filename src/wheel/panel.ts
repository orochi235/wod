import { pointAt } from './geometry'

/**
 * The slab a label sits on: an arc band inset from both radial edges of the
 * wedge, between the two radii the look names.
 */
export function panelPath(
  start: number,
  end: number,
  radius: number,
  [inner, outer]: [number, number],
  padTurn: number,
): string {
  if (!(end > start)) return ''
  if (!(outer > inner)) return ''

  const from = start + padTurn
  const to = end - padTurn
  if (!(to > from)) return ''

  const rIn = radius * inner
  const rOut = radius * outer
  const [ax, ay] = pointAt(from, rIn)
  const [bx, by] = pointAt(from, rOut)
  const [cx, cy] = pointAt(to, rOut)
  const [dx, dy] = pointAt(to, rIn)
  const large = to - from > 0.5 ? 1 : 0
  return `M ${ax} ${ay} L ${bx} ${by} A ${rOut} ${rOut} 0 ${large} 1 ${cx} ${cy} L ${dx} ${dy} A ${rIn} ${rIn} 0 ${large} 0 ${ax} ${ay} Z`
}
