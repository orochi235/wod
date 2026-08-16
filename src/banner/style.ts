import {
  ACTIVE_NAMES,
  type ActiveName,
  ENTER_NAMES,
  EXIT_NAMES,
  type EnterName,
  type ExitName,
  LOOK_NAMES,
  type LookName,
} from 'blitsklieg'
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

/**
 * How one winner arrives, holds, and leaves. Rolled per landing rather than
 * fixed: the banner is the same three seconds every spin otherwise, and the
 * library ships enough motion that a meeting need not see the same one twice.
 */
export function rollStyle(rng: Rng): BannerStyle {
  return {
    enter: pick(ENTERS, rng),
    active: pick(ACTIVES, rng),
    exit: pick(EXITS, rng),
    look: pick(LOOK_NAMES, rng),
  }
}
