import { type Motion, createMotion } from './motion'

/** A motion on a clock that moves only when the test steps it. */
export function fakeMotion() {
  let t = 0
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const motion: Motion = createMotion({
    now: () => t,
    raf: (callback) => {
      frames.set(++id, callback)
      return id
    },
    caf: (i) => frames.delete(i),
  })
  return {
    motion,
    /** Moves the clock to `to` and runs the frame waiting, if there is one. */
    step(to: number) {
      t = to
      const due = [...frames.values()]
      frames.clear()
      for (const callback of due) callback(to)
    },
    waiting: () => frames.size > 0,
  }
}
