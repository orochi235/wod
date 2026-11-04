import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClicker } from './flapperAudio'
import type { Song } from './melody'

function stubAudio() {
  const gain = {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }
  const osc = {
    frequency: { value: 0, setValueAtTime: vi.fn() },
    type: '',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = []
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => osc),
    createBufferSource: vi.fn(() => {
      const source = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      sources.push(source)
      return source
    }),
  }
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: hands `new` the shared stub
        return ctx
      }
    },
  )
  return { ctx, osc, gain, sources }
}

/** Renders nothing real: the clicker only needs a buffer and the slice times. */
function stubOffline() {
  const param = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      destination = {}
      createOscillator() {
        return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      }
      createGain() {
        return { gain: param, connect: vi.fn() }
      }
      async startRendering() {
        return {}
      }
    },
  )
}

const song: Song = { id: 'scale', name: 'Scale', bpm: 60, notes: 'C4 D4:2 E4' }

/** Lets the song's render settle before the clicker is asked to play it. */
const rendered = () => new Promise((resolve) => setTimeout(resolve, 0))

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

  describe('with a song', () => {
    it('plays the next note on each peg, then wraps', async () => {
      stubOffline()
      const { ctx, sources } = stubAudio()
      const clicker = createClicker()
      clicker.unlock()
      clicker.setSong(song)
      await rendered()
      for (let i = 0; i < 4; i++) clicker.click(1, 0.5)
      expect(ctx.createOscillator).not.toHaveBeenCalled()
      expect(sources.map((source) => source.start.mock.calls[0].slice(1))).toEqual([
        [0, 1],
        [1, 2],
        [3, 1],
        [0, 1],
      ])
    })

    it('cuts the ringing note when the next peg strikes', async () => {
      stubOffline()
      const { sources } = stubAudio()
      const clicker = createClicker()
      clicker.unlock()
      clicker.setSong(song)
      await rendered()
      clicker.click(2, 0.5)
      expect(sources[0].stop).toHaveBeenCalled()
      expect(sources[1].stop).not.toHaveBeenCalled()
    })

    it('starts the tune over after the wheel has been quiet', async () => {
      stubOffline()
      const { ctx, sources } = stubAudio()
      const clicker = createClicker()
      clicker.unlock()
      clicker.setSong(song)
      await rendered()
      clicker.click(2, 0.5)
      ctx.currentTime = 10
      clicker.click(1, 0.5)
      expect(sources[2].start.mock.calls[0][1]).toBe(0)
    })

    it('goes back to the tick when the song is cleared', async () => {
      stubOffline()
      const { ctx } = stubAudio()
      const clicker = createClicker()
      clicker.unlock()
      clicker.setSong(song)
      await rendered()
      clicker.setSong(null)
      clicker.click(1, 0.5)
      expect(ctx.createOscillator).toHaveBeenCalledTimes(1)
      expect(ctx.createBufferSource).not.toHaveBeenCalled()
    })
  })
})
