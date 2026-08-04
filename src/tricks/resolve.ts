import type { Composition, Origin } from '../compose/types'
import type { Morph, Segment } from '../wheel/types'
import { getRecipe } from './registry'
import type { Trick } from './types'

export type ResolvedTricks = Composition & {
  morphs: Morph[]
}

/**
 * Two passes, and the order between them is load-bearing: every provided wedge
 * must exist before any recipe resolves, or a recipe targeting "everything"
 * would miss a wedge contributed by a trick listed after it.
 *
 * Morphs are last-write-wins in trick-list order. `applyMorphs` walks the
 * morph array in sequence, and a morph carrying an explicit `at: 0` keyframe
 * overwrites whatever an earlier morph accumulated. Wedges go the other way —
 * first write wins, so a computed wedge can never displace a static one.
 */
export function resolveTricks(
  base: Composition,
  tricks: Trick[],
  durationMs: number,
  roll = 0,
): ResolvedTricks {
  const active = tricks.filter((trick) => trick.enabled && getRecipe(trick.recipe) !== null)

  // Pass 1: provide.
  const segments: Segment[] = [...base.segments]
  const origins = new Map<string, Origin>(base.origins)
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    for (const segment of recipe.provides(trick.params, trick.id)) {
      // Same dedupe rule composeBase applies: one id, one arc.
      if (origins.has(segment.id)) continue
      segments.push(segment)
      origins.set(segment.id, { kind: 'computed', trickId: trick.id })
    }
  }

  // Pass 2: resolve.
  const morphs: Morph[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    morphs.push(
      ...recipe.resolve(trick.params, {
        trickId: trick.id,
        segments,
        origins,
        durationMs,
        roll,
      }),
    )
  }

  return { segments, origins, morphs }
}

/**
 * Which trick, if any, owns a given segment. Derived, never stored.
 *
 * Skips disabled tricks for the same reason `resolveTricks` does: a disabled
 * trick contributes no wedge, so reporting ownership of one would describe a
 * segment that is not on the wheel.
 */
export function wedgeOwners(tricks: Trick[]): Map<string, Trick> {
  const owners = new Map<string, Trick>()
  for (const trick of tricks) {
    if (!trick.enabled) continue
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    for (const segment of recipe.provides(trick.params, trick.id)) {
      owners.set(segment.id, trick)
    }
  }
  return owners
}
