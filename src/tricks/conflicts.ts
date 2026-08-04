import type { Composition } from '../compose/types'
import { getRecipe } from './registry'
import { resolveTricks } from './resolve'
import type { Trick, Write } from './types'

export type Conflict = Write & { trickIds: string[] }

/**
 * Editor-facing only. `resolveTricks` never consults this, so a wrong `writes()`
 * can produce a misleading badge but can never change what the wheel does.
 */
export function findConflicts(base: Composition, tricks: Trick[], durationMs: number): Conflict[] {
  const resolved = resolveTricks(base, tricks, durationMs)
  // Keyed by segment, then by property. Nesting two maps avoids building a
  // composite string key, which would break on any id containing the separator.
  const claims = new Map<string, Map<Write['property'], string[]>>()

  for (const trick of tricks) {
    if (!trick.enabled) continue
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    const ctx = {
      trickId: trick.id,
      segments: resolved.segments,
      origins: resolved.origins,
      durationMs,
      roll: 0,
    }
    for (const write of recipe.writes(trick.params, ctx)) {
      let byProperty = claims.get(write.segmentId)
      if (!byProperty) {
        byProperty = new Map()
        claims.set(write.segmentId, byProperty)
      }
      const owners = byProperty.get(write.property)
      if (owners) owners.push(trick.id)
      else byProperty.set(write.property, [trick.id])
    }
  }

  const conflicts: Conflict[] = []
  for (const [segmentId, byProperty] of claims) {
    for (const [property, trickIds] of byProperty) {
      if (trickIds.length < 2) continue
      conflicts.push({ segmentId, property, trickIds })
    }
  }
  return conflicts
}
