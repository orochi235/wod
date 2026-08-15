import type { SliceInstance } from '../slice/types'
import type { Media, Reveal } from '../wheel/types'

/** One item from an external feed. The feed owns identity and label; nothing else. */
export type FeedItem = { id: string; label: string }

export type Unsubscribe = () => void

/**
 * Inactive. Nothing implements this and nothing imports it.
 *
 * It was held open for the Meet adapter, which does not implement it either:
 * the clock lives in the editor and the transport on the bus, so a `subscribe`
 * would be called once by a `useEffect` that already handles its own teardown,
 * and a token that expires mid-meeting cannot reach a closure made at
 * subscribe time.
 */
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

export type MeetFeedConfig = FeedConfigBase & {
  kind: 'meet'
  /** Blank means the sole conference in progress. A pin is a conferenceRecords id. */
  conference: string
  intervalMs: number
}

export type FeedConfig = SimulatedFeedConfig | MeetFeedConfig

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
  slice?: SliceInstance
}
