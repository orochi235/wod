import {
  ACTIVE_NAMES,
  type ActiveName,
  ENTER_NAMES,
  EXIT_NAMES,
  type EnterName,
  type ExitName,
  LOOK_NAMES,
  type LookName,
} from 'klieg'
import type { Rng } from '../wheel/selection'

export type BannerStyle = {
  enter: EnterName
  active: ActiveName
  exit: ExitName
  look: LookName
}

/**
 * `none` is a way of switching a slot off, not a piece of motion, and a
 * celebration that draws it three times is a word that appears and vanishes.
 */
const played = <T extends string>(names: readonly T[]): T[] =>
  names.filter((name) => name !== 'none')

const ENTERS = played(ENTER_NAMES)
const ACTIVES = played(ACTIVE_NAMES)
const EXITS = played(EXIT_NAMES)

const pick = <T>(from: readonly T[], rng: Rng): T =>
  from[Math.min(Math.floor(rng() * from.length), from.length - 1)]

/** The one place that knows the library's names, so it is where an id is judged. */
const named = (look: string | undefined): LookName | null =>
  LOOK_NAMES.find((name) => name === look) ?? null

/**
 * How one winner arrives, holds, and leaves. Rolled per landing rather than
 * fixed: the banner is the same three seconds every spin otherwise, and the
 * library ships enough motion that a meeting need not see the same one twice.
 *
 * `look` names the material, leaving the motion rolled: two landings on the same
 * wedge are the same metal and never the same three seconds of it. An id the
 * library does not carry rolls the material too — falling back beats drawing
 * nothing for the sake of a typo.
 */
export function rollStyle(rng: Rng, look?: string): BannerStyle {
  return {
    enter: pick(ENTERS, rng),
    active: pick(ACTIVES, rng),
    exit: pick(EXITS, rng),
    look: named(look) ?? pick(LOOK_NAMES, rng),
  }
}
