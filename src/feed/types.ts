import type { Media, Reveal } from '../wheel/types'

/** One item from an external feed. The feed owns identity and label; nothing else. */
export type FeedItem = { id: string; label: string }

export type Unsubscribe = () => void

export type Feed = {
  id: string
  subscribe(cb: (items: FeedItem[]) => void): Unsubscribe
}

/** Applied to every item a feed produces, unless an override says otherwise. */
export type FeedDefaults = {
  weight: number
  /** Absent means palette-assigned, exactly as for a static segment. */
  color?: string
}

export type FeedConfigBase = {
  id: string
  defaults: FeedDefaults
  /** Static segment id this feed's block follows. Absent means after all statics. */
  insertAfter?: string
}

export type SimulatedFeedConfig = FeedConfigBase & {
  kind: 'simulated'
  /** Names available to join. */
  pool: string[]
  autochurn: { intervalMs: number; targetSize: number; volatility: number }
}

/** A union of one. The second member is the Meet adapter, deliberately not built yet. */
export type FeedConfig = SimulatedFeedConfig

/**
 * Sparse overlay on an external item, keyed by FeedItem.id. An absent field
 * means "use the feed default". Overrides outlive the item they describe, so a
 * joke survives its target leaving the room.
 */
export type ItemOverride = {
  excluded?: boolean
  label?: string
  weight?: number
  color?: string
  media?: Media
  reveal?: Reveal
}
