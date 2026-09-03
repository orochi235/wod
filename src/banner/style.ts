import {
  ACTIVE_NAMES,
  type ActiveName,
  ENTER_NAMES,
  EXIT_NAMES,
  type EnterName,
  type ExitName,
  LIGHTING_NAMES,
  LOOK_NAMES,
  type LightingName,
  type LookName,
} from 'klieg'
import type { Rng } from '../wheel/selection'

export type BannerStyle = {
  enter: EnterName
  active: ActiveName
  exit: ExitName
  look: LookName
  lighting: LightingName
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

/**
 * Picks from the list with the last name removed, so avoiding it is a guarantee
 * rather than a retry that a periodic rng can fail to escape. Falls back to the
 * whole list where that leaves nothing — a slot the library ships one of has no
 * other name to offer.
 */
const differentFrom = <T>(from: readonly T[], rng: Rng, last: T | undefined): T => {
  const others = from.filter((name) => name !== last)
  return pick(others.length > 0 ? others : from, rng)
}

/** The one place that knows the library's names, so it is where an id is judged. */
const named = (look: string | undefined): LookName | null =>
  LOOK_NAMES.find((name) => name === look) ?? null

/**
 * How one winner arrives, holds, and leaves. Rolled per landing rather than
 * fixed: the banner is the same three seconds every spin otherwise, and the
 * library ships enough motion that a meeting need not see the same one twice.
 * `previous` is what the last landing wore, and no slot repeats it — a
 * memoryless pick lands on the same name about one landing in five, which reads
 * as a stall rather than a roll.
 *
 * `look` names the material, leaving the motion and the lighting rolled: two
 * landings on the same wedge are the same metal and never the same three seconds
 * of it. An id the library does not carry rolls the material too — falling back
 * beats drawing nothing for the sake of a typo.
 */
export function rollStyle(rng: Rng, look?: string, previous?: BannerStyle): BannerStyle {
  return {
    enter: differentFrom(ENTERS, rng, previous?.enter),
    active: differentFrom(ACTIVES, rng, previous?.active),
    exit: differentFrom(EXITS, rng, previous?.exit),
    look: named(look) ?? pick(LOOK_NAMES, rng),
    lighting: differentFrom(LIGHTING_NAMES, rng, previous?.lighting),
  }
}
