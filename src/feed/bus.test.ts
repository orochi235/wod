import { describe, expect, it, vi } from 'vitest'
import { publishFeed, subscribeFeed } from './bus'

/** BroadcastChannel delivers on a later turn of the event loop. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('feed bus', () => {
  it('delivers a published roster to a subscriber', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })
    await flush()

    expect(seen).toHaveBeenCalledWith({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })
    stop()
  })

  it('stops delivering after unsubscribe', async () => {
    const seen = vi.fn()
    subscribeFeed(seen)()

    publishFeed({ feedId: 'sim', items: [] })
    await flush()

    expect(seen).not.toHaveBeenCalled()
  })

  it('drops a malformed message rather than passing it on', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({ feedId: 'sim', items: [{ id: 'ok', label: 'OK' }] })
    // Shapes a hand-crafted or future-version sender could produce.
    publishFeed({ feedId: 7, items: [] } as never)
    publishFeed({ feedId: 'sim', items: [{ id: 'x' }] } as never)
    await flush()

    expect(seen).toHaveBeenCalledTimes(1)
    stop()
  })
})
