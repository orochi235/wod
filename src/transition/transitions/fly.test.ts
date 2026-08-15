import { describe, expect, it } from 'vitest'
import type { TransitionContext } from '../types'
import { fly } from './fly'

const ctx = (patch: Partial<TransitionContext> = {}): TransitionContext => ({
  index: 0,
  count: 5,
  angle: 90,
  durationMs: 500,
  moment: 'enter',
  ...patch,
})

describe('fly', () => {
  it('arrives from outside and lands at rest', () => {
    const [first, last] = fly.frames({ distance: 1.6 }, ctx()).keyframes
    expect(first.offset).toBe(1.6)
    expect(first.opacity).toBe(0)
    expect(last.offset).toBe(0)
    expect(last.opacity).toBe(1)
  })

  // The default direction is the wedge's own side, which the emitter supplies.
  it('leaves the direction alone when flying in from its own side', () => {
    for (const frame of fly.frames({ from: 'side' }, ctx()).keyframes) {
      expect(frame.offsetAngle).toBeUndefined()
    }
  })

  it('flies in from twelve o clock when told to', () => {
    expect(fly.frames({ from: 'top' }, ctx()).keyframes[0].offsetAngle).toBe(0)
  })

  // Same index, same direction, every run: a re-render must not reshuffle it.
  it('is stable for a random direction', () => {
    const once = fly.frames({ from: 'random' }, ctx({ index: 4 })).keyframes[0].offsetAngle
    const twice = fly.frames({ from: 'random' }, ctx({ index: 4 })).keyframes[0].offsetAngle
    expect(once).toBe(twice)
    expect(fly.frames({ from: 'random' }, ctx({ index: 5 })).keyframes[0].offsetAngle).not.toBe(
      once,
    )
  })

  it('deals out of the hub on a negative distance', () => {
    expect(fly.frames({ distance: -0.1 }, ctx()).keyframes[0].offset).toBe(-0.1)
  })

  it('tumbles only on the way in', () => {
    const frames = fly.frames({ tumbleDeg: 360 }, ctx()).keyframes
    expect(frames[0].rotate).toBe(360)
    expect(frames[frames.length - 1].rotate).toBe(0)
  })

  it('staggers by position, like every wedge-scope transition', () => {
    expect(fly.frames({ staggerMs: 30 }, ctx({ index: 0 })).delayMs).toBe(0)
    expect(fly.frames({ staggerMs: 30 }, ctx({ index: 4 })).delayMs).toBe(120)
  })

  it('treats an unrecognized direction as its own side', () => {
    for (const from of ['diagonal', 7, null]) {
      expect(fly.frames({ from }, ctx()).keyframes[0].offsetAngle).toBeUndefined()
    }
  })

  it('falls back rather than emitting NaN', () => {
    const [first] = fly.frames({ distance: 'far', tumbleDeg: {} }, ctx()).keyframes
    expect(first.offset).toBe(1.6)
    expect(first.rotate).toBe(0)
  })

  it('flies out at exit, ending away from the hub', () => {
    const { keyframes } = fly.frames({ distance: 2 }, ctx({ moment: 'exit' }))
    const last = keyframes[keyframes.length - 1]
    expect(last.offset).toBe(2)
    expect(last.opacity).toBe(0)
  })

  it('keeps tumbling the same direction across arrival and departure', () => {
    const entering = fly.frames({ tumbleDeg: 180 }, ctx({ moment: 'enter' })).keyframes
    const exiting = fly.frames({ tumbleDeg: 180 }, ctx({ moment: 'exit' })).keyframes
    expect(entering[0].rotate).toBe(180)
    expect(exiting[exiting.length - 1].rotate).toBe(-180)
  })

  it('puts the direction on the frame that carries the offset', () => {
    const { keyframes } = fly.frames({ from: 'top' }, ctx({ moment: 'exit' }))
    const last = keyframes[keyframes.length - 1]
    expect(last.offsetAngle).toBe(0)
    expect(keyframes[0].offsetAngle).toBeUndefined()
  })
})
