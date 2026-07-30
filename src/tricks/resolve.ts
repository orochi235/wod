import type { Morph, Segment } from '../wheel/types'
import { getRecipe } from './registry'
import type { Trick } from './types'

export type ResolvedTricks = {
  segments: Segment[]
  morphs: Morph[]
}

/**
 * Two passes, and the order between them is load-bearing: every provided wedge
 * must exist before any recipe resolves, or a recipe targeting "everything"
 * would miss a wedge contributed by a trick listed after it.
 *
 * Composition is last-write-wins in trick-list order. `applyMorphs` walks the
 * morph array in sequence, and a morph carrying an explicit `at: 0` keyframe
 * overwrites whatever an earlier morph accumulated.
 */
export function resolveTricks(
  segments: Segment[],
  tricks: Trick[],
  durationMs: number,
): ResolvedTricks {
  const active = tricks.filter((trick) => trick.enabled && getRecipe(trick.recipe) !== null)

  // Pass 1: provide.
  const provided: Segment[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (recipe) provided.push(...recipe.provides(trick.params, trick.id))
  }
  const all = [...segments, ...provided]

  // Pass 2: resolve.
  const morphs: Morph[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    morphs.push(...recipe.resolve(trick.params, { trickId: trick.id, segments: all, durationMs }))
  }

  return { segments: all, morphs }
}

/** Which trick, if any, owns a given segment. Derived, never stored. */
export function wedgeOwners(tricks: Trick[]): Map<string, Trick> {
  const owners = new Map<string, Trick>()
  for (const trick of tricks) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    for (const segment of recipe.provides(trick.params, trick.id)) {
      owners.set(segment.id, trick)
    }
  }
  return owners
}
