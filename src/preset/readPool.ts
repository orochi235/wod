import type { Segment } from '../wheel/types'
import { readSegments } from './storage'
import type { Affinity, Pool } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A pool with no candidates is no pool. A candidate sharing an id with a static
 * wedge is dropped, for the reason `readSegments` drops a repeated id: the wheel
 * keys its arcs by id.
 */
export function readPool(value: unknown, statics: Segment[]): Pool | undefined {
  if (!isRecord(value)) return undefined
  const taken = new Set(statics.map((segment) => segment.id))
  const segments = readSegments(value.segments).filter((segment) => !taken.has(segment.id))
  if (segments.length === 0) return undefined

  const draw =
    typeof value.draw === 'number' && Number.isFinite(value.draw)
      ? Math.min(segments.length, Math.max(1, Math.round(value.draw)))
      : segments.length

  const known = new Set(segments.map((segment) => segment.id))
  const affinities: Affinity[] = []
  if (Array.isArray(value.affinities)) {
    for (const entry of value.affinities) {
      if (!isRecord(entry) || !Array.isArray(entry.ids)) continue
      const ids = entry.ids.filter((id): id is string => typeof id === 'string' && known.has(id))
      if (ids.length < 2) continue
      const boost =
        typeof entry.boost === 'number' && Number.isFinite(entry.boost) && entry.boost > 0
          ? entry.boost
          : 1
      affinities.push({ ids, boost })
    }
  }
  return { segments, draw, affinities }
}
