export type Weighted = { id: string; weight: number }

/** An arc measured in turns: 0 is 12 o'clock, increasing clockwise to 1. */
export type Arc = { id: string; start: number; end: number }

export function normalizeWeights(items: Weighted[]): number[] {
  if (items.length === 0) return []
  const safe = items.map((i) => (Number.isFinite(i.weight) && i.weight > 0 ? i.weight : 0))
  const total = safe.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return items.map(() => 1 / items.length)
  return safe.map((w) => w / total)
}

export function arcs(items: Weighted[]): Arc[] {
  const fractions = normalizeWeights(items)
  const out: Arc[] = []
  let cursor = 0
  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1
    // Snap the final non-empty arc to exactly 1 so float drift cannot leave a gap
    // at the top of the wheel. A zero-weight final segment must stay zero-width.
    const end = isLast && fractions[i] > 0 ? 1 : cursor + fractions[i]
    out.push({ id: items[i].id, start: cursor, end })
    cursor = end
  }
  return out
}

const TAU = Math.PI * 2

const round = (n: number): number => {
  const r = Number(n.toFixed(3))
  return Object.is(r, -0) ? 0 : r
}

/** Turn 0 is 12 o'clock; turns increase clockwise. SVG y grows downward. */
function pointOnCircle(turn: number, radius: number): [number, number] {
  const angle = turn * TAU
  return [round(radius * Math.sin(angle)), round(-radius * Math.cos(angle))]
}

export function arcPath(start: number, end: number, radius: number): string {
  const width = end - start
  if (!(width > 0)) return ''

  // A full circle cannot be drawn as one arc: its start and end points are the
  // same, and SVG renders that as nothing. Two half-arcs instead.
  if (width >= 1) {
    const r = round(radius)
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`
  }

  const [x0, y0] = pointOnCircle(start, radius)
  const [x1, y1] = pointOnCircle(end, radius)
  const largeArc = width > 0.5 ? 1 : 0
  const r = round(radius)
  return `M 0 0 L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`
}

const wrapTurn = (turn: number): number => {
  let t = turn % 1
  if (t < 0) t += 1
  return t
}

export function angleToSegment(list: Arc[], turn: number): string | null {
  const t = wrapTurn(turn)
  for (const arc of list) {
    if (arc.end > arc.start && t >= arc.start && t < arc.end) return arc.id
  }
  // Float drift can leave a sliver at the very top uncovered. Fall back to the
  // last segment that actually has width rather than reporting no winner.
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].end > list[i].start) return list[i].id
  }
  return null
}

/**
 * The wheel rotates; the pointer is fixed at 12 o'clock. To bring wheel-local
 * `landingTurn` under the pointer, rotate by its complement, plus whole
 * revolutions for the spin.
 */
export function targetRotationDeg(landingTurn: number, fullSpins: number): number {
  const t = wrapTurn(landingTurn)
  return fullSpins * 360 + ((360 - t * 360) % 360)
}

/** Which wheel-local turn currently sits under the pointer. */
export function pointerTurn(rotationDeg: number): number {
  return wrapTurn(-rotationDeg / 360)
}
