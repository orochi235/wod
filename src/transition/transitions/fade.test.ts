import { describe, expect, it } from 'vitest'
import type { TransitionContext } from '../types'
import { fade } from './fade'

const ctx = (patch: Partial<TransitionContext> = {}): TransitionContext => ({
  index: 0,
  count: 5,
  angle: 0,
  durationMs: 400,
  moment: 'enter',
  ...patch,
})

describe('fade', () => {
  it('runs opacity from nothing to full', () => {
    expect(fade.frames(fade.defaults, ctx()).keyframes).toEqual([
      { at: 0, opacity: 0 },
      { at: 1, opacity: 1 },
    ])
  })

  it('staggers by position, so the first wedge waits for nothing', () => {
    expect(fade.frames({ staggerMs: 50 }, ctx({ index: 0 })).delayMs).toBe(0)
    expect(fade.frames({ staggerMs: 50 }, ctx({ index: 3 })).delayMs).toBe(150)
  })

  // Params arrive from localStorage and may be anything at all.
  it('falls back rather than emitting NaN', () => {
    expect(fade.frames({ staggerMs: 'soon' }, ctx({ index: 2 })).delayMs).toBe(80)
  })

  it('touches no geometry property', () => {
    for (const frame of fade.frames(fade.defaults, ctx()).keyframes) {
      expect(frame.offset).toBeUndefined()
      expect(frame.scale).toBeUndefined()
    }
  })

  it('serves both membership moments', () => {
    expect(fade.moments).toEqual(['enter', 'exit'])
  })

  it('fades out at exit', () => {
    const { keyframes } = fade.frames({}, ctx({ moment: 'exit' }))
    expect(keyframes[0].opacity).toBe(1)
    expect(keyframes[keyframes.length - 1].opacity).toBe(0)
  })
})
