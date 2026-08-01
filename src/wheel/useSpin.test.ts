import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { landingSegments } from './morph'
import { forced } from './selection'
import type { Morph, Segment, SpinConfig } from './types'
import { useSpin } from './useSpin'

const DURATION_MS = 4500
const REDUCED_MOTION_MS = 300

const SEGMENTS: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0.02, color: '#ffd166' },
]

/** A sliver that swells to swallow the wheel, exactly as the app rigs it. */
const MORPHS: Morph[] = [
  {
    segmentId: 'beer',
    durationMs: DURATION_MS,
    easing: 'easeIn',
    keyframes: [
      { at: 0, weight: 0.02, color: '#ffd166' },
      { at: 0.6, weight: 0.02, color: '#ffd166' },
      { at: 1, weight: 1, color: '#ff8811' },
    ],
  },
  ...['ana', 'ben'].map<Morph>((id) => ({
    segmentId: id,
    durationMs: DURATION_MS,
    easing: 'easeIn',
    keyframes: [
      { at: 0, weight: 1 },
      { at: 0.6, weight: 1 },
      { at: 1, weight: 0 },
    ],
  })),
]

const MORPHING: SpinConfig = {
  durationMs: DURATION_MS,
  fullSpins: 6,
  direction: 'cw',
  easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
  morphs: MORPHS,
}

const PLAIN: SpinConfig = { ...MORPHING, morphs: [] }

type AnimateCall = {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  /** Settles the animation's `finished` promise, as a real one does when it ends. */
  finish: () => void
}

type Harness = {
  animateCalls: AnimateCall[]
  rafStarts: number
  rafCancels: number
  /** Runs every queued frame callback with `timestamp`; cancelled frames never run. */
  flushFrames: (timestamp: number) => void
  setNow: (ms: number) => void
  setReducedMotion: (reduce: boolean) => void
}

/**
 * Everything this hook touches that jsdom does not implement, or that would
 * otherwise make a test depend on wall-clock time: the Web Animations API, the
 * frame loop, the reduced-motion query, the clock, and the CSPRNG behind
 * winner selection. Every one of them is driven by hand from the test body.
 */
function installHarness(): Harness {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1
  let nowMs = 1000
  let reducedMotion = false

  const harness: Harness = {
    animateCalls: [],
    rafStarts: 0,
    rafCancels: 0,
    flushFrames(timestamp) {
      const due = [...frames.values()]
      frames.clear()
      for (const cb of due) cb(timestamp)
    },
    setNow(ms) {
      nowMs = ms
    },
    setReducedMotion(reduce) {
      reducedMotion = reduce
    },
  }

  const animate = (
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation => {
    let resolveFinished: (animation: Animation) => void = () => undefined
    let rejectFinished: (reason: unknown) => void = () => undefined
    const finished = new Promise<Animation>((resolve, reject) => {
      resolveFinished = resolve
      rejectFinished = reject
    })
    const animation = {
      finished,
      cancel: () => rejectFinished(new Error('animation cancelled')),
    } as unknown as Animation

    harness.animateCalls.push({
      keyframes: (Array.isArray(keyframes) ? keyframes : []) as Keyframe[],
      options: typeof options === 'object' && options !== null ? options : {},
      finish: () => resolveFinished(animation),
    })
    return animation
  }

  Element.prototype.animate = animate as unknown as Element['animate']

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    harness.rafStarts += 1
    const id = nextFrameId++
    frames.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    harness.rafCancels += 1
    frames.delete(id)
  })
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reducedMotion && query.includes('prefers-reduced-motion'),
        media: query,
      }) as unknown as MediaQueryList,
  )

  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  // Pin the draw so the winner and the landing jitter are the same every run.
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    if (array instanceof Uint32Array) array.fill(2 ** 31)
    return array
  })

  return harness
}

function renderSpin(config: SpinConfig, initial: Segment[] = SEGMENTS) {
  const view = renderHook(({ segs }) => useSpin(segs, config), {
    initialProps: { segs: initial },
  })
  // spin() bails without a rotor, so give it a real one.
  view.result.current.rotorRef.current = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  return view
}

const degreesOf = (keyframe: Keyframe): number =>
  Number(/rotate\((-?[\d.]+)deg\)/.exec(String(keyframe.transform))?.[1])

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360

