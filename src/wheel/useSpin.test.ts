import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMorphs, landingSegments } from './morph'
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
  easing: [0.1, 0.8, 0.2, 1],
  morphs: MORPHS,
}

const PLAIN: SpinConfig = { ...MORPHING, morphs: [] }

const SETTLING: SpinConfig = { ...PLAIN, settle: { ms: 1000, curve: [0.33, 1, 0.68, 1] } }

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
    expect(result.current.landing?.winner.id).toBe('beer')
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

  it('cruises then breaks when the motion carries a settle', () => {
    const { result } = renderSpin(SETTLING)
    act(() => {
      result.current.spin()
    })

    const { keyframes, options } = harness.animateCalls[0]
    expect(keyframes).toHaveLength(3)
    // The timeline must not ease: the keyframes carry their own curves, and a
    // second easing over the top would warp both intervals and break the handover.
    expect(options.easing).toBe('cubic-bezier(0, 0, 1, 1)')
    expect(Number(keyframes[1].offset)).toBeCloseTo((DURATION_MS - 1000) / DURATION_MS, 9)
    expect(keyframes[1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('keeps a settle proportional to a reduced-motion duration', () => {
    harness.setReducedMotion(true)
    const { result } = renderSpin(SETTLING)
    act(() => {
      result.current.spin()
    })

    const { keyframes, options } = harness.animateCalls[0]
    expect(options.duration).toBe(REDUCED_MOTION_MS)
    // In milliseconds, not as a fraction: the offset alone is the same number
    // whichever duration reached the track, so it cannot tell a proportional
    // settle from a mis-wired one. An unscaled 1000ms settle would clamp to
    // half of a 300ms spin and leave no cruise for the joke to live in.
    const settleMs = Number(options.duration) * (1 - Number(keyframes[1].offset))
    expect(settleMs).toBeCloseTo(REDUCED_MOTION_MS * (1000 / DURATION_MS), 6)
  })

  it('stores the settled resting angle for the next spin', async () => {
    const { result } = renderSpin(SETTLING)
    act(() => {
      result.current.spin()
    })
    const landedAt = degreesOf(harness.animateCalls[0].keyframes[2])
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    act(() => {
      result.current.spin()
    })

    // Resuming from the middle keyframe's angle instead would start the next
    // spin a cruise-length short of where the wheel actually is.
    expect(degreesOf(harness.animateCalls[1].keyframes[0])).toBeCloseTo(wrap360(landedAt), 6)
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

  it('holds a segment swap that arrived mid-spin until the next spin', async () => {
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

    // Landed, and still holding: releasing here would overwrite plan.landing on
    // the next render, which is the whole payoff when weights morph.
    expect(result.current.isSpinning).toBe(false)
    expect(result.current.displaySegments).toEqual(SEGMENTS)

    // The hold lifts because the next spin takes the geometry, and it takes it
    // from the roster that arrived while the wheel was held.
    act(() => {
      result.current.spin()
    })
    expect(result.current.displaySegments).toEqual(swapped)
  })

  it('keeps the morphed landing when a swap arrives mid-spin', async () => {
    const { result, rerender } = renderSpin(MORPHING)

    act(() => {
      result.current.spin()
    })
    rerender({ segs: [...SEGMENTS] })

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    // The sliver swallowed the wheel. A new-but-equal array must not undo that.
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
  })

  it('spins the override segments, config, and strategy instead of the props', async () => {
    const alternate: Segment[] = [
      { id: 'x', label: 'Xan', weight: 1 },
      { id: 'y', label: 'Yun', weight: 1 },
    ]
    const { result } = renderSpin({ ...PLAIN, fullSpins: 9 })
    act(() => {
      result.current.spin({
        // The pinned draw lands on 'y' of its own accord, so rigging 'x' is
        // what separates the override strategy from the default fair draw.
        segments: alternate,
        config: { ...PLAIN, fullSpins: 3 },
        strategy: forced('x'),
      })
    })

    // The wheel shows the override segments the moment it launches, not the
    // props it is still mounted with.
    expect(result.current.displaySegments).toEqual(alternate)

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
    expect(result.current.landing?.winner.id).toBe('x')
  })

  it('takes duration, easing, direction, revolutions, and morphs from the override config', () => {
    // Every field differs from the prop config, so a single missed conversion
    // in the spin callback cannot hide behind an identical prop value.
    const { result } = renderSpin({ ...PLAIN, fullSpins: 9, direction: 'cw' })
    act(() => {
      result.current.spin({
        config: {
          durationMs: 1200,
          fullSpins: 3,
          direction: 'ccw',
          easing: [0, 0, 1, 1],
          morphs: MORPHS,
        },
      })
    })

    const { keyframes, options } = harness.animateCalls[0]
    expect(options.duration).toBe(1200)
    expect(options.easing).toBe('cubic-bezier(0, 0, 1, 1)')

    // Negative pins the direction; the magnitude pins the revolutions, on the
    // ccw arm of the delta that the cw tests never reach.
    const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
    expect(travelled).toBeLessThanOrEqual(-3 * 360)
    expect(travelled).toBeGreaterThan(-4 * 360)

    // The prop config carries no morphs, so a running morph track can only mean
    // the override's list was the one consulted.
    expect(harness.rafStarts).toBe(1)
  })

  it('morphs the override segments on the override clock', async () => {
    // Reduced motion is what separates the two clocks: the rotation runs for
    // 300ms while the morph must still be scaled against the spin's own
    // authored duration. Prop and override durations differ so that scaling has
    // an observable wrong answer.
    harness.setReducedMotion(true)
    harness.setNow(1000)
    const unrelated: Segment[] = [
      { id: 'x', label: 'Xan', weight: 1 },
      { id: 'y', label: 'Yun', weight: 1 },
    ]
    // Props: segments the morphs do not name, no morphs, a shorter duration.
    const { result } = renderSpin({ ...PLAIN, durationMs: 900 }, unrelated)
    act(() => {
      result.current.spin({ segments: SEGMENTS, config: MORPHING })
    })

    act(() => {
      harness.flushFrames(1000 + 240)
    })

    // 240ms into a 300ms rotation is 80% of the way through, which on the
    // override's 4500ms morph lands inside the steep final stretch.
    const elapsedFraction = 240 / 300
    expect(result.current.displaySegments).toEqual(
      applyMorphs(SEGMENTS, MORPHS, elapsedFraction * DURATION_MS),
    )
    // Scaling against the prop duration instead would still be mid-plateau, so
    // the assertion above genuinely separates the two clocks.
    expect(result.current.displaySegments).not.toEqual(
      applyMorphs(SEGMENTS, MORPHS, elapsedFraction * 900),
    )

    await act(async () => {
      harness.animateCalls[0].finish()
    })
    // The landing was planned from the override's segments and morphs too.
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
  })

  it('resolves late with the drawn winner and lands on the swapped frame', async () => {
    const seen: string[] = []
    const { result } = renderSpin(PLAIN)
    act(() => {
      result.current.spin({
        resolveLate: (winnerId) => {
          seen.push(winnerId)
          return [
            {
              segmentId: winnerId,
              durationMs: DURATION_MS,
              keyframes: [
                { at: 0.95, label: 'before' },
                { at: 0.95, label: 'after' },
              ],
            },
          ]
        },
      })
    })

    // Called with the winner planSpin actually drew, not one supplied up front.
    expect(seen).toHaveLength(1)

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    // The landed frame carries the late morph. Falling back to plan.landing
    // here would show the pre-swap labels at the one moment that matters.
    expect(result.current.landing?.winner.id).toBe(seen[0])
    const landed = result.current.displaySegments.find((s) => s.id === seen[0])
    expect(landed?.label).toBe('after')
  })

  it('runs the late morphs on the animation clock', () => {
    const { result } = renderSpin(PLAIN)
    harness.setNow(1000)
    act(() => {
      result.current.spin({
        resolveLate: (winnerId) => [
          {
            segmentId: winnerId,
            durationMs: DURATION_MS,
            keyframes: [
              { at: 0.5, label: 'early' },
              { at: 0.5, label: 'late' },
            ],
          },
        ],
      })
    })

    // A config with no morphs of its own still has to start the geometry loop
    // once a late morph exists, or the swap would only appear at the landing.
    expect(harness.rafStarts).toBe(1)
    act(() => {
      harness.flushFrames(1000 + DURATION_MS * 0.6)
    })
    expect(result.current.displaySegments.some((s) => s.label === 'late')).toBe(true)
  })

  it('leaves the planned landing alone when nothing resolves late', async () => {
    const { result } = renderSpin(MORPHING)
    act(() => {
      result.current.spin()
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
  })
})

describe('landing', () => {
  let harness: Harness
  beforeEach(() => {
    harness = installHarness()
  })
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('is null while spinning and carries the winner once resolved', async () => {
    const { result } = renderSpin(PLAIN)
    act(() => {
      result.current.spin()
    })
    expect(result.current.landing).toBeNull()

    await act(async () => {
      harness.animateCalls[0].finish()
    })
    expect(result.current.landing?.winner.id).toBeDefined()
  })

  it('increments the landing id on every spin', async () => {
    const { result } = renderSpin(PLAIN)
    act(() => {
      result.current.spin()
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    const first = result.current.landing?.id ?? 0

    act(() => {
      result.current.spin()
    })
    // Cleared the instant the next spin starts, so nothing downstream reads a
    // stale winner over a turning wheel.
    expect(result.current.landing).toBeNull()

    await act(async () => {
      harness.animateCalls[1].finish()
    })
    expect(result.current.landing?.id).toBe(first + 1)
  })

  it('carries the landed-frame segment, not the drawn one', async () => {
    const { result } = renderSpin(PLAIN)
    act(() => {
      result.current.spin({
        resolveLate: (winnerId) => [
          {
            segmentId: winnerId,
            durationMs: DURATION_MS,
            keyframes: [
              { at: 0.95, label: 'before' },
              { at: 0.95, label: 'after' },
            ],
          },
        ],
      })
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    // The whole reason Landing carries a Segment: with a swap in play the
    // announced identity is the traded one.
    expect(result.current.landing?.winner.label).toBe('after')
  })
})

describe('release and reset', () => {
  let harness: Harness

  beforeEach(() => {
    harness = installHarness()
  })

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const swapped: Segment[] = [
    { id: 'zed', label: 'Zed', weight: 1 },
    { id: 'yan', label: 'Yan', weight: 3 },
  ]

  /** Spins to a landing, with `segs` swapped underneath while the wheel turns. */
  async function land(config: SpinConfig, segs?: Segment[]) {
    const view = renderSpin(config)
    act(() => {
      view.result.current.spin()
    })
    if (segs) view.rerender({ segs })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    return view
  }

  // The bug this exists to prevent: a live roster stops reaching the wheel the
  // moment it lands, and only a spin can ever start it again.
  it('lets a roster held through the landing reach the wheel', async () => {
    const { result } = await land(PLAIN, swapped)
    expect(result.current.displaySegments).toEqual(SEGMENTS)

    act(() => {
      result.current.release()
    })

    expect(result.current.displaySegments).toEqual(swapped)
  })

  it('keeps the landed frame when nothing arrived to replace it', async () => {
    const { result } = await land(MORPHING)

    act(() => {
      result.current.release()
    })

    // Release lifts the hold; it does not redraw. The sliver that swallowed the
    // wheel stays until the roster actually changes.
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
  })

  // `held` is what the wheel reads to decide whether to animate presences. It
  // has to outlive isSpinning, or a landed frame animates against a roster this
  // hook is deliberately ignoring.
  it('reports the hold across a landing, and drops it on release', async () => {
    const { result } = await land(PLAIN, swapped)
    expect(result.current.isSpinning).toBe(false)
    expect(result.current.held).toBe(true)

    act(() => {
      result.current.release()
    })

    expect(result.current.held).toBe(false)
  })

  it('reports the hold while a spin is still running', () => {
    const { result } = renderSpin(PLAIN)
    expect(result.current.held).toBe(false)

    act(() => {
      result.current.spin()
    })

    expect(result.current.held).toBe(true)
  })

  it('drops the hold on reset', async () => {
    const { result } = await land(PLAIN)

    act(() => {
      result.current.reset()
    })

    expect(result.current.held).toBe(false)
  })

  it('keeps the landing, so the announced winner outlives the hold', async () => {
    const { result } = await land(PLAIN, swapped)
    const landed = result.current.landing

    act(() => {
      result.current.release()
    })

    expect(result.current.landing).toEqual(landed)
  })

  it('follows a roster that arrives after a release', async () => {
    const { result, rerender } = await land(PLAIN)

    act(() => {
      result.current.release()
    })
    rerender({ segs: swapped })

    expect(result.current.displaySegments).toEqual(swapped)
  })

  it('redraws the live roster on reset, morph and all', async () => {
    const { result } = await land(MORPHING)

    act(() => {
      result.current.reset()
    })

    // Unlike release, reset is the operator saying the landing is over, so the
    // morphed frame goes even though no new roster arrived to displace it.
    expect(result.current.displaySegments).toEqual(SEGMENTS)
  })

  it('clears the landing on reset', async () => {
    const { result } = await land(PLAIN)
    expect(result.current.landing).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.landing).toBeNull()
  })

  it('freezes the layout geometry on the landed frame while a spin is held', () => {
    const { result } = renderSpin(MORPHING)

    act(() => {
      result.current.spin()
    })

    // Drawn geometry is still at the start of the morph; layout geometry is
    // already where the wheel will end up, so a ladder cannot re-walk mid-spin.
    expect(result.current.displaySegments.find((s) => s.id === 'beer')?.weight).toBe(0.02)
    expect(result.current.layoutSegments.find((s) => s.id === 'beer')?.weight).toBe(1)
  })

  it('counter-animates a registered level group off the rotor track', () => {
    const { result } = renderSpin(PLAIN)
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')

    act(() => {
      result.current.levelRef('ana', -45)(element)
    })
    act(() => {
      result.current.spin()
    })

    expect(harness.animateCalls).toHaveLength(2)
    const [rotor, level] = harness.animateCalls
    expect(level.options.duration).toBe(rotor.options.duration)
    expect(degreesOf(level.keyframes[0])).toBe(-45 - degreesOf(rotor.keyframes[0]))
    expect(degreesOf(level.keyframes[1])).toBe(-45 - degreesOf(rotor.keyframes[1]))
  })

  it('stops counter-animating a level group once it unmounts', () => {
    const { result } = renderSpin(PLAIN)
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')

    act(() => {
      result.current.levelRef('ana', -45)(element)
      result.current.levelRef('ana', -45)(null)
    })
    act(() => {
      result.current.spin()
    })

    expect(harness.animateCalls).toHaveLength(1)
  })

  it('counter-rotates by where a wedge is now, not where it first mounted', () => {
    const { result } = renderSpin(PLAIN)
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')

    act(() => {
      result.current.levelRef('ana', -45)(element)
    })
    // The wedge moved — a neighbor left. The ref identity is stable, so React
    // never calls it again and this is the only report the hook will get.
    act(() => {
      result.current.levelRef('ana', -170)(element)
    })
    act(() => {
      result.current.spin()
    })

    const [rotor, level] = harness.animateCalls
    expect(degreesOf(level.keyframes[0])).toBe(-170 - degreesOf(rotor.keyframes[0]))
  })
})
