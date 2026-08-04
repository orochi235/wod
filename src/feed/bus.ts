import type { FeedItem } from './types'

export const FEED_CHANNEL = 'wod:feed'

export type FeedMessage = { feedId: string; items: FeedItem[] }

/**
 * Feed items ride a channel rather than localStorage on purpose. The parent
 * spec's whole pitch is that attendee names are read by the browser and stay
 * there; writing them to a well-known storage key weakens that for no gain.
 */
let publisher: BroadcastChannel | null = null

function channel(): BroadcastChannel | null {
  if (publisher) return publisher
  try {
    publisher = new BroadcastChannel(FEED_CHANNEL)
  } catch {
    // No BroadcastChannel. The show window simply never learns the roster,
    // which degrades to statics only rather than breaking anything.
    return null
  }
  return publisher
}

function readMessage(value: unknown): FeedMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.feedId !== 'string' || !Array.isArray(raw.items)) return null

  const items: FeedItem[] = []
  for (const entry of raw.items) {
    if (typeof entry !== 'object' || entry === null) return null
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.label !== 'string') return null
    items.push({ id: item.id, label: item.label })
  }
  return { feedId: raw.feedId, items }
}

export function publishFeed(message: FeedMessage): void {
  channel()?.postMessage(message)
}

export function subscribeFeed(onMessage: (message: FeedMessage) => void): () => void {
  let listener: BroadcastChannel
  try {
    listener = new BroadcastChannel(FEED_CHANNEL)
  } catch {
    return () => {}
  }
  const handler = (event: MessageEvent) => {
    const message = readMessage(event.data)
    if (message) onMessage(message)
  }
  listener.addEventListener('message', handler)
  return () => {
    listener.removeEventListener('message', handler)
    listener.close()
  }
}
