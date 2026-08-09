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
  // No spin is in flight, so a badge is a static preview rather than a draw.
  // Both uses below must agree, or `writes()` would describe a composition
  // other than the one it was handed.
  const roll = 0
  const resolved = resolveTricks(base, tricks, durationMs, roll)
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
      roll,
      // Conflicts are computed before any spin, so there is no winner to declare
      // a claim on. A swap can only badge the wedge it was pointed at.
      winnerId: null,
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
