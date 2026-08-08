import type { FeedConfig, FeedItem, ItemOverride } from '../feed/types'
import type { Segment } from '../wheel/types'
import type { Composition, Origin, WedgeIndex } from './types'

export type ComposeInput = {
  statics: Segment[]
  feeds: FeedConfig[]
  /** Latest items per feed id. A feed with nothing published contributes nothing. */
  items: Record<string, FeedItem[]>
  overrides: Record<string, ItemOverride>
}

export function wedgeId(feedId: string, itemId: string): string {
  return `${feedId}:${itemId}`
}

/** Membership over a wheel that already exists. */
export function wedgeIndexOf(segments: Segment[]): WedgeIndex {
  const ids = new Set(segments.map((segment) => segment.id))
  return { has: (id) => ids.has(id) }
}

/**
 * Whether some configured feed could produce this id, judged from the id alone.
 *
 * The only question a parser can answer about a roster wedge: items arrive on
 * the bus long after the preset is read, so `sim:fay` names nothing yet and
 * names something the moment Fay joins. Mirrors `wedgeId` — the prefix test and
 * the format it tests have to change together.
 */
export function inFeedNamespace(feeds: FeedConfig[], id: string): boolean {
  return feeds.some((feed) => id.startsWith(`${feed.id}:`))
}

/** Matches readSegments: anything not a usable number is zero, never NaN on the wheel. */
function safeWeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function toSegment(feed: FeedConfig, item: FeedItem, override: ItemOverride | undefined): Segment {
  const segment: Segment = {
    id: wedgeId(feed.id, item.id),
    label: override?.label ?? item.label,
    weight: safeWeight(override?.weight ?? feed.defaults.weight),
  }
  const color = override?.color ?? feed.defaults.color
  if (color !== undefined) segment.color = color
  if (override?.media !== undefined) segment.media = override.media
  if (override?.reveal !== undefined) segment.reveal = override.reveal
  return segment
}

/**
 * Merges statics and feed items into the flat list the wheel takes, plus a
 * derived origin per wedge. Computed wedges are appended later by resolveTricks.
 *
 * Statics claim their ids first, so a feed can never displace an authored wedge.
 * A repeated id would make the pointer and the announced winner disagree, which
 * is the same rule readSegments enforces on stored data.
 */
export function composeBase(input: ComposeInput): Composition {
  const origins = new Map<string, Origin>()
  const statics: Segment[] = []
  for (const segment of input.statics) {
    if (origins.has(segment.id)) continue
    statics.push(segment)
    origins.set(segment.id, { kind: 'static' })
  }

  const staticIds = new Set(statics.map((segment) => segment.id))
  const anchored = new Map<string, Segment[]>()
  const appended: Segment[] = []

  for (const feed of input.feeds) {
    const block: Segment[] = []
    const published = input.items[feed.id]
    // Same hazard getRecipe guards: a feed id of 'constructor' or '__proto__'
    // resolves through the prototype chain, so ?? never fires and the loop
    // throws. Array.isArray also absorbs a malformed value off the wire.
    for (const item of Array.isArray(published) ? published : []) {
      const override = Object.hasOwn(input.overrides, item.id)
        ? input.overrides[item.id]
        : undefined
      if (override?.excluded) continue
      const id = wedgeId(feed.id, item.id)
      if (origins.has(id)) continue
      block.push(toSegment(feed, item, override))
      origins.set(id, { kind: 'external', feedId: feed.id, itemId: item.id })
    }

    // An anchor naming a segment that is not there degrades to appending rather
    // than dropping the block: a missing wedge must never cost you the roster.
    if (feed.insertAfter !== undefined && staticIds.has(feed.insertAfter)) {
      const existing = anchored.get(feed.insertAfter)
      if (existing) existing.push(...block)
      else anchored.set(feed.insertAfter, block)
    } else {
      appended.push(...block)
    }
  }

  const segments: Segment[] = []
  for (const segment of statics) {
    segments.push(segment)
    const block = anchored.get(segment.id)
    if (block) segments.push(...block)
  }
  segments.push(...appended)

  return { segments, origins }
}
