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
 * How far the arm is pushed aside. A peg lifts it as it arrives and lets it fall
 * as it leaves, so the arm is at rest between pegs and hardest over one.
 */
export function deflectionDeg(rotationDeg: number, pegs: number[]): number {
  let closest = Number.POSITIVE_INFINITY
  for (const angle of screenAngles(rotationDeg, pegs)) {
    // Distance from the hinge at 12 o'clock, whichever side it is on.
    const from = Math.min(angle, 360 - angle)
    if (from < closest) closest = from
  }
  if (!Number.isFinite(closest) || closest >= REACH_DEG) return 0
  return MAX_DEFLECTION_DEG * (1 - closest / REACH_DEG)
}

/** How many pegs went under the hinge between two angles. */
export function pegCrossings(fromDeg: number, toDeg: number, pegs: number[]): number {
  if (pegs.length === 0) return 0
  let swept = wrapDeg(toDeg - fromDeg)
  if (swept === 0) return 0
  // A step longer than a full turn passed every peg at least once.
  const turns = Math.floor(swept / 360)
  swept -= turns * 360

  let count = turns * pegs.length
  for (const turn of pegs) {
    const at = wrapDeg(turn * 360)
    // Where this peg sat relative to the hinge when the step began.
    const before = wrapDeg(at + fromDeg)
    const distance = wrapDeg(360 - before)
    if (distance > 0 && distance <= swept) count += 1
  }
  return count
}
