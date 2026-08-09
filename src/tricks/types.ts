import type { Origin, WedgeIndex } from '../compose/types'
import type { EasingName, Morph, Segment } from '../wheel/types'

export type RecipeId = 'takeover' | 'vanish' | 'recolor' | 'relabel'

export type TrickParams = Record<string, unknown>

export type Write = {
  segmentId: string
  property: 'weight' | 'color' | 'label' | 'media'
}

/** Declarative form spec. The editor renders these; recipes never import React. */
export type RecipeField =
  | { key: string; label: string; kind: 'slider'; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'number'; min?: number; max?: number }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'text' }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  /** Multi-select over the current segment list, resolved at render time. */
  | { key: string; label: string; kind: 'segments' }
  /**
   * One wedge, written as a bare id. Distinct from 'segments' because a recipe
   * that reads its value with `readString` cannot be handed an array, and
   * distinct from 'select' because the choices are the live wheel, not a fixed
   * list. Carries no selector tokens: the set-valued ones have no single-id
   * meaning, and '@randomExternal' would need the resolver and the frozen roll
   * plumbed through `provides`, which is a feature rather than this fix.
   */
  | { key: string; label: string; kind: 'segment' }

/** All segments including provided wedges, plus what a recipe needs to resolve. */
export type RecipeContext = {
  trickId: string
  segments: Segment[]
  origins: Map<string, Origin>
  durationMs: number
  /**
   * The resolution's frozen roll. Selectors draw from it rather than from a
   * fresh random, so re-evaluating at a deeper branch level cannot silently
   * reshuffle what an unrelated trick picked.
   */
  roll: number
  /** Null everywhere the winner is not yet known, which is most places. */
  winnerId: string | null
}

export type Recipe = {
  id: RecipeId
  /** Structural. "One wedge swallows the wheel", never "free beer". */
  name: string
  description: string
  defaults: TrickParams
  fields: RecipeField[]
  /** Weight-0 segments this recipe contributes. Usually empty. */
  provides(params: TrickParams, trickId: string): Segment[]
  /** Pure. The only thing that affects what actually runs. */
  resolve(params: TrickParams, ctx: RecipeContext): Morph[]
  /** Editor-facing only. Never consulted during resolution. */
  writes(params: TrickParams, ctx: RecipeContext): Write[]
  /**
   * Human-readable reason this trick cannot run, or null when it can.
   *
   * Takes membership, not a wedge list: the parser calls this before any
   * roster exists, so "is this id real" is a question only its caller can
   * answer. A recipe that walked a `Segment[]` itself would be deciding that
   * a wedge no feed has published yet does not exist.
   */
  validate(params: TrickParams, wedges: WedgeIndex): string | null
}

export type Trick = {
  id: string
  /** The operator's free text, e.g. 'slow burn'. */
  name: string
  recipe: RecipeId
  params: TrickParams
  enabled: boolean
}

export type { EasingName }
