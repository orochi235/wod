export type Syncable = { sync(timestamp: number): void; readonly live: boolean }
export type Frame = (t: number) => void
export type TickerTiming = {
  now?: () => number
  raf?: (callback: FrameRequestCallback) => number
  caf?: (id: number) => void
}
export type Ticker = {
  now(): number
  subscribe(fn: Frame): () => void
  /** Keeps frames coming, live mixes or not, until the returned release is called. */
  stay(): () => void
  wake(): void
}

// The rotor's WAAPI animation runs on the document timeline; the mixes must read the same clock.
const timelineNow = () =>
  (globalThis.document?.timeline?.currentTime as number | null | undefined) ?? performance.now()

/** The app's one animation loop. Runs while any mix is live or anyone holds it; sleeps otherwise. */
export function createTicker(mixes: readonly Syncable[], timing: TickerTiming = {}): Ticker {
  const now = timing.now ?? timelineNow
  const raf = timing.raf ?? ((callback) => requestAnimationFrame(callback))
  const subscribers = new Set<Frame>()
  let holds = 0
  let pending: number | null = null

  const schedule = () => {
    if (pending === null) pending = raf(frame)
  }
  function frame() {
    pending = null
    try {
      const t = now()
      for (const mix of mixes) mix.sync(t)
      for (const fn of [...subscribers]) fn(t)
    } finally {
      if (holds > 0 || mixes.some((mix) => mix.live)) schedule()
    }
  }

  return {
    now,
    subscribe(fn) {
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
    stay() {
      holds++
      schedule()
      let released = false
      return () => {
        if (released) return
        released = true
        holds--
      }
    },
    wake: schedule,
  }
}
