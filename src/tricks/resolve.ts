import type { Composition, Origin } from '../compose/types'
import { EMPTY_COLOR_STATE, assignColors } from '../wheel/colors'
import type { ColorState } from '../wheel/colors'
import type { Morph, Segment } from '../wheel/types'
import { getRecipe } from './registry'
import type { Trick } from './types'

export type ResolvedTricks = Composition & {
  morphs: Morph[]
  colors: Map<string, string>
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
  winnerId: string | null = null,
  colorState: ColorState = EMPTY_COLOR_STATE,
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

  // Between the passes on purpose: pass 1 has appended every wedge a trick
  // invents, and pass 2 is the first thing that reads a color.
  const { segments: colored, colors } = assignColors(segments, origins, colorState)

  // Pass 2: resolve.
  const morphs: Morph[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    morphs.push(
      ...recipe.resolve(trick.params, {
        trickId: trick.id,
        segments: colored,
        origins,
        durationMs,
        roll,
        winnerId,
      }),
    )
  }

  return { segments: colored, origins, morphs, colors }
}

/**
 * Which trick, if any, owns a given segment. Derived, never stored.
 *
 * Every rule `resolveTricks` applies in pass 1 has to hold here too, or the
 * editor draws a ghost row for a wedge the wheel does not have: disabled tricks
 * contribute nothing, an id the base already owns is not the trick's to claim,
 * and between two tricks reaching for the same id the first one wins.
 */
export function wedgeOwners(base: Composition, tricks: Trick[]): Map<string, Trick> {
  const owners = new Map<string, Trick>()
  for (const trick of tricks) {
    if (!trick.enabled) continue
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    for (const segment of recipe.provides(trick.params, trick.id)) {
      if (base.origins.has(segment.id) || owners.has(segment.id)) continue
      owners.set(segment.id, trick)
    }
  }
  return owners
}
