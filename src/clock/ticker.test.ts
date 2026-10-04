import { describe, expect, it, vi } from 'vitest'
import { createTicker } from './ticker'

function harness(live = false) {
  let t = 0
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  const mix = { sync: vi.fn(), live }
  const ticker = createTicker([mix], {
    now: () => t,
    raf: (cb) => {
      frames.set(++id, cb)
      return id
    },
    caf: (i) => frames.delete(i),
  })
  const step = (to: number) => {
    t = to
    const due = [...frames.values()]
    frames.clear()
    for (const cb of due) cb(to)
  }
  return { mix, ticker, step, waiting: () => frames.size }
}

describe('createTicker', () => {
  it('runs no frame until woken', () => {
    const { mix, step } = harness()
    step(16)
    expect(mix.sync).not.toHaveBeenCalled()
  })

  it('syncs every mix with the time, then tells subscribers', () => {
    const { mix, ticker, step } = harness()
    const order: string[] = []
    mix.sync.mockImplementation(() => order.push('sync'))
    ticker.subscribe((t) => order.push(`frame ${t}`))
    ticker.wake()
    step(16)
    expect(mix.sync).toHaveBeenCalledWith(16)
    expect(order).toEqual(['sync', 'frame 16'])
  })

  it('keeps going while a mix is live, and sleeps once none is', () => {
    const { mix, ticker, step, waiting } = harness(true)
    ticker.wake()
    step(16)
    expect(waiting()).toBe(1)
    mix.live = false
    step(32)
    expect(waiting()).toBe(0)
  })

  it('keeps going while held, whatever the mixes say', () => {
    const { ticker, step, waiting } = harness(false)
    const release = ticker.stay()
    step(16)
    step(32)
    expect(waiting()).toBe(1)
    release()
    release()
    step(48)
    expect(waiting()).toBe(0)
  })

  it('asks for one frame however often it is woken', () => {
    const { ticker, waiting } = harness()
    ticker.wake()
    ticker.wake()
    expect(waiting()).toBe(1)
  })

  it('stops telling a subscriber that left', () => {
    const { ticker, step } = harness()
    const fn = vi.fn()
    const off = ticker.subscribe(fn)
    off()
    ticker.wake()
    step(16)
    expect(fn).not.toHaveBeenCalled()
  })
})
