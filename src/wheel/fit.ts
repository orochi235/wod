import { createGrid, onsetsOf, type PegSchedule } from './conductor'
import { curveAt, DEFAULT_SETTLE_CURVE, initialSlope, isSettleCurve } from './curve'
import { type RotationTrack, rotationTrack } from './rotation'
import type { Curve, SpinConfig } from './types'

const NAMED: Record<string, Curve> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
}

function parseEasing(value: unknown): Curve {
  const text = String(value ?? 'linear').trim()
  const bezier = /^cubic-bezier\(([^)]+)\)$/.exec(text)
  if (bezier) {
    const parts = bezier[1].split(',').map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) return parts as Curve
  }
  return NAMED[text] ?? NAMED.linear
}

const ANGLE = /rotate\((-?[\d.e+-]+)deg\)/

/** The wheel's angle over a track, read the way the Web Animations API plays it: `ms` in, degrees out. */
export function angleOf(track: RotationTrack): (ms: number) => number {
  const frames = track.keyframes.map((frame, i, all) => ({
    offset: typeof frame.offset === 'number' ? frame.offset : i / Math.max(1, all.length - 1),
    angle: Number(ANGLE.exec(String(frame.transform ?? ''))?.[1] ?? 0),
    easing: parseEasing(frame.easing),
  }))
  const timeline = parseEasing(track.easing)
  return (ms) => {
    const progress = curveAt(timeline, Math.min(Math.max(ms / track.durationMs, 0), 1))
    let i = 0
    while (i < frames.length - 2 && frames[i + 1].offset <= progress) i++
    const a = frames[i]
    const b = frames[i + 1] ?? a
    const span = b.offset - a.offset
    const local = span > 0 ? curveAt(a.easing, (progress - a.offset) / span) : 1
    return a.angle + (b.angle - a.angle) * local
  }
}

export function angleAt(track: RotationTrack, ms: number): number {
  return angleOf(track)(ms)
}

const wrap = (deg: number) => ((deg % 360) + 360) % 360

/**
 * Seconds into the track at which each peg passes the hinge, in order. A peg at
 * turn `p` is under the hinge whenever the wheel's angle is `-p·360` modulo a
 * turn, the same rule the flapper counts crossings by.
 */
export function pegTimes(track: RotationTrack, pegs: number[]): number[] {
  if (pegs.length === 0 || track.durationMs <= 0) return []
  const angle = angleOf(track)
  const from = angle(0)
  const to = angle(track.durationMs)
  const forward = to >= from
  const angles: number[] = []
  for (const turn of pegs) {
    const hinge = wrap(-turn * 360)
    if (forward) {
      for (let a = from + (wrap(hinge - from) || 360); a <= to; a += 360) angles.push(a)
    } else {
      for (let a = from - (wrap(from - hinge) || 360); a >= to; a -= 360) angles.push(a)
    }
  }
  angles.sort((x, y) => (forward ? x - y : y - x))
  return angles.map((target) => {
    let lo = 0
    let hi = track.durationMs
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      const reached = forward ? angle(mid) >= target : angle(mid) <= target
      if (reached) hi = mid
      else lo = mid
    }
    return hi / 1000
  })
}

/** How many units each peg advances the tune, by the same grid the live conductor uses. */
export function advanceAt(times: number[], minUnitS: number): number[] {
  const grid = createGrid(minUnitS)
  return times.map((at, i) => 1 / grid(i === 0 ? at : at - times[i - 1]))
}

/** Units the tune has moved before the last peg strikes. */
const beforeLast = (advance: number[]) => advance.slice(0, -1).reduce((sum, step) => sum + step, 0)

/** Grid thresholds tried when fitting, 20 ms to about 1.5 s: the tempo feel varies; the landing never does. */
const THRESHOLDS = Array.from({ length: 112 }, (_, i) => 0.02 * 1.04 ** i)

/** The share of a spin's pegs, from its start, that may give up time to land the tune; the braking tail keeps its own. */
const ABSORBING = 0.8

/**
 * Shortens the early pegs' steps so they cover `excess` fewer units, letting the
 * tune start on the first peg instead of after a silent lead-in. The tail is left
 * alone, so the ending still walks down to one note per peg.
 */
