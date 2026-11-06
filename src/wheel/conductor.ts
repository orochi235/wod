/** Pegs per note-unit the grid can pick: halving steps, so a tempo change is always an octave of speed. */
const PEGS_PER_UNIT = [1, 2, 4, 8, 16, 32]

/** The shortest a note-unit may last before the tune turns into a rattle. */
export const MIN_UNIT_S = 0.12

/** How far past the threshold the wheel has to slow before the grid halves, so it does not flicker at the boundary. */
const SETTLE = 1.25

const EPSILON = 1e-6

/**
 * How many pegs a note-unit spans, chosen peg by peg from how far apart the
 * pegs are: the fewest that keep a unit at least `minUnitS` long.
 */
export function createGrid(minUnitS = MIN_UNIT_S): (intervalS: number) => number {
  let level = 0
  return (intervalS) => {
    while (level < PEGS_PER_UNIT.length - 1 && PEGS_PER_UNIT[level] * intervalS < minUnitS) level++
    while (level > 0 && PEGS_PER_UNIT[level - 1] * intervalS >= minUnitS * SETTLE) level--
    return PEGS_PER_UNIT[level]
  }
}

/** Where each note starts, in units from the top of the tune. */
export function onsetsOf(units: number[]): number[] {
  const onsets: number[] = []
  let at = 0
  for (const length of units) {
    onsets.push(at)
    at += length
  }
  return onsets
}

export type Conductor = {
  /** One peg went by, `intervalS` after the one before it. Returns the note to play on it, or null. */
  peg(intervalS: number): number | null
  /** Back to the first note, for a new spin. */
  restart(): void
  /** How many pegs one note-unit currently spans. */
  readonly pegsPerUnit: number
}

/**
 * Plays a tune on a wheel's pegs at a tempo that follows the wheel, looping: a
 * fast wheel plays it at a listenable speed and a slowing one walks down to one
 * unit per peg.
 */
export function createConductor(units: number[], minUnitS = MIN_UNIT_S): Conductor {
  let grid = createGrid(minUnitS)
  let pegsPerUnit = 1
  let cursor = 0
  // Units still to pass before the next note may start.
  let owed = 0

  return {
    peg(intervalS) {
      pegsPerUnit = grid(intervalS)
      let played: number | null = null
      if (owed <= EPSILON) {
        played = cursor
        owed += units[cursor]
        cursor = (cursor + 1) % units.length
      }
      owed -= 1 / pegsPerUnit
      return played
    },
    restart() {
      grid = createGrid(minUnitS)
      cursor = 0
      owed = 0
    },
    get pegsPerUnit() {
      return pegsPerUnit
    },
  }
}

/**
 * A spin's pegs mapped onto a tune ahead of time: how many units each peg
 * advances, and where in the tune the first peg stands. Negative `startUnits`
 * is a silent lead-in; positive skips the opening.
 */
export type PegSchedule = { advance: number[]; startUnits: number }

/** Plays a schedule once, peg by peg; past its last peg it plays nothing. */
export function createScheduledConductor(units: number[], schedule: PegSchedule) {
  const onsets = onsetsOf(units)
  let pegIndex = 0
  let position = schedule.startUnits
  let next = onsets.findIndex((onset) => onset >= position - EPSILON)
  if (next === -1) next = units.length
  return {
    peg(): number | null {
      if (pegIndex >= schedule.advance.length) return null
      let played: number | null = null
      if (next < units.length && onsets[next] <= position + EPSILON) {
        played = next
        next += 1
      }
      position += schedule.advance[pegIndex]
      pegIndex += 1
      return played
    },
  }
}
