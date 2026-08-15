/** Any keyframe-like point on a 0…1 timeline. */
export type At = { at: number }

/**
 * Finds the pair of points bracketing `p`, plus how far between them it sits.
 *
 * Requires `points` sorted ascending by `at`; unsorted input returns nonsense
 * rather than throwing. Where points share an offset, only a tie including the
 * last point resolves to the later value — a tie at the front or in the middle
 * resolves to the earlier one, because the first matching span wins and its
 * bounds are inclusive.
 */
export function bracket<T extends At>(
  points: T[],
  p: number,
): { from: T; to: T; t: number } | null {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  if (p >= last.at) return { from: last, to: last, t: 1 }
  if (p <= first.at) return { from: first, to: first, t: 0 }
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    if (p >= from.at && p <= to.at) {
      const span = to.at - from.at
      return { from, to, t: span === 0 ? 1 : (p - from.at) / span }
    }
  }
  return { from: last, to: last, t: 1 }
}
