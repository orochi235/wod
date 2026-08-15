export type Weighted = { id: string; weight: number }

/** An arc measured in turns: 0 is 12 o'clock, increasing clockwise to 1. */
export type Arc = { id: string; start: number; end: number }

/**
 * Weights reduced to something safe to divide by, plus their total.
 *
 * Each weight is screened the same way both callers used to screen it. The sum
 * needs its own screen: a weight of 1e308 is finite and passes, but three of
 * them total `Infinity`, and every boundary derived from that total comes back
 * `NaN` — arcs with `NaN` angles render nothing and resolve no pointer. Scaling
 * by the largest weight first bounds the total at `items.length` while leaving
 * the ratios alone. Only overflow takes that path, so ordinary weights divide by
 * exactly the total they always did and no boundary shifts by a float.
 */
function safeWeights(items: Weighted[]): { safe: number[]; total: number } {
  const safe = items.map((i) => (Number.isFinite(i.weight) && i.weight > 0 ? i.weight : 0))
  const total = safe.reduce((sum, w) => sum + w, 0)
  if (Number.isFinite(total)) return { safe, total }

  const max = safe.reduce((m, w) => (w > m ? w : m), 0)
  const scaled = safe.map((w) => w / max)
  return { safe: scaled, total: scaled.reduce((sum, w) => sum + w, 0) }
}

export function normalizeWeights(items: Weighted[]): number[] {
  if (items.length === 0) return []
  const { safe, total } = safeWeights(items)
  if (total <= 0) return items.map(() => 1 / items.length)
  return safe.map((w) => w / total)
}

export function arcs(items: Weighted[]): Arc[] {
  if (items.length === 0) return []
  const { safe, total } = safeWeights(items)

  const out: Arc[] = []
  let cursor = 0
  let running = 0
  for (let i = 0; i < items.length; i++) {
    running += safe[i]
    const isLast = i === items.length - 1
    // Derive each boundary from ONE division of the running weight total rather
    // than accumulating already-rounded fractions. Repeated addition drifts —
    // 0.2 + 0.2 + 0.2 is 0.6000000000000001, not 0.6 — which pushes boundaries
    // off the value a caller computes directly and lands the pointer on the
    // neighboring slice. Falls back to equal spacing when nothing has weight.
    const boundary = total > 0 ? running / total : (i + 1) / items.length
    // The last arc snaps to exactly 1 so drift cannot leave a gap at the top. A
    // zero-weight final segment still ends up zero-width, because the segment
    // before it already reaches a boundary of exactly 1.
    const end = isLast ? 1 : Math.min(1, boundary)
    const start = Math.min(cursor, end)
    out.push({ id: items[i].id, start, end })
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

/** A clockwise arc at `radius`, for text to run along. */
export function concentricPath(start: number, end: number, radius: number): string {
  const [x0, y0] = pointOnCircle(start, radius)
  const [x1, y1] = pointOnCircle(end, radius)
  const largeArc = end - start > 0.5 ? 1 : 0
  const r = round(radius)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`
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
 * `landingTurn` under the pointer, rotate by its complement.
 *
 * Revolutions are deliberately not included. The animator owns how many turns
 * to add and in which direction; baking them in here meant `useSpin` added them
 * a second time while an intervening `% 360` discarded the first.
 */
export function restingRotationDeg(landingTurn: number): number {
  const t = wrapTurn(landingTurn)
  return (360 - t * 360) % 360
}

/** Which wheel-local turn currently sits under the pointer. */
export function pointerTurn(rotationDeg: number): number {
  return wrapTurn(-rotationDeg / 360)
}
