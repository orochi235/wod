import { describe, expect, it } from 'vitest'
import { shrink } from './shrink'

const ctx = (moment: 'enter' | 'exit') => ({
  index: 0,
  count: 3,
  angle: 90,
  durationMs: 400,
  moment,
})

describe('shrink', () => {
  it('serves both membership moments', () => {
    expect(shrink.moments).toEqual(['enter', 'exit'])
  })

  it('gives up its arc over the whole exit', () => {
    const { keyframes } = shrink.frames({}, ctx('exit'))
    expect(keyframes[0].hold).toBe(1)
    expect(keyframes[keyframes.length - 1].hold).toBe(0)
  })

  it('takes its arc up over the whole entrance', () => {
    const { keyframes } = shrink.frames({}, ctx('enter'))
    expect(keyframes[0].hold).toBe(0)
    expect(keyframes[keyframes.length - 1].hold).toBe(1)
  })

  it('takes its paint up over that same entrance', () => {
    const { keyframes } = shrink.frames({}, ctx('enter'))
    expect(keyframes[0].scale).toBe(0)
    expect(keyframes[0].opacity).toBe(0)
    expect(keyframes[keyframes.length - 1].scale).toBe(1)
    expect(keyframes[keyframes.length - 1].opacity).toBe(1)
  })

  it('scales with the arc so the wedge does not stretch', () => {
    const { keyframes } = shrink.frames({}, ctx('exit'))
    expect(keyframes[keyframes.length - 1].scale).toBe(0)
  })

  it('fades with the arc so the last sliver does not sit at full paint', () => {
    const { keyframes } = shrink.frames({}, ctx('exit'))
    expect(keyframes[0].opacity).toBe(1)
    expect(keyframes[keyframes.length - 1].opacity).toBe(0)
  })

  // The neighbors move with it, and a curve that dumps most of the arc in the
  // first half reads as a lurch in every wedge on the wheel, not just this one.
  it('runs the reflow on a symmetric curve', () => {
    expect(shrink.frames({}, ctx('exit')).easing).toBe('easeInOut')
    expect(shrink.frames({}, ctx('enter')).easing).toBe('easeInOut')
  })

  it('staggers by index', () => {
    expect(shrink.frames({ staggerMs: 30 }, { ...ctx('exit'), index: 2 }).delayMs).toBe(60)
  })

  it('falls back to its default stagger on a malformed param', () => {
    expect(shrink.frames({ staggerMs: 'soon' }, { ...ctx('exit'), index: 1 }).delayMs).toBe(0)
  })
})
