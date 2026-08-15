import type { Composition, Origin } from '../compose/types'
import type { BranchNode, Motion, ScriptedSpin, SpinModifier, Target } from '../preset/types'
import { resolveTricks } from '../tricks/resolve'
import { resolveTargets } from '../tricks/targets'
import type { Trick } from '../tricks/types'
import { EMPTY_COLOR_STATE } from '../wheel/colors'
import type { ColorState } from '../wheel/colors'
import { landingSegments } from '../wheel/morph'
import type { Rng, SelectionStrategy } from '../wheel/selection'
import { forced, weightedRandom } from '../wheel/selection'
import type { Morph, Segment } from '../wheel/types'

/**
 * Not a cycle guard — branches embed their replacements inline, so the walk is a
 * strict descent and a cycle cannot be authored. This exists for corrupted or
 * hand-edited JSON arriving through import, matching the defensive posture in
 * `storage.ts` and `getRecipe`.
 */
export const MAX_DEPTH = 32

export type Resolution =
  | {
      kind: 'settled'
      winnerId: string
      segments: Segment[]
      morphs: Morph[]
      motion: Motion
      /**
       * Pass 2. Re-resolves with the winner the pointer actually landed on, over
       * the frozen rolls and the enabled set this walk finished with, so nothing
       * but a winner-keyed recipe can differ from the morphs above.
       */
      resolveLate: (winnerId: string) => Morph[]
    }
  | {
      kind: 'exhausted'
      winnerId: string
      depth: number
      segments: Segment[]
      morphs: Morph[]
      motion: Motion
      /**
       * Pass 2. Re-resolves with the winner the pointer actually landed on, over
       * the frozen rolls and the enabled set this walk finished with, so nothing
       * but a winner-keyed recipe can differ from the morphs above.
       */
      resolveLate: (winnerId: string) => Morph[]
    }

function strategyFor(target: Target): SelectionStrategy {
  return target.kind === 'forced' ? forced(target.segmentId) : weightedRandom
}

/**
 * Disable first, then enable, so enable wins an overlap. Nothing forbids a
 * modifier naming the same trick in both lists — rejecting it would need a rule
 * in both the parser and the editor — so it gets a defined answer here instead,
 * a deliberate tie-break rather than whichever loop happens to run last. Pinned
 * by test; the ordering is load-bearing, not incidental.
 */
function mutateEnabledTricks(enabled: Set<string>, modifier: SpinModifier): void {
  for (const id of modifier.disableTricks ?? []) enabled.delete(id)
  for (const id of modifier.enableTricks ?? []) enabled.add(id)
}

function applyModifier(spin: ScriptedSpin, modifier: SpinModifier): ScriptedSpin {
  return {
    target: modifier.target ?? spin.target,
    motion: { ...spin.motion, ...modifier.motion },
  }
}

/** The wheel as it launches (`withWedges`) and as it comes to rest (`landing`). */
type WheelState = {
  withWedges: Segment[]
  origins: Map<string, Origin>
  morphs: Morph[]
  landing: Segment[]
}

function evaluateWheel(
  base: Composition,
  tricks: Trick[],
  enabled: Set<string>,
  spin: ScriptedSpin,
  selectorRoll: number,
  winnerId: string | null = null,
  colorState: ColorState = EMPTY_COLOR_STATE,
): WheelState {
  // `resolveTricks` filters on each trick's own `enabled` flag, which is only the
  // baseline here. Stamping the resolved set onto the copies it receives is what
  // lets `enableTricks` switch on a trick the preset stored as off, without
  // teaching `resolveTricks` that modifiers exist.
  const active = tricks
    .filter((trick) => enabled.has(trick.id))
    .map((trick) => ({ ...trick, enabled: true }))
  const {
    segments: withWedges,
    origins,
    morphs,
  } = resolveTricks(base, active, spin.motion.durationMs, selectorRoll, winnerId, colorState)
  const landing = landingSegments(withWedges, morphs, spin.motion.durationMs)
  return { withWedges, origins, morphs, landing }
}

