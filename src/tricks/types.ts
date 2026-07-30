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

/** All segments including provided wedges, plus what a recipe needs to resolve. */
export type RecipeContext = {
  trickId: string
  segments: Segment[]
  durationMs: number
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
  /** Human-readable reason this trick cannot run, or null when it can. */
  validate(params: TrickParams, segments: Segment[]): string | null
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
