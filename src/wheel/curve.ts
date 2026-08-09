import type { Curve } from './types'

/** The settle the design defaults to: k ≈ 0.33, so the break covers about a third of the ground. */
export const DEFAULT_SETTLE_CURVE: Curve = [0.33, 1, 0.68, 1]

const KEYWORDS: Record<string, Curve> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
}

const CUBIC_BEZIER = /^cubic-bezier\(([^)]*)\)$/

/** CSS pins x to the unit interval and leaves y free, which is what allows overshoot. */
const clampX = (n: number): number => Math.min(1, Math.max(0, n))

function fromNumbers(values: number[]): Curve | null {
  if (values.length !== 4 || !values.every((n) => Number.isFinite(n))) return null
  return [clampX(values[0]), values[1], clampX(values[2]), values[3]]
}

export function parseCurve(value: unknown): Curve | null {
  if (Array.isArray(value)) {
    return fromNumbers(value.map((n) => (typeof n === 'number' ? n : Number.NaN)))
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  // Object.hasOwn, not a bare lookup: this reads stored JSON, and a stored
  // 'constructor' would otherwise resolve up the prototype chain to a function.
  // Spread, so the table cannot be mutated through a returned tuple.
  if (Object.hasOwn(KEYWORDS, text)) return [...KEYWORDS[text]]
  const match = CUBIC_BEZIER.exec(text)
  if (!match) return null
  return fromNumbers(match[1].split(',').map((part) => Number.parseFloat(part)))
}

/**
 * Progress per unit time at t = 0. A cubic Bézier's tangent at the origin points
 * from P0 toward P1; when P1 sits on P0 it points toward P2 instead, which is
 * the only reason `ease-out` does not come out as 0/0.
 */
export function initialSlope(curve: Curve): number {
  const [x1, y1, x2, y2] = curve
  if (x1 !== 0 || y1 !== 0) return y1 / x1
  if (x2 !== 0 || y2 !== 0) return y2 / x2
  return 1
}

/** Whether a curve has a handover speed to match. Zero, negative, or infinite has none. */
export function isSettleCurve(curve: Curve): boolean {
  const slope = initialSlope(curve)
  return Number.isFinite(slope) && slope > 0
}

export function cssCurve([x1, y1, x2, y2]: Curve): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
}
