/** How far the arm is pushed by a peg directly under it. */
export const MAX_DEFLECTION_DEG = 22

/** How far past the hinge a peg still holds the arm up, in degrees of wheel rotation. */
const REACH_DEG = 12

const wrapDeg = (deg: number): number => ((deg % 360) + 360) % 360

/** Where each peg is on screen, given how far the wheel has turned. */
function screenAngles(rotationDeg: number, pegs: number[]): number[] {
  return pegs.map((turn) => wrapDeg(turn * 360 + rotationDeg))
}

/**
 * How far the arm is pushed aside, as the angle to turn it by. A peg lifts it as
 * it arrives and lets it fall as it leaves, so the arm is at rest between pegs
 * and hardest over one.
 *
 * Signed by `turning`, the wheel's rate in degrees per millisecond: a peg can
 * only ever push the arm the way the peg is going. The sign is inverted on the
 * way out because the arm hangs below its hinge — a positive rotation carries
 * its tip counter-clockwise around the wheel, which is backwards into a
 * clockwise spin.
 */
export function deflectionDeg(rotationDeg: number, pegs: number[], turning = 1): number {
  let closest = Number.POSITIVE_INFINITY
  for (const angle of screenAngles(rotationDeg, pegs)) {
    // Distance from the hinge at 12 o'clock, whichever side it is on.
    const from = Math.min(angle, 360 - angle)
    if (from < closest) closest = from
  }
  if (!Number.isFinite(closest) || closest >= REACH_DEG) return 0
  const pushed = MAX_DEFLECTION_DEG * (1 - closest / REACH_DEG)
  return turning < 0 ? pushed : -pushed
}

/** Slow enough to read as falling, fast enough to be done before anyone looks away. */
const FALL_PER_FRAME = 1.5
/** Degrees of wheel per millisecond under which nothing is driving the arm. */
const STILL_SPEED = 0.002

/**
 * Where the arm actually sits. A stopped wheel holds whatever peg it stopped
 * over, and an arm propped on one with nothing moving reads as broken rather
 * than as contact — so once the wheel is still the arm falls upright.
 */
export function settledDeflection(current: number, driven: number, speed: number): number {
  if (Math.abs(speed) > STILL_SPEED) return driven
  // Upright is zero from either side; a wheel that stopped turning the other way
  // would otherwise fall away from it forever.
  const size = Math.max(0, Math.abs(current) - FALL_PER_FRAME)
  return current < 0 ? -size : size
}

/**
 * How many pegs went under the hinge between two angles, travelling the way
 * `turning` says the wheel is. Read the other way round, a step of two degrees
 * counts as 358 and every peg on the wheel clicks every frame.
 */
export function pegCrossings(fromDeg: number, toDeg: number, pegs: number[], turning = 1): number {
  if (pegs.length === 0) return 0
  const forward = turning >= 0
  let swept = forward ? wrapDeg(toDeg - fromDeg) : wrapDeg(fromDeg - toDeg)
  if (swept === 0) return 0
  // A step longer than a full turn passed every peg at least once.
  const turns = Math.floor(swept / 360)
  swept -= turns * 360

  let count = turns * pegs.length
  for (const turn of pegs) {
    const at = wrapDeg(turn * 360)
    // Where this peg sat relative to the hinge when the step began.
    const before = wrapDeg(at + fromDeg)
    const distance = forward ? wrapDeg(360 - before) : wrapDeg(before)
    if (distance > 0 && distance <= swept) count += 1
  }
  return count
}
