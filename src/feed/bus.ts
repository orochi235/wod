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
  // Same guard as readFeeds (storage.ts), and not because today's consumer
  // would break without it: App keys its live-items record with a computed key
  // in an object literal, which defines an own property, so a '__proto__' feed
  // id would land there as an ordinary entry. It is bracket assignment
  // (`record[feedId] = items`) that invokes the prototype setter instead — a
  // detail of how some future consumer happens to build that record, which is
  // nothing this module can see. A boundary that only holds for one
  // construction style is not a boundary, and the Meet adapter will be a
  // second writer arriving through here.
  if (raw.feedId === '__proto__') return null

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

/**
 * Asked by a window that needs a roster it was not open to hear. The editor
 * publishes on change, so a show window reloaded mid-meeting starts with
 * statics only — and stays there for as long as nothing changes, which with
 * autochurn off is forever.
 *
 * Deliberately carries no feedId. The asker has a preset but no way to know
 * which feeds anyone is publishing, and an answer it did not ask for costs it
 * nothing: `composeBase` reads the feeds its own preset names and ignores the
 * rest.
 */
export function requestFeeds(): void {
  channel()?.postMessage({ request: true })
}

function listen(handle: (data: unknown) => void): () => void {
  let listener: BroadcastChannel
  // Its own channel, never the publisher's: BroadcastChannel excludes the
  // sending object, so a window that shared one would never hear itself.
  try {
    listener = new BroadcastChannel(FEED_CHANNEL)
  } catch {
    return () => {}
  }
  const handler = (event: MessageEvent) => handle(event.data)
  listener.addEventListener('message', handler)
  return () => {
    listener.removeEventListener('message', handler)
    listener.close()
  }
}

export function subscribeFeed(onMessage: (message: FeedMessage) => void): () => void {
  return listen((data) => {
    const message = readMessage(data)
    if (message) onMessage(message)
  })
}

/**
 * For the publisher. Every reader screens the traffic it cares about, so a
 * request never reaches a roster subscriber and a roster never wakes one of
 * these — the two message shapes share a channel, not a meaning.
 */
export function subscribeFeedRequests(onRequest: () => void): () => void {
  return listen((data) => {
    if (typeof data === 'object' && data !== null && (data as Record<string, unknown>).request) {
      onRequest()
    }
  })
}
