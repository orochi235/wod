import type { Trick } from '../tricks/types'
import type { Direction, Segment } from '../wheel/types'

export type Target = { kind: 'fair' } | { kind: 'forced'; segmentId: string }

/** Becomes SpinConfig's motion fields at spin time; `turns` → `fullSpins`. */
export type Motion = {
  durationMs: number
  turns: number
  direction: Direction
  /** CSS easing string, handed to the Web Animations API. */
  easing: string
}

/** What an operator authors. Compiled down to SpinConfig at spin time. */
export type ScriptedSpin = { target: Target; motion: Motion }

export type Condition = { kind: 'landsOn'; segmentIds: string[] }

export type SpinModifier = {
  target?: Target
  motion?: Partial<Motion>
  /** Deltas against each trick's own `enabled` flag, which stays the baseline. */
  enableTricks?: string[]
  disableTricks?: string[]
}

export type BranchAction =
  | { kind: 'replace'; spin: ScriptedSpin }
  | { kind: 'modify'; modifier: SpinModifier }

/**
 * A node acts, descends, or both. `do` alone is a leaf; `then` alone is pure
 * routing. Siblings are first-match-wins.
 *
 * Replacements are embedded inline rather than referenced by name, which is
 * what makes the walk a strict descent: depth is bounded by the authored tree,
 * so a cycle cannot be expressed and does not need detecting.
 *
 * A node with neither `do` nor `then` is legal and inert: it matches, does
 * nothing, and the walk settles there. Not an error case to special-case or reject.
 */
export type BranchNode = {
  id: string
  when: Condition
  do?: BranchAction
  then?: BranchNode[]
}

export type Preset = {
  version: 2
  name: string
  segments: Segment[]
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
}
