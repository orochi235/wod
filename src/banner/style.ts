import {
  ACTIVE_NAMES,
  type ActiveName,
  EFFECT_NAMES,
  ENTER_NAMES,
  EXIT_NAMES,
  type EffectSpec,
  type EnterName,
  type ExitName,
  LIGHTING_NAMES,
  LOOK_NAMES,
  type LightingSlot,
  type Look,
  type LookName,
  type LookSpec,
  specOf,
  sweep,
  track,
  wantsBloom,
} from 'klieg'
import type { Rng } from '../wheel/selection'

/**
 * The library's three modes plus `raked`, which its composable slots made
 * expressible: a turn slow enough to notice only if you watch, with a
 * pointer-followed tilt under it so the sign still moves where nothing is moused.
 */
export const LIGHTING_SHAPES = [...LIGHTING_NAMES, 'raked'] as const
export type LightingShape = (typeof LIGHTING_SHAPES)[number]

/** One full turn of the environment. The library's own 3.4s reads as a busy sign. */
const RAKE_MS = 14000

export type BannerStyle = {
  enter: EnterName
  active: ActiveName
  exit: ExitName
  /** The wedge's own metal, and so what a repeat is judged against. */
  material: LookName
  /** What klieg extrudes: the material's name, or a spec composed from it. */
  look: Look
  /** Which lighting was rolled, before it was built into a slot. */
  lit: LightingShape
  lighting: LightingSlot
  /** Set only to switch bloom on; absent leaves the material's own answer. */
  bloom?: boolean
  /** Absent draws the word statically, which is most landings. */
  effects?: EffectSpec[]
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
 * Materials wod draws richer than the library ships them. Stock `gem` is clear
 * stone, which over an empty scene reads as a window rather than as cut glass;
 * a thin film across it gives the facets something to catch. The hue rides
 * `attenuationColor` because a clear body takes its color from what light does
 * passing through it, not from `color`.
 */
const COMPOSED: Partial<Record<LookName, LookSpec>> = {
  gem: {
    ...specOf('gem'),
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 700],
    attenuationDistance: 0.9,
    tintTarget: 'attenuationColor',
  },
}

/**
 * `hue` is held out: it walks the word's color away from the wedge's, and the
 * banner exists to announce which wedge won. The other two drive brightness and
 * timing, which nothing else on screen is carrying.
 */
const EFFECTS_PLAYED = EFFECT_NAMES.filter((name) => name !== 'hue')

/** How often a landing is driven at all, and how much of the word it reaches. */
const EFFECT_CHANCE = 0.35
const EFFECT_SHARE = 0.5

/**
 * How often a material that does not ask for bloom gets it anyway. Only `tubing`
 * and `neon` ask, so left alone the page glows about one landing in eight.
 */
const BLOOM_CHANCE = 0.4

/**
 * Built per landing, not per fire. The library's advice is the opposite — a
 * constructed piece carries its own eased angle, so sharing one across two fires
 * carries its state into the second — and that is the point here: the arrival
 * and the exit are one word waiting, and relighting it on the way out would read
 * as a different material leaving than arrived.
 */
const lightingFor = (shape: LightingShape): LightingSlot =>
  shape === 'raked' ? [sweep({ periodMs: RAKE_MS }), track({ yawRange: 0 })] : shape

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
  const material = named(look) ?? pick(LOOK_NAMES, rng)
  const lit = differentFrom(LIGHTING_SHAPES, rng, previous?.lit)
  const enter = differentFrom(ENTERS, rng, previous?.enter)
  const active = differentFrom(ACTIVES, rng, previous?.active)
  const exit = differentFrom(EXITS, rng, previous?.exit)
  // Drawn unconditionally, and every roll before them left where it was. A
  // branch that skips a draw makes the whole sequence depend on it, and which
  // names the other slots can reach then turns on an unrelated coin.
  const bloomRoll = rng()
  const effectRoll = rng()
  const piece = pick(EFFECTS_PLAYED, rng)

  const drawn = COMPOSED[material] ?? material
  return {
    enter,
    active,
    exit,
    material,
    look: drawn,
    lit,
    lighting: lightingFor(lit),
    // Never false: an explicit answer outranks the look's own, and darkening a
    // material whose surface is made of highlights is not a variation.
    bloom: !wantsBloom(undefined, drawn) && bloomRoll < BLOOM_CHANCE ? true : undefined,
    effects:
      effectRoll < EFFECT_CHANCE
        ? [{ piece, target: { kind: 'run', by: 'seed', amount: EFFECT_SHARE } }]
        : undefined,
  }
}
