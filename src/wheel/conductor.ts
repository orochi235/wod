import type { Slice } from './melody'

/** Pegs per note-unit the conductor can pick: halving steps, so a tempo change is always an octave of speed. */
const PEGS_PER_UNIT = [1, 2, 4, 8, 16, 32]

/** The shortest a note-unit may last before the tune turns into a rattle. */
export const MIN_UNIT_S = 0.12

/** How far past the threshold the wheel has to slow before the grid halves, so it does not flicker at the boundary. */
const SETTLE = 1.25

/** Each slice's length in units of the song's shortest one. */
export function unitsOf(slices: Slice[]): number[] {
  const unit = Math.min(...slices.map((slice) => slice.duration))
  return slices.map((slice) => Math.max(1, Math.round(slice.duration / unit)))
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
 * Plays a tune on a wheel's pegs at a tempo that follows the wheel: a note-unit
 * spans as few pegs as keeps it at least `minUnitS` long, so a fast wheel plays
 * the tune at a listenable speed and a slowing one walks down to one unit per peg.
 */
export function createConductor(units: number[], minUnitS = MIN_UNIT_S): Conductor {
  let level = 0
  let cursor = 0
  // Units still to pass before the next note may start.
  let owed = 0

  return {
    peg(intervalS) {
      while (level < PEGS_PER_UNIT.length - 1 && PEGS_PER_UNIT[level] * intervalS < minUnitS)
        level++
      while (level > 0 && PEGS_PER_UNIT[level - 1] * intervalS >= minUnitS * SETTLE) level--

      let played: number | null = null
      if (owed <= 1e-6) {
        played = cursor
        owed += units[cursor]
        cursor = (cursor + 1) % units.length
      }
      owed -= 1 / PEGS_PER_UNIT[level]
      return played
    },
    restart() {
      cursor = 0
      owed = 0
    },
    get pegsPerUnit() {
      return PEGS_PER_UNIT[level]
    },
  }
}
