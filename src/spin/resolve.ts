import type { BranchNode, Motion, ScriptedSpin, SpinModifier, Target } from '../preset/types'
import { resolveTricks } from '../tricks/resolve'
import type { Trick } from '../tricks/types'
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
    }
  | {
      kind: 'exhausted'
      winnerId: string
      depth: number
      segments: Segment[]
      morphs: Morph[]
      motion: Motion
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
  morphs: Morph[]
  landing: Segment[]
}

function evaluateWheel(
  segments: Segment[],
  tricks: Trick[],
  enabled: Set<string>,
  spin: ScriptedSpin,
): WheelState {
  // `resolveTricks` filters on each trick's own `enabled` flag, which is only the
  // baseline here. Stamping the resolved set onto the copies it receives is what
  // lets `enableTricks` switch on a trick the preset stored as off, without
  // teaching `resolveTricks` that modifiers exist.
  const active = tricks
    .filter((trick) => enabled.has(trick.id))
    .map((trick) => ({ ...trick, enabled: true }))
  const { segments: withWedges, morphs } = resolveTricks(segments, active, spin.motion.durationMs)
  const landing = landingSegments(withWedges, morphs, spin.motion.durationMs)
  return { withWedges, morphs, landing }
}

/**
 * Walks the branch tree and compiles a `ScriptedSpin` into everything the wheel
 * needs. Returns null only when there is genuinely nobody to pick — an empty
 * wheel, or every arc collapsed — which is the same condition `planSpin`
 * already returns null for.
 */
export function resolveScriptedSpin(
  segments: Segment[],
  tricks: Trick[],
  spin: ScriptedSpin,
  branches: BranchNode[],
  rng: Rng,
): Resolution | null {
  // One roll for the whole resolution. Re-rolling on each pass would move the
  // winner for reasons unrelated to the operator's modifiers: a node could fire
  // on a draw that no longer exists, and the same preset would resolve
  // differently every run. Freezing it means every change in winner is caused
  // by a modifier, which is the only way the tree is readable.
  const roll = rng()
  const frozen: Rng = () => roll

  let current = spin
  const enabled = new Set(tricks.filter((trick) => trick.enabled).map((trick) => trick.id))
  let level = branches

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const { withWedges, morphs, landing } = evaluateWheel(segments, tricks, enabled, current)
    const winnerId = strategyFor(current.target)(landing, frozen)
    if (!winnerId) return null

    // First match wins, so sibling order is authored meaning, not an accident.
    const node = level.find((candidate) => candidate.when.segmentIds.includes(winnerId))
    if (!node) {
      return { kind: 'settled', winnerId, segments: withWedges, morphs, motion: current.motion }
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
  const { withWedges, morphs, landing } = evaluateWheel(segments, tricks, enabled, current)
  const winnerId = strategyFor(current.target)(landing, frozen)
  if (!winnerId) return null
  return {
    kind: 'exhausted',
    winnerId,
    depth: MAX_DEPTH,
    segments: withWedges,
    morphs,
    motion: current.motion,
  }
}
