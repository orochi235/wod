/** Any keyframe-like point on a 0…1 timeline. */
export type At = { at: number }

/** Finds the pair of points bracketing `p`, plus how far between them it sits. */
export function bracket<T extends At>(
  points: T[],
  p: number,
): { from: T; to: T; t: number } | null {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  // Checked before `p <= first.at`: when every point shares one offset,
  // `first === last`, and a tie must go to the later keyframe to agree with
  // the `span === 0` branch below, which already prefers `to`.
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
