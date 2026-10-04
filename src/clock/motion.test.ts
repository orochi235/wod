import { keys } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { WHEEL, type WheelPose } from './motion'
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
    motion.ticker.wake()
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
    motion.ticker.wake()
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
    motion.ticker.wake()
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
      hold: 'after',
    })
    motion.ticker.wake()
    step(50)
    step(100)
    step(116)
    expect(waiting()).toBe(false)
    expect(motion.wheel.probe(WHEEL).blackout).toBe(0.5)
  })
})
