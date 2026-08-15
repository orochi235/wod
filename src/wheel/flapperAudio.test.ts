import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClicker } from './flapperAudio'

function stubAudio() {
  const gain = {
    gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  const osc = {
    frequency: { value: 0, setValueAtTime: vi.fn() },
    type: '',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => osc),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ctx),
  )
  return { ctx, osc, gain }
}

describe('createClicker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes no sound before a gesture has unlocked audio', () => {
    const { ctx } = stubAudio()
    const clicker = createClicker()
    clicker.click(2, 0.5)
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })

  it('clicks once unlocked', () => {
    const { ctx } = stubAudio()
    const clicker = createClicker()
    clicker.unlock()
    clicker.click(2, 0.5)
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('makes no sound while muted', () => {
    const { ctx } = stubAudio()
    const clicker = createClicker()
    clicker.unlock()
    clicker.setMuted(true)
    clicker.click(3, 0.5)
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })

  it('does nothing at all where there is no audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    const clicker = createClicker()
    clicker.unlock()
    expect(() => clicker.click(1, 0.5)).not.toThrow()
  })

  it('refuses to fire a click per peg for an implausible step', () => {
    // A backgrounded tab hands back one enormous frame; a hundred clicks in one
    // frame is a noise burst, not a wheel.
    const { ctx } = stubAudio()
    const clicker = createClicker()
    clicker.unlock()
    clicker.click(500, 0.5)
    expect(ctx.createOscillator.mock.calls.length).toBeLessThanOrEqual(8)
  })
})
