import { keys, mix } from '@msb235/blits'
import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { blackoutVoice } from '../outage/voices'
import { manualMotion } from './manual'
import {
  WHEEL,
  type WedgePose,
  type WheelPose,
  createMotion,
  useMotionRoot,
  wedgeKit,
} from './motion'
import { fakeMotion } from './testing'

describe('the wheel mix', () => {
  it('steps dark at its stop, not halfway to it', () => {
    const { motion, step } = fakeMotion()
    motion.wheel.cue({
      patch: keys<string, WheelPose>(1000, [
        { at: 0, delta: { dark: false } },
        { at: 0.3, delta: { dark: true } },
        { at: 0.8, delta: { dark: false } },
      ]),
      subjects: [WHEEL],
      start: 0,
      loop: false,
    })
    const read = (t: number) => {
      step(t)
      return motion.wheel.probe(WHEEL).dark
    }
    expect([read(299), read(300), read(799), read(800)]).toEqual([false, true, true, false])
  })

  it('takes the darker of two blackouts', () => {
    const { motion, step } = fakeMotion()
    for (const level of [0.3, 0.7]) {
      motion.wheel.cue({
        patch: keys<string, WheelPose>(1000, [{ at: 0, delta: { blackout: level } }]),
        subjects: [WHEEL],
        start: 0,
        loop: false,
      })
    }
    step(10)
    expect(motion.wheel.probe(WHEEL).blackout).toBe(0.7)
  })

  it('lets the clock sleep once nothing plays', () => {
    const { motion, step, waiting } = fakeMotion()
    motion.wheel.cue({
      patch: keys<string, WheelPose>(100, [{ at: 0, delta: { blackout: 1 } }]),
      subjects: [WHEEL],
      start: 0,
      loop: false,
    })
    step(50)
    expect(waiting()).toBe(true)
    step(100)
    expect(waiting()).toBe(false)
  })

  it('sleeps under a voice holding its last frame, and still reads that frame', () => {
    const { motion, step, waiting } = fakeMotion()
    motion.wheel.cue({
      patch: keys<string, WheelPose>(100, [
        { at: 0, delta: { blackout: 0 } },
        { at: 1, delta: { blackout: 0.5 } },
      ]),
      subjects: [WHEEL],
      start: 0,
      loop: false,
      freeze: 'after',
    })
    step(50)
    step(100)
    step(116)
    expect(waiting()).toBe(false)
    expect(motion.wheel.probe(WHEEL).blackout).toBe(0.5)
  })
})

describe('the wedge mix', () => {
  it('adds weight deltas from two voices', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    for (const delta of [-2, 3]) {
      wedges.cue({
        patch: keys<string, WedgePose>(1000, [
          { at: 0, delta: { weight: 0 } },
          { at: 1, delta: { weight: delta } },
        ]),
        subjects: ['x'],
        start: 0,
        loop: false,
        freeze: 'after',
      })
    }
    wedges.sync(500)
    expect(wedges.probe('x').weight).toBeCloseTo(0.5, 9)
    wedges.sync(6000)
    expect(wedges.probe('x').weight).toBeCloseTo(1, 9)
  })

  it('steps a label at its stop, the later voice winning', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    for (const [at, label] of [
      [0.3, 'A'],
      [0.8, 'B'],
    ] as const) {
      wedges.cue({
        patch: keys<string, WedgePose>(1000, [
          { at: 0, delta: { label: 'base' } },
          { at, delta: { label } },
        ]),
        subjects: ['x'],
        start: 0,
        loop: false,
        freeze: 'after',
      })
    }
    const read = (t: number) => {
      wedges.sync(t)
      return wedges.probe('x').label
    }
    expect([read(500), read(799), read(800)]).toEqual(['base', 'base', 'B'])
  })

  it('is synced by the ticker with the wheel', () => {
    const { motion, step } = fakeMotion()
    motion.wedges.cue({
      patch: keys<string, WedgePose>(100, [{ at: 0, delta: { weight: 2 } }]),
      subjects: ['x'],
      start: 0,
      loop: false,
    })
    step(50)
    expect(motion.wedges.probe('x').weight).toBe(2)
  })

  it('reads back over a show when made with history', () => {
    const { motion, step } = manualMotion({ historyMs: 10_000 })
    motion.wheel.cue(blackoutVoice(1, 0))
    const release = motion.ticker.hold()
    for (let t = 0; t <= 2000; t += 16) step(t)
    release()
    expect(motion.wheel.project(400).probe(WHEEL).blackout).toBeGreaterThan(0)
  })
})

describe('createMotion', () => {
  it('reads the document timeline the rotor runs on', () => {
    Object.defineProperty(document, 'timeline', {
      value: { currentTime: 1234 },
      configurable: true,
    })
    try {
      expect(createMotion().ticker.now()).toBe(1234)
    } finally {
      Reflect.deleteProperty(document, 'timeline')
    }
  })

  it('wakes on a cue after sleeping', () => {
    const { motion, step, waiting } = fakeMotion()
    step(16)
    expect(waiting()).toBe(false)
    motion.wheel.cue(blackoutVoice(1, 100))
    expect(waiting()).toBe(true)
  })
})

describe('useMotionRoot', () => {
  it('runs again after a StrictMode remount stops it', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let id = 0
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++id, callback)
      return id
    })
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((i) => {
      frames.delete(i)
    })
    try {
      const { result } = renderHook(() => useMotionRoot(), { wrapper: StrictMode })
      const sync = vi.spyOn(result.current.wheel, 'sync')
      for (const callback of [...frames.values()]) callback(16)
      expect(sync).toHaveBeenCalled()
    } finally {
      raf.mockRestore()
      caf.mockRestore()
    }
  })

  it('cancels the waiting frame when its page leaves', () => {
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const { unmount } = renderHook(() => useMotionRoot())
    unmount()
    expect(cancel).toHaveBeenCalledTimes(1)
    cancel.mockRestore()
  })
})
