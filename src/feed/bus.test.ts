import { describe, expect, it, vi } from 'vitest'
import { publishFeed, requestFeeds, subscribeFeed, subscribeFeedRequests } from './bus'

/**
 * BroadcastChannel delivers on a later turn of the event loop — usually the
 * very next one, but not reliably under load, which flaked this file at
 * roughly one run in twelve. Waiting for the delivery is what the tests below
 * actually mean.
 *
 * The tests asserting something is *not* delivered still wait a fixed turn:
 * absence cannot be polled for, so they give the message its chance and then
 * check it never came.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('feed bus', () => {
  it('delivers a published roster to a subscriber', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })

    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] }),
    )
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
    expect(seen).toHaveBeenCalledWith({ feedId: 'sim', items: [{ id: 'ok', label: 'OK' }] })
    stop()
  })

  it('keeps a message from a newer sender that carries fields it does not know', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({
      feedId: 'sim',
      items: [{ id: 'ana', label: 'Ana', avatar: '…' }],
      version: 2,
    } as never)

    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] }),
    )
    stop()
  })

  it('drops a message whose feedId is __proto__', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({ feedId: '__proto__', items: [] } as never)
    await flush()

    expect(seen).not.toHaveBeenCalled()
    stop()
  })

  it('carries a request to whoever answers them', async () => {
    const asked = vi.fn()
    const stop = subscribeFeedRequests(asked)

    requestFeeds()

    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1))
    stop()
  })

  it('keeps requests off the roster subscribers', async () => {
    // A window that hears its own arrival announcement as a roster would
    // compose an empty wheel from it.
    const seen = vi.fn()
    const asked = vi.fn()
    const stopSeen = subscribeFeed(seen)
    const stopAsked = subscribeFeedRequests(asked)

    requestFeeds()
    publishFeed({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })

    // One each, never one reader taking both: the counts are the assertion.
    await vi.waitFor(() => {
      expect(seen).toHaveBeenCalledTimes(1)
      expect(asked).toHaveBeenCalledTimes(1)
    })
    stopSeen()
    stopAsked()
  })

  it('stops delivering requests after unsubscribe', async () => {
    const asked = vi.fn()
    subscribeFeedRequests(asked)()

    requestFeeds()
    await flush()

    expect(asked).not.toHaveBeenCalled()
  })

  it('leaves one subscriber receiving after another unsubscribes', async () => {
    const seenA = vi.fn()
    const seenB = vi.fn()
    const stopA = subscribeFeed(seenA)
    const stopB = subscribeFeed(seenB)

    stopA()
    publishFeed({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })

    await vi.waitFor(() =>
      expect(seenB).toHaveBeenCalledWith({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] }),
    )
    // Checked after B's delivery, which is the same turn A's would have
    // arrived on had unsubscribing not worked.
    expect(seenA).not.toHaveBeenCalled()
    stopB()
  })
})