/**
 * Whether the winner satisfies a node's condition, with selector tokens expanded
 * the same way a recipe's `targets` are — the spec asks for late binding on both,
 * and a condition naming '@external' is the only way to write a rule about a
 * roster whose ids do not exist at authoring time.
 *
 * Expanded against `withWedges`, not `landing`. Both hold the same wedges today
 * — `applyMorphs` rewrites a wedge's weight, never the membership of the list —
 * so this is a choice rather than a difference in outcome, and it is the choice
 * that keeps "did this land on an attendee" independent of whether that
 * attendee's arc happened to collapse on the way down.
 *
 * `selectorRoll`, not `roll`, for the reason spelled out on resolveScriptedSpin:
 * '@randomExternal' and the winner's draw both reduce to floor(roll * n) over
 * the same list, so sharing one would make the token name the winner every time.
 *
 * An empty `segmentIds` cannot arrive here: `readCondition` drops the node, as
 * `storage.test.ts` pins. That matters because `resolveTargets` reads empty as
 * *every* wedge, which would turn such a condition into a match-anything rather
 * than the never-matches it used to be — so a future relaxation there needs an
 * explicit empty check added right here.
 */
function matches(node: BranchNode, winnerId: string, wheel: WheelState, roll: number): boolean {
  return resolveTargets(node.when.segmentIds, {
    segments: wheel.withWedges,
    origins: wheel.origins,
    roll,
  }).some((segment) => segment.id === winnerId)
}

/**
 * Walks the branch tree and compiles a `ScriptedSpin` into everything the wheel
 * needs. Returns null only when there is genuinely nobody to pick — an empty
 * wheel, or every arc collapsed — which is the same condition `planSpin`
 * already returns null for.
 */
export function resolveScriptedSpin(
  base: Composition,
  tricks: Trick[],
  spin: ScriptedSpin,
  branches: BranchNode[],
  rng: Rng,
  colorState: ColorState = EMPTY_COLOR_STATE,
): Resolution | null {
  // Two draws, each frozen for the whole resolution. Re-rolling on each pass
  // would move the winner for reasons unrelated to the operator's modifiers: a
  // node could fire on a draw that no longer exists, and the same preset would
  // resolve differently every run. Freezing means every change in winner is
  // caused by a modifier, which is the only way the tree is readable.
  //
  // They have to be two. Selection and '@randomExternal' both reduce to
  // floor(roll * n) over the same list, so one shared number makes the random
  // attendee *be* the winner on an equal-weight roster. Morphs animate during
  // the spin, so that trick would paint the outcome before the wheel lands —
  // the exact leak that picking the winner up front is meant to prevent.
  const roll = rng()
  const selectorRoll = rng()
  const frozen: Rng = () => roll

  let current = spin
  const enabled = new Set(tricks.filter((trick) => trick.enabled).map((trick) => trick.id))
  let level = branches

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const wheel = evaluateWheel(base, tricks, enabled, current, selectorRoll, null, colorState)
    const { withWedges, morphs, landing } = wheel
    const winnerId = strategyFor(current.target)(landing, frozen)
    if (!winnerId) return null

    // First match wins, so sibling order is authored meaning, not an accident.
    const node = level.find((candidate) => matches(candidate, winnerId, wheel, selectorRoll))
    if (!node) {
      const finalSpin = current
      const finalEnabled = new Set(enabled)
      const resolveLate = (winner: string): Morph[] =>
        evaluateWheel(base, tricks, finalEnabled, finalSpin, selectorRoll, winner, colorState)
          .morphs
      return {
        kind: 'settled',
        winnerId,
        segments: withWedges,
        morphs,
        motion: current.motion,
        resolveLate,
      }
    }

    if (node.do?.kind === 'replace') {
      current = node.do.spin
    } else if (node.do?.kind === 'modify') {
      mutateEnabledTricks(enabled, node.do.modifier)
      current = applyModifier(current, node.do.modifier)
    }
    level = node.then ?? []
  }

  // The cap was reached with a node still matching. Recompute once so the caller
  // sees the wheel as the last applied modifier left it.
  const { withWedges, morphs, landing } = evaluateWheel(
    base,
    tricks,
    enabled,
    current,
    selectorRoll,
    null,
    colorState,
  )
  const winnerId = strategyFor(current.target)(landing, frozen)
  if (!winnerId) return null
  const finalSpin = current
  const finalEnabled = new Set(enabled)
  const resolveLate = (winner: string): Morph[] =>
    evaluateWheel(base, tricks, finalEnabled, finalSpin, selectorRoll, winner, colorState).morphs
  return {
    kind: 'exhausted',
    winnerId,
    depth: MAX_DEPTH,
    segments: withWedges,
    morphs,
    motion: current.motion,
    resolveLate,
  }
}