describe('useSpin', () => {
  let harness: Harness

  beforeEach(() => {
    harness = installHarness()
  })

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the landed distribution under reduced motion', async () => {
    harness.setReducedMotion(true)
    harness.setNow(1000)
    const { result } = renderSpin(MORPHING)

    act(() => {
      result.current.spin()
    })
    expect(harness.animateCalls).toHaveLength(1)
    expect(harness.animateCalls[0].options.duration).toBe(REDUCED_MOTION_MS)
    // A morph loop really is running, so the assertion below cannot pass vacuously.
    expect(harness.rafStarts).toBe(1)

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    // Landing tears the morph loop down rather than leaving it to keep drawing.
    expect(harness.rafCancels).toBeGreaterThan(0)

    // Any frame still in flight arrives past the shortened rotation but long
    // before the authored morph duration would have run out — the window in
    // which a stale loop used to redraw the pre-morph wheel.
    act(() => {
      harness.flushFrames(1000 + REDUCED_MOTION_MS + 100)
      harness.flushFrames(1000 + DURATION_MS / 2)
    })

    const landed = landingSegments(SEGMENTS, MORPHS, DURATION_MS)
    expect(result.current.displaySegments).toEqual(landed)
    expect(result.current.displaySegments).not.toEqual(SEGMENTS)
    expect(result.current.winnerId).toBe('beer')
  })

  it('starts the next spin from the angle the last one rested at', async () => {
    const { result } = renderSpin(PLAIN)

    act(() => {
      result.current.spin()
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    act(() => {
      result.current.spin()
    })

    expect(harness.animateCalls).toHaveLength(2)
    const [first, second] = harness.animateCalls
    expect(second.keyframes[0].transform).not.toBe('rotate(0deg)')

    const restedAt = degreesOf(first.keyframes[1])
    const resumedAt = degreesOf(second.keyframes[0])
    expect(wrap360(restedAt)).not.toBe(0)
    expect(resumedAt).toBeCloseTo(wrap360(restedAt), 6)
    // And it still turns forward from there, rather than unwinding.
    expect(degreesOf(second.keyframes[1])).toBeGreaterThan(resumedAt)
  })

  it('turns the requested number of revolutions', () => {
    // Two distinct values, neither the production default of 6, so the delta
    // has to actually read config.fullSpins rather than hardcode a constant.
    for (const fullSpins of [3, 9]) {
      const { result } = renderSpin({ ...PLAIN, fullSpins, direction: 'cw' })
      act(() => {
        result.current.spin()
      })
      const calls = harness.animateCalls
      const { keyframes } = calls[calls.length - 1]
      const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
      // Pins the magnitude, not just the direction. Dropping a revolution from
      // the delta used to leave the entire suite green.
      expect(travelled).toBeGreaterThanOrEqual(fullSpins * 360)
      expect(travelled).toBeLessThan((fullSpins + 1) * 360)
    }
  })

  it('travels backwards for a counter-clockwise spin', () => {
    const { result } = renderSpin({ ...PLAIN, fullSpins: 3, direction: 'ccw' })
    act(() => {
      result.current.spin()
    })
    const calls = harness.animateCalls
    const { keyframes } = calls[calls.length - 1]
    const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
    expect(travelled).toBeLessThanOrEqual(-3 * 360)
    expect(travelled).toBeGreaterThan(-4 * 360)
  })

  it('lands a counter-clockwise spin on the same angle as a clockwise one', () => {
    // The pointer is fixed, so direction changes the journey, never the
    // destination. Travelling the right distance backwards is not the same as
    // stopping in the right place — reusing `forward` for the reverse distance
    // satisfies the distance tests and still lands on the wrong segment.
    const cw = renderSpin({ ...PLAIN, fullSpins: 3, direction: 'cw' })
    act(() => {
      cw.result.current.spin()
    })
    const cwEnd = wrap360(degreesOf(harness.animateCalls[0].keyframes[1]))

    const ccw = renderSpin({ ...PLAIN, fullSpins: 3, direction: 'ccw' })
    act(() => {
      ccw.result.current.spin()
    })
    const ccwEnd = wrap360(degreesOf(harness.animateCalls[1].keyframes[1]))

    expect(ccwEnd).toBeCloseTo(cwEnd, 9)
  })

  it('keeps the stored resting angle positive across alternating directions', async () => {
    // Regression: `to % 360` keeps the sign of the dividend, so a ccw spin used
    // to store a negative resting angle and the NEXT spin started from a
    // nonsense origin. The first spin must FINISH — the resting angle is
    // written in the `finished` handler.
    const { result } = renderSpin({ ...PLAIN, direction: 'ccw' })
    act(() => {
      result.current.spin()
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    act(() => {
      result.current.spin()
    })
    const start = degreesOf(harness.animateCalls[1].keyframes[0])
    expect(start).toBeGreaterThanOrEqual(0)
    expect(start).toBeLessThan(360)
  })

  it('refuses a second spin started in the same tick as the first', () => {
    const { result } = renderSpin(MORPHING)

    act(() => {
      result.current.spin()
      result.current.spin()
    })

    expect(harness.animateCalls).toHaveLength(1)
    expect(harness.rafStarts).toBe(1)
    expect(result.current.isSpinning).toBe(true)
  })

  it('applies a segment swap that arrived mid-spin once the wheel lands', async () => {
    const swapped: Segment[] = [
      { id: 'zed', label: 'Zed', weight: 1 },
      { id: 'yan', label: 'Yan', weight: 3 },
    ]
    const { result, rerender } = renderSpin(PLAIN)

    act(() => {
      result.current.spin()
    })
    expect(result.current.isSpinning).toBe(true)

    rerender({ segs: swapped })
    // Still mid-spin, so the wheel must not change under the pointer yet.
    expect(result.current.displaySegments).toEqual(SEGMENTS)

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    expect(result.current.isSpinning).toBe(false)
    expect(result.current.displaySegments).toEqual(swapped)
  })

  it('spins the override segments, config, and strategy instead of the props', async () => {
    const alternate: Segment[] = [
      { id: 'x', label: 'Xan', weight: 1 },
      { id: 'y', label: 'Yun', weight: 1 },
    ]
    const { result } = renderSpin({ ...PLAIN, fullSpins: 9 })
    act(() => {
      result.current.spin({
        segments: alternate,
        config: { ...PLAIN, fullSpins: 3 },
        strategy: forced('y'),
      })
    })

    // The override config drove the rotation, not the prop config's 9 turns.
    const calls = harness.animateCalls
    const { keyframes } = calls[calls.length - 1]
    const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
    expect(travelled).toBeGreaterThanOrEqual(3 * 360)
    expect(travelled).toBeLessThan(4 * 360)

    await act(async () => {
      harness.animateCalls[0].finish()
    })
    // And the winner came from the override segments, which the props never had.
    expect(result.current.winnerId).toBe('y')
  })
})