function absorb(advance: number[], excess: number): { advance: number[]; left: number } {
  const cut = Math.floor(advance.length * ABSORBING)
  const early = advance.slice(0, cut).reduce((sum, step) => sum + step, 0)
  if (excess <= 0 || early <= 0) return { advance, left: Math.max(0, excess) }
  const keep = Math.max(0, early - excess) / early
  return {
    advance: advance.map((step, i) => (i < cut ? step * keep : step)),
    left: Math.max(0, excess - early),
  }
}

/**
 * Maps this spin's pegs onto the tune so its last note starts on the last peg:
 * the grid threshold that leaves the shortest lead-in, with that lead-in then
 * absorbed into the fast pegs. Only a tune too long for the spin starts past its
 * opening.
 */
export function scheduleFor(
  track: RotationTrack,
  pegs: number[],
  units: number[],
  preferred?: number,
): PegSchedule | null {
  const times = pegTimes(track, pegs)
  if (times.length === 0 || units.length === 0) return null
  const lastOnset = onsetsOf(units)[units.length - 1]
  let best: PegSchedule | null = null
  // A spin sized for one threshold lands best on it, keeping the tempo it was sized for.
  const tried = preferred === undefined ? THRESHOLDS : [preferred]
  for (const threshold of tried) {
    const advance = advanceAt(times, threshold)
    const startUnits = lastOnset - beforeLast(advance)
    const better =
      best === null ||
      (startUnits <= 0 && (best.startUnits > 0 || startUnits > best.startUnits)) ||
      (startUnits > 0 && best.startUnits > 0 && startUnits < best.startUnits)
    if (better) best = { advance, startUnits }
  }
  if (preferred !== undefined && (!best || best.startUnits > 0)) {
    return scheduleFor(track, pegs, units)
  }
  if (!best || best.startUnits >= 0) return best
  // The last peg's own step never moves the tune before it strikes, so leave it out.
  const { advance, left } = absorb(best.advance.slice(0, -1), -best.startUnits)
  return { advance: [...advance, best.advance.at(-1) ?? 0], startUnits: -left }
}

const PEGS_PER_UNIT = [1, 2, 4, 8, 16, 32]

/**
 * A spin shaped around a tune: it cruises at a steady speed that puts a whole
 * number of pegs on each of the tune's units, so the tune plays at its own tempo,
 * then brakes over the settle, where the grid walks down to one note per peg. It
 * runs as long as the tune needs; `threshold` is the grid that sizing assumed,
 * for `scheduleFor` to land on once the winner is drawn.
 */
export function fitSpin(
  config: SpinConfig,
  pegs: number[],
  units: number[],
  unitS: number,
): { config: SpinConfig; threshold: number } {
  const threshold = unitS * 0.95
  if (config.durationMs <= 0 || pegs.length === 0 || units.length === 0) {
    return { config, threshold }
  }
  const pegDeg = 360 / pegs.length
  const authoredPegMs = pegDeg / ((config.fullSpins * 360 + 180) / config.durationMs)
  // The grid nearest the authored spin's speed, so a fitted wheel looks about as fast.
  const perUnit = PEGS_PER_UNIT.reduce((best, next) =>
    Math.abs(Math.log((unitS * 1000) / next / authoredPegMs)) <
    Math.abs(Math.log((unitS * 1000) / best / authoredPegMs))
      ? next
      : best,
  )
  const degPerMs = pegDeg / ((unitS * 1000) / perUnit)
  const settleMs = Math.max(config.settle?.ms ?? 0, 4000)
  const curve =
    config.settle && isSettleCurve(config.settle.curve) ? config.settle.curve : DEFAULT_SETTLE_CURVE
  const k = 1 / initialSlope(curve)
  const lastOnset = onsetsOf(units)[units.length - 1]

  const shaped = (durationMs: number): SpinConfig => ({
    ...config,
    durationMs,
    fullSpins: Math.max(
      1,
      Math.round((degPerMs * (durationMs - settleMs + k * settleMs) - 180) / 360),
    ),
    settle: { ms: settleMs, curve },
  })
  const fits = (durationMs: number) =>
    beforeLast(advanceAt(pegTimes(rotationTrack(0, 180, shaped(durationMs)), pegs), threshold)) >=
    lastOnset

  let lo = settleMs * 2
  let hi = Math.max(lo * 2, lastOnset * unitS * 1000 * 2)
  if (!fits(hi)) return { config: shaped(hi), threshold }
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  return { config: shaped(Math.round(hi)), threshold }
}
