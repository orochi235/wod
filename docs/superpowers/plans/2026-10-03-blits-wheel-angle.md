# Wheel Angle and Flapper on blits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Unbuilt.** Blocked on `@msb235/blits` 0.4.0 being published with both `hold` and `Mix.inert`.
Task 1 checks that and stops if it is not out.

**Goal:** Phase 2 of `docs/superpowers/specs/2026-10-03-blits-migration-design.md`: the wheel's angle
comes from a voice on the wheel mix instead of `getComputedStyle`, and the flapper arm is a blits spring
written straight to the DOM, so the flapper no longer re-renders the Wheel every frame.

**Architecture:** `useSpin` cues an `anglePatch` voice (angle and speed computed from the same
`RotationTrack` the rotor's WAAPI animation plays) on the wheel mix, starting at the same `startedAt`.
WAAPI gets that `startTime` explicitly. A `trackFlapper` subscriber reads angle and speed each frame,
aims a spring on `deflection` at the peg's geometric push (or at 0 once the wheel is still), counts
peg crossings for the clicker, and writes the arm's rotation onto an SVG group. The ticker sleeps on
`!inert` rather than `!live`, so a held angle and a settled spring cost no frames.

**Tech Stack:** React 19, TypeScript, Vitest + jsdom, `@msb235/blits` 0.4.0.

## Readings the spec leaves open

Accepted on 2026-10-04. Each has a line in the spec update (Task 8).

- **The arm still rides the pegs.** The spec's flapper paragraph describes a kick on each crossing. Its
  viewer table says only the settle changes. This plan follows the viewer table: the spring's target is
  today's `deflectionDeg`, and 0 once the wheel is still. Visible behavior is unchanged except that the
  fall back upright is a spring rather than 1.5° per frame.
- **The arm and the clicker both keep going in the dark.** The spec says "no kicks while dark", which was
  rejected on 2026-10-04: the clicker is mechanical, so pegs striking the flapper make noise
  with the lights out. App no longer mutes the clicker on `dark` (done ahead of this plan).
- **`angleAt` stays in `src/wheel/outage.ts`.** `withOutage` uses it too; the patch imports it.

## Files

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | blits `0.3.0` → `0.4.0` |
| `src/clock/ticker.ts` | `Syncable.live` → `Syncable.inert`; sleep when every mix is inert |
| `src/clock/ticker.test.ts` | harness speaks `inert` |
| `src/clock/motion.ts` | `WheelPose` and `wheelKit` gain `angle`, `speed`, `deflection` |
| `src/clock/motion.test.ts` | a held voice lets the clock sleep |
| `src/wheel/anglePatch.ts` (new) | `anglePatch(track)`: angle and speed at a phase |
| `src/wheel/anglePatch.test.ts` (new) | angle matches `angleAt`, holds, hidden-tab jump, speed |
| `src/wheel/useSpin.ts` | takes `motion`; `startedAt` from the motion clock; pins WAAPI `startTime`; cues and fades the angle voice |
| `src/wheel/useSpin.test.ts` | passes a motion; angle-voice cases |
| `src/wheel/flapper.ts` | `settledDeflection` and `FALL_PER_FRAME` removed; `STILL_SPEED` exported |
| `src/wheel/flapper.test.ts` | `settledDeflection` cases removed |
| `src/wheel/trackFlapper.ts` (new) | the spring voice and the per-frame subscriber |
| `src/wheel/trackFlapper.test.ts` (new) | lift, settle at two frame rates, clicker speed, sleep |
| `src/wheel/Wheel.tsx` | required `motion` prop; arm written by `trackFlapper`; `useWheelAngle` gone |
| `src/wheel/Wheel.test.tsx`, `src/transition/usePresence.test.tsx` | pass a motion |
| `src/wheel/useWheelAngle.ts`, `src/wheel/useWheelAngle.test.tsx` | deleted |
| `src/App.tsx`, `src/editor/Editor.tsx` | motion made before `useSpin`, passed to it and to `<Wheel>` |
| `docs/superpowers/specs/2026-10-03-blits-migration-design.md` | phase 2 built; the readings above |
| `docs/HANDOFF.md` | state moved on |

---

### Task 1: Bump blits to 0.4.0

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Check 0.4.0 is published and carries both features**

Run: `npm view @msb235/blits@0.4.0 version`
Expected: `0.4.0`. If it prints nothing or errors, **stop**: the plan cannot proceed. Report it.

Run: `npm pack @msb235/blits@0.4.0 --pack-destination "$TMPDIR" && tar -xzf "$TMPDIR"/msb235-blits-0.4.0.tgz -C "$TMPDIR" && grep -n "readonly inert\|hold?:" "$TMPDIR"/package/dist/*.d.ts; rm -rf "$TMPDIR"/package "$TMPDIR"/msb235-blits-0.4.0.tgz`
Expected: one `readonly inert: boolean;` line and one `hold?: 'before' | 'after' | 'both';` line. If
either is missing, **stop** and tell the owner which.

- [ ] **Step 2: Pin it exactly**

In `package.json`, change `"@msb235/blits": "0.3.0"` to `"@msb235/blits": "0.4.0"`. Then:

Run: `npm install`
Expected: exits 0; `grep '"version"' node_modules/@msb235/blits/package.json` prints `"version": "0.4.0"`.

- [ ] **Step 3: Run the code already on blits**

Run: `npx vitest run src/clock src/outage`
Expected: PASS. A failure here is a 0.4.0 break in phase 1 or 3 code; fix it before going on, in this
task, and say what broke in the commit body.

Run: `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
pin blits 0.4.0, which adds hold and inert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The ticker sleeps on `inert`

A held voice keeps `live` true forever, so a ticker that runs while anything is live would tick every
frame under a landed wheel. `inert` is true once another frame would change nothing.

**Files:**
- Modify: `src/clock/ticker.ts`
- Test: `src/clock/ticker.test.ts`, `src/clock/motion.test.ts`

- [ ] **Step 1: Point the ticker tests at `inert`**

In `src/clock/ticker.test.ts`, replace the harness's mix and its `live` parameter:

```ts
function harness(inert = true) {
  let t = 0
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  const mix = { sync: vi.fn(), inert }
```

Then change each call site: `harness(true)` → `harness(false)`, `harness(false)` → `harness(true)`, and
replace the live/sleep case with:

```ts
  it('keeps going while a mix would still change, and sleeps once none would', () => {
    const { mix, ticker, step, waiting } = harness(false)
    ticker.wake()
    step(16)
    expect(waiting()).toBe(1)
    mix.inert = true
    step(32)
    expect(waiting()).toBe(0)
  })
```

- [ ] **Step 2: Add the held-voice case to the motion tests**

Append inside `describe('the wheel mix', …)` in `src/clock/motion.test.ts`:

```ts
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
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/clock`
Expected: FAIL. The ticker still reads `live`, so the ticker harness never schedules, and the held
voice keeps the motion clock waiting.

- [ ] **Step 4: Switch the ticker**

In `src/clock/ticker.ts`:

```ts
export type Syncable = { sync(timestamp: number): void; readonly inert: boolean }
```

```ts
/** The app's one animation loop. Runs while any mix would still change or anyone holds it. */
```

```ts
    } finally {
      if (holds > 0 || mixes.some((mix) => !mix.inert)) schedule()
    }
```

and the `stay` doc comment: `/** Keeps frames coming, whatever the mixes say, until the returned release is called. */`

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/clock src/outage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/clock/ticker.ts src/clock/ticker.test.ts src/clock/motion.test.ts
git commit -m "$(cat <<'EOF'
sleep the ticker once every mix is inert, so a held voice costs no frames

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The wheel kit gains angle, speed and deflection

**Files:**
- Modify: `src/clock/motion.ts`

- [ ] **Step 1: Add the channels**

In `src/clock/motion.ts`, import `sum` beside the others and widen the pose and kit:

```ts
import { type Kit, type Mix, kit, last, max, mix, sum } from '@msb235/blits'
```

```ts
export type WheelPose = {
  blackout?: number
  dark?: boolean
  /** Unwrapped degrees clockwise. Wrap it only where it is drawn. */
  angle?: number
  /** Degrees per millisecond, signed, from the track's own slope. */
  speed?: number
  /** The flapper arm's turn, degrees. */
  deflection?: number
}
```

```ts
export const wheelKit: Kit<WheelPose> = kit<WheelPose>({
  blackout: max(),
  dark: last<boolean>({ lerp: atStop }),
  angle: sum(),
  speed: sum(),
  deflection: sum(),
})
```

- [ ] **Step 2: Typecheck and run the clock tests**

Run: `npx tsc --noEmit -p . && npx vitest run src/clock`
Expected: exits 0; PASS.

- [ ] **Step 3: Commit**

```bash
git add src/clock/motion.ts
git commit -m "$(cat <<'EOF'
give the wheel mix angle, speed and deflection channels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `anglePatch`

**Files:**
- Create: `src/wheel/anglePatch.ts`
- Test: `src/wheel/anglePatch.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/wheel/anglePatch.test.ts
import { describe, expect, it } from 'vitest'
import { WHEEL } from '../clock/motion'
import { fakeMotion } from '../clock/testing'
import { anglePatch } from './anglePatch'
import { angleAt, withOutage } from './outage'
import { rotationTrack } from './rotation'
import type { RotationTrack } from './rotation'

const SETTLE = rotationTrack(30, 200, {
  durationMs: 4500,
  fullSpins: 6,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
  settle: { ms: 1000, curve: [0.33, 1, 0.68, 1] },
})
const OUTAGE = withOutage(SETTLE, { cruiseMs: 1500, sparkMs: 800 }).track

function cued(track: RotationTrack, start = 1000) {
  const fake = fakeMotion()
  fake.motion.wheel.cue({
    patch: anglePatch(track),
    subjects: [WHEEL],
    start,
    loop: false,
    hold: 'after',
  })
  fake.motion.ticker.wake()
  const read = (t: number) => {
    fake.step(t)
    return fake.motion.wheel.probe(WHEEL)
  }
  return { ...fake, read }
}

describe('anglePatch', () => {
  for (const [name, track] of [
    ['a settle track', SETTLE],
    ['an outage track', OUTAGE],
  ] as const) {
    it(`matches the rotation model through ${name}`, () => {
      const { read } = cued(track)
      for (const share of [0, 0.25, 0.5, 0.75, 1]) {
        const ms = share * track.durationMs
        expect(read(1000 + ms).angle).toBeCloseTo(angleAt(track, ms), 6)
      }
    })
  }

  it('holds the resting angle long after the track ends, and lets the clock sleep', () => {
    const { read, waiting } = cued(SETTLE)
    read(1000 + SETTLE.durationMs)
    const held = read(1000 + SETTLE.durationMs + 5000)
    expect(held.angle).toBeCloseTo(SETTLE.to, 6)
    expect(((held.angle ?? 0) % 360 + 360) % 360).toBeCloseTo(200, 6)
    expect(held.speed).toBe(0)
    read(1000 + SETTLE.durationMs + 5016)
    expect(waiting()).toBe(false)
  })

  it('jumps straight to where the track is after a hidden tab', () => {
    const { read } = cued(SETTLE)
    read(1016)
    expect(read(1016 + 4000).angle).toBeCloseTo(angleAt(SETTLE, 4016), 6)
  })

  it('reports the track slope as speed, in degrees per millisecond', () => {
    const { read } = cued(SETTLE)
    for (const ms of [100, 2000, 3800]) {
      const slope = angleAt(SETTLE, ms + 1) - angleAt(SETTLE, ms)
      expect(read(1000 + ms).speed).toBeCloseTo(slope, 6)
    }
  })

  it('is signed the way the wheel turns', () => {
    const ccw = rotationTrack(30, 200, {
      durationMs: 4500,
      fullSpins: 6,
      direction: 'ccw',
      easing: [0.1, 0.8, 0.2, 1],
    })
    const { read } = cued(ccw)
    expect(read(1000 + 1000).speed).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/wheel/anglePatch.test.ts`
Expected: FAIL with `Failed to resolve import "./anglePatch"`.

- [ ] **Step 3: Write the patch**

```ts
// src/wheel/anglePatch.ts
import { type Patch, patch } from '@msb235/blits'
import type { WheelPose } from '../clock/motion'
import { angleAt } from './outage'
import type { RotationTrack } from './rotation'

/** The step the slope is read over, ms. One is short against any curve a spin uses. */
const SLOPE_MS = 1

/**
 * The rotor's track as a voice: where the wheel is and how fast it turns, from the
 * same keyframes WAAPI plays. Cue it from the animation's own start time with
 * `hold: 'after'`, and the angle stays on the resting angle until it is faded.
 */
export function anglePatch(track: RotationTrack): Patch<string, WheelPose, void> {
  const total = track.durationMs
  return patch<string, WheelPose>(
    Math.max(1, total),
    (phase) => {
      if (phase >= 1 || total <= 0) return { angle: angleAt(track, total), speed: 0 }
      const ms = phase * total
      const angle = angleAt(track, ms)
      return { angle, speed: (angleAt(track, ms + SLOPE_MS) - angle) / SLOPE_MS }
    },
    { writes: ['angle', 'speed'] },
  )
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/wheel/anglePatch.test.ts`
Expected: PASS. If "matches the rotation model" fails only at share 1, blits ended the pass a frame
early: read the phase it passes at `end` (`console.log` in the patch) and report it rather than
loosening the test.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/anglePatch.ts src/wheel/anglePatch.test.ts
git commit -m "$(cat <<'EOF'
add anglePatch, the rotor's track as a voice with its slope as speed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `useSpin` plays the angle voice on the motion clock

**Files:**
- Modify: `src/wheel/useSpin.ts`, `src/App.tsx`, `src/editor/Editor.tsx`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Give the test harness a motion**

In `src/wheel/useSpin.test.ts`, add imports:

```ts
import { WHEEL } from '../clock/motion'
import { fakeMotion } from '../clock/testing'
```

Give the fake animation a writable `startTime` and record it. Replace the `animation` object and the
`push` in `animate`:

```ts
    const animation = {
      finished,
      startTime: null as number | null,
      cancel: () => rejectFinished(new Error('animation canceled')),
    } as unknown as Animation

    harness.animateCalls.push({
      keyframes: (Array.isArray(keyframes) ? keyframes : []) as Keyframe[],
      options: typeof options === 'object' && options !== null ? options : {},
      finish: () => resolveFinished(animation),
      animation,
    })
```

and add `animation: Animation` to the `AnimateCall` type. Then give the suite a motion clock the tests
step by hand. At module level, beside `harness`:

```ts
let fake: ReturnType<typeof fakeMotion>
```

In `beforeEach`, after `harness = installHarness()`:

```ts
    fake = fakeMotion()
```

and `renderSpin` passes it:

```ts
function renderSpin(config: SpinConfig, initial: Segment[] = SEGMENTS) {
  const view = renderHook(({ segs }) => useSpin(segs, config, fake.motion), {
    initialProps: { segs: initial },
  })
  // spin() bails without a rotor, so give it a real one.
  view.result.current.rotorRef.current = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  return view
}
```

`startedAt` now comes from `fake`'s clock, not `performance.now()`. A test that sets the time before
`spin()` with `harness.setNow(n)` also needs `act(() => fake.step(n))` there; existing tests that only
compare keyframes need nothing.

- [ ] **Step 2: Write the failing tests**

Append inside `describe('useSpin', …)`:

```ts
  describe('the angle voice', () => {
    it('starts the rotor on the motion clock, at the moment the voice starts', () => {
      act(() => fake.step(5000))
      const { result } = renderSpin(PLAIN)
      act(() => result.current.spin({ strategy: forced('ana') }))
      const { animation, keyframes, options } = harness.animateCalls[0]
      expect(animation.startTime).toBe(5000)

      act(() => fake.step(5000 + Number(options.duration) / 2))
      const half = fake.motion.wheel.probe(WHEEL).angle ?? Number.NaN
      const from = degreesOf(keyframes[0])
      const to = degreesOf(keyframes[keyframes.length - 1])
      expect(half).toBeGreaterThan(from)
      expect(half).toBeLessThan(to)
    })

    it('holds the landed angle once the spin is over', async () => {
      act(() => fake.step(1000))
      const { result } = renderSpin(PLAIN)
      act(() => result.current.spin({ strategy: forced('ana') }))
      const { keyframes, options } = harness.animateCalls[0]
      await act(async () => harness.animateCalls[0].finish())
      fake.motion.ticker.wake()
      act(() => fake.step(1000 + Number(options.duration) + 5000))
      expect(fake.motion.wheel.probe(WHEEL).angle).toBeCloseTo(
        degreesOf(keyframes[keyframes.length - 1]),
        6,
      )
    })

    it('replaces the last spin’s angle rather than adding to it', async () => {
      act(() => fake.step(1000))
      const { result } = renderSpin(PLAIN)
      act(() => result.current.spin({ strategy: forced('ana') }))
      await act(async () => harness.animateCalls[0].finish())
      fake.motion.ticker.wake()
      act(() => fake.step(20000))
      act(() => result.current.spin({ strategy: forced('ben') }))
      act(() => fake.step(20000))
      expect(fake.motion.wheel.probe(WHEEL).angle).toBeCloseTo(
        degreesOf(harness.animateCalls[1].keyframes[0]),
        6,
      )
    })

    it('leaves the mix when the hook unmounts', () => {
      act(() => fake.step(1000))
      const { result, unmount } = renderSpin(PLAIN)
      act(() => result.current.spin({ strategy: forced('ana') }))
      unmount()
      fake.motion.ticker.wake()
      fake.step(1500)
      expect(fake.motion.wheel.probe(WHEEL).angle ?? 0).toBe(0)
    })
  })
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL. TypeScript accepts the third argument at runtime but `startTime` stays `null` and the
mix reads no angle.

- [ ] **Step 4: Implement**

In `src/wheel/useSpin.ts`:

Imports:

```ts
import type { Handle } from '@msb235/blits'
import { type Motion, WHEEL } from '../clock/motion'
import { anglePatch } from './anglePatch'
```

`OutageRun`'s doc comment:

```ts
/**
 * An outage in flight. `startedAt` is the motion clock's time the spin began,
 * which every moment in `plan` counts from; `id` is fresh per spin.
 */
```

Signature and a ref for the voice:

```ts
export function useSpin(segments: Segment[], config: SpinConfig, motion: Motion): UseSpinResult {
```

```ts
  const angleVoiceRef = useRef<Handle<string> | null>(null)
```

`stopTracks` also takes the angle voice out, so a new spin replaces it and an unmount removes it:

```ts
  const stopTracks = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    animationRef.current?.cancel()
    animationRef.current = null
    riderAnimation.current?.cancel()
    riderAnimation.current = null
    angleVoiceRef.current?.fade({ over: 0 })
    angleVoiceRef.current = null
  }, [])
```

In `spin`, replace `const startedAt = performance.now()` with:

```ts
      // The rotor and the wheel mix both read the document timeline; pinning
      // WAAPI's start to this same instant keeps the angle voice on the pixels.
      const startedAt = motion.ticker.now()
```

After each `animate` call, pin its start. The rotor:

```ts
      const animation = rotor.animate(track.keyframes, {
        duration: track.durationMs,
        easing: track.easing,
        fill: 'forwards',
      })
      animation.startTime = startedAt
      animationRef.current = animation
```

The rider:

```ts
      const riding =
        rider.current?.animate(track.keyframes, {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        }) ?? null
      if (riding) riding.startTime = startedAt
      riderAnimation.current = riding
```

The level elements:

```ts
      for (const [id, element] of levels) {
        element.animate(invertTrack(track, restingDegs.get(id) ?? 0), {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        }).startTime = startedAt
      }
```

Then, right after the level loop, cue the angle voice:

```ts
      angleVoiceRef.current = motion.wheel.cue({
        patch: anglePatch(track),
        subjects: [WHEEL],
        start: startedAt,
        loop: false,
        hold: 'after',
      })
      motion.ticker.wake()
```

Add `motion` to `spin`'s dependency list: `[segments, config, stopTracks, levels, restingDegs, motion]`.

- [ ] **Step 5: Pass the motion from App and Editor**

In `src/App.tsx`, move `const motion = useMotionRoot()` above the `useSpin` call and pass it:
`} = useSpin(resolved.segments, config, motion)`.

In `src/editor/Editor.tsx`, the same: move `const motion = useMotionRoot()` above `useSpin` and call
`useSpin(resolved.segments, spinConfig, motion)`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/wheel/useSpin.test.ts src/App.test.tsx src/editor`
Expected: PASS. `npx tsc --noEmit -p .` exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts src/App.tsx src/editor/Editor.tsx
git commit -m "$(cat <<'EOF'
play the wheel's angle as a voice on the motion clock, with WAAPI pinned to its start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `trackFlapper`

The arm aims a spring at today's geometric push while the wheel turns and at upright once it is
still. The stiffness below is chosen so the arm follows a peg closely and falls in about a tenth of a
second; it is untuned against the real look, which Task 7's screenshots check.

**Files:**
- Modify: `src/wheel/flapper.ts`, `src/wheel/flapper.test.ts`
- Create: `src/wheel/trackFlapper.ts`
- Test: `src/wheel/trackFlapper.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/wheel/trackFlapper.test.ts
import { describe, expect, it, vi } from 'vitest'
import { WHEEL } from '../clock/motion'
import { fakeMotion } from '../clock/testing'
import { anglePatch } from './anglePatch'
import { MAX_DEFLECTION_DEG } from './flapper'
import { angleAt } from './outage'
import type { RotationTrack } from './rotation'
import { trackFlapper } from './trackFlapper'

/** 0° to `to` over `ms`, linear. */
const turn = (to: number, ms: number): RotationTrack => ({
  keyframes: [{ transform: 'rotate(0deg)' }, { transform: `rotate(${to}deg)` }],
  durationMs: ms,
  easing: 'linear',
  to,
})

/** One peg at 342°: under the hinge once the wheel has turned 18°, within reach from 6° to 30°. */
const PEGS = [0.95]

function rig(track: RotationTrack) {
  const fake = fakeMotion()
  const written: number[] = []
  const click = vi.fn()
  const stop = trackFlapper(fake.motion, {
    pegs: () => PEGS,
    write: (deg) => written.push(deg),
    click,
  })
  fake.motion.wheel.cue({
    patch: anglePatch(track),
    subjects: [WHEEL],
    start: 0,
    loop: false,
    hold: 'after',
  })
  fake.motion.ticker.wake()
  const deflection = () => fake.motion.wheel.probe(WHEEL).deflection ?? 0
  return { ...fake, written, click, stop, deflection }
}

describe('trackFlapper', () => {
  it('lifts the arm as a peg comes under it', () => {
    const { step, deflection } = rig(turn(36, 1000))
    step(0)
    expect(deflection()).toBe(0)
    for (let t = 16; t <= 500; t += 16) step(t)
    expect(Math.abs(deflection())).toBeGreaterThan(MAX_DEFLECTION_DEG * 0.5)
    expect(Math.abs(deflection())).toBeLessThanOrEqual(MAX_DEFLECTION_DEG)
  })

  it('pushes the arm the way the peg is going', () => {
    const { step, deflection } = rig(turn(36, 1000))
    for (let t = 0; t <= 500; t += 16) step(t)
    // A clockwise wheel carries the arm's tip counter-clockwise: see deflectionDeg.
    expect(deflection()).toBeLessThan(0)
  })

  it('falls upright the same way at any frame rate', () => {
    // Stops with the peg under the hinge, so the arm is up when the wheel stops.
    const at = (frameMs: number) => {
      const { step, deflection } = rig(turn(18, 500))
      for (let t = 0; t <= 600; t += frameMs) step(t)
      return deflection()
    }
    expect(at(20)).toBeCloseTo(at(5), 0)
    expect(Math.abs(at(5))).toBeLessThan(MAX_DEFLECTION_DEG * 0.25)
  })

  it('writes the arm only when it moves', () => {
    const { step, written } = rig(turn(36, 1000))
    step(0)
    step(16)
    expect(written).toEqual([])
    for (let t = 32; t <= 500; t += 16) step(t)
    expect(written.length).toBeGreaterThan(0)
  })

  it('clicks once per peg, at the track’s own speed', () => {
    const track = turn(36, 1000)
    const { step, click } = rig(track)
    for (let t = 0; t <= 1000; t += 16) step(t)
    const clicks = click.mock.calls.filter(([count]) => count > 0)
    expect(clicks).toHaveLength(1)
    expect(clicks[0][1]).toBeCloseTo(angleAt(track, 501) - angleAt(track, 500), 6)
  })

  it('lets the clock sleep once the wheel is held and the arm is upright', () => {
    const { step, waiting } = rig(turn(18, 500))
    for (let t = 0; t <= 2000; t += 16) step(t)
    expect(waiting()).toBe(false)
  })

  it('leaves the mix when stopped', () => {
    const { step, stop, deflection } = rig(turn(36, 1000))
    for (let t = 0; t <= 500; t += 16) step(t)
    stop()
    step(516)
    expect(deflection()).toBe(0)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/wheel/trackFlapper.test.ts`
Expected: FAIL with `Failed to resolve import "./trackFlapper"`.

- [ ] **Step 3: Retire `settledDeflection`**

In `src/wheel/flapper.ts`, delete `FALL_PER_FRAME` and `settledDeflection` with their comments, and
export the speed threshold:

```ts
/** Degrees of wheel per millisecond under which nothing is driving the arm. */
export const STILL_SPEED = 0.002
```

In `src/wheel/flapper.test.ts`, delete the whole `describe('settledDeflection', …)` block and drop
`settledDeflection` from the import.

- [ ] **Step 4: Write `trackFlapper`**

```ts
// src/wheel/trackFlapper.ts
import { spring } from '@msb235/blits'
import { type Motion, WHEEL, type WheelPose } from '../clock/motion'
import { STILL_SPEED, deflectionDeg, pegCrossings } from './flapper'

/** Critically damped and stiff: the arm follows a peg closely and falls in about 100 ms. */
const STIFFNESS = 2000
const DAMPING = 2 * Math.sqrt(STIFFNESS)

export type FlapperArm = {
  /** Where the pegs are now, as turns. Read each frame; the roster can change them. */
  pegs: () => number[]
  /** Puts the arm at `deg`. Called only when it moved. */
  write: (deg: number) => void
  /** `count` pegs went under the hinge, at `speed` degrees per millisecond. */
  click: (count: number, speed: number) => void
}

/**
 * Drives the flapper off the wheel mix's angle: aims a spring at the push the
 * nearest peg gives, or at upright once the wheel is still, and counts pegs for
 * the clicker. Returns the cleanup.
 */
export function trackFlapper({ ticker, wheel }: Motion, arm: FlapperArm): () => void {
  const swing = spring<string, WheelPose>('deflection', {
    to: 0,
    stiffness: STIFFNESS,
    damping: DAMPING,
  })
  const voice = wheel.cue({ patch: swing, subjects: [WHEEL] })
  let aim = 0
  let lastAngle: number | null = null
  let shown = 0

  const off = ticker.subscribe(() => {
    const pose = wheel.probe(WHEEL)
    const angle = pose.angle ?? 0
    const speed = pose.speed ?? 0
    const pegs = arm.pegs()

    const target = Math.abs(speed) > STILL_SPEED ? deflectionDeg(angle, pegs, speed) : 0
    if (target !== aim) {
      aim = target
      swing.to(WHEEL, target)
    }

    if (lastAngle !== null && angle !== lastAngle) {
      // The clicker rates its own volume off how fast, never which way.
      arm.click(pegCrossings(lastAngle, angle, pegs, speed), Math.abs(speed))
    }
    lastAngle = angle

    const deflection = pose.deflection ?? 0
    if (deflection !== shown) {
      shown = deflection
      arm.write(deflection)
    }
  })

  return () => {
    off()
    voice.fade({ over: 0 })
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/wheel/trackFlapper.test.ts src/wheel/flapper.test.ts`
Expected: PASS.

If "lifts the arm" fails low, the spring is lagging the peg: print `deflection()` and the target per
frame and raise `STIFFNESS`, keeping `DAMPING = 2 * Math.sqrt(STIFFNESS)`. If "lets the clock sleep"
fails, check `wheel.inert` after each step: a spring `to` with an unchanged target still counts as a
change in blits, so confirm the `target !== aim` guard is what is reached.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/flapper.ts src/wheel/flapper.test.ts src/wheel/trackFlapper.ts src/wheel/trackFlapper.test.ts
git commit -m "$(cat <<'EOF'
drive the flapper from the wheel mix with a spring that settles the same at any frame rate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Wheel writes its arm from the mix

**Files:**
- Modify: `src/wheel/Wheel.tsx`, `src/App.tsx`, `src/editor/Editor.tsx`
- Modify: `src/wheel/Wheel.test.tsx`, `src/transition/usePresence.test.tsx`
- Delete: `src/wheel/useWheelAngle.ts`, `src/wheel/useWheelAngle.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the flapper tests in `src/wheel/Wheel.test.tsx` (top-level `describe`), with
`import { Profiler } from 'react'`, `import { fakeMotion } from '../clock/testing'`,
`import { WHEEL } from '../clock/motion'` and `import { anglePatch } from './anglePatch'` added:

```ts
  it('moves the flapper arm without re-rendering the wheel', () => {
    const fake = fakeMotion()
    let renders = 0
    // A Profiler commits whenever the Wheel re-renders itself, not only when its parent does.
    const { container } = render(
      <Profiler id="wheel" onRender={() => renders++}>
        <Wheel motion={fake.motion} segments={segments} theme={wof} />
      </Profiler>,
    )
    const before = renders
    fake.motion.wheel.cue({
      patch: anglePatch({
        keyframes: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(720deg)' }],
        durationMs: 2000,
        easing: 'linear',
        to: 720,
      }),
      subjects: [WHEEL],
      start: 0,
      loop: false,
      hold: 'after',
    })
    fake.motion.ticker.wake()
    act(() => {
      for (let t = 0; t <= 1000; t += 16) fake.step(t)
    })
    const arm = container.querySelector('.wheel__flapper-arm')
    expect(arm?.getAttribute('transform')).toMatch(/^rotate\(-?[\d.]+\)$/)
    expect(renders).toBe(before)
  })
```

- [ ] **Step 2: Pass a motion to every test wheel**

Every `<Wheel` in `src/wheel/Wheel.test.tsx` and `src/transition/usePresence.test.tsx` gets the prop.
At the top of each file, after the imports:

```ts
import { fakeMotion } from '../clock/testing'

// Never stepped: these tests drive presence on their own rAF clock, not the motion's.
const { motion } = fakeMotion()
```

(`src/wheel/Wheel.test.tsx` already imports `fakeMotion` from Step 1; add only the `const`.) Then:

Run: `sed -i '' -E 's/<Wheel( |$)/<Wheel motion={motion}\1/' src/wheel/Wheel.test.tsx src/transition/usePresence.test.tsx`

and change the new test's `<Wheel motion={motion} motion={fake.motion}` back to
`<Wheel motion={fake.motion}` (the sed doubles it). Check: `grep -c "motion={motion} motion" src/wheel/Wheel.test.tsx` prints `0`.

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL on the new test: there is no `.wheel__flapper-arm`.

- [ ] **Step 4: Rewire the Wheel**

In `src/wheel/Wheel.tsx`:

Imports: remove `useWheelAngle`, `deflectionDeg`, `pegCrossings`, `settledDeflection` and `useState`;
add:

```ts
import type { Motion } from '../clock/motion'
import { trackFlapper } from './trackFlapper'
```

Props, first in `WheelProps`:

```ts
  /** The page's clock and mixes. The flapper reads the wheel's angle from it. */
  motion: Motion
```

and `motion,` first in the destructuring.

Replace everything from `const ownRotorRef = useRef<SVGGElement>(null)` through the end of the
`useWheelAngle(…)` call with:

```ts
  const hasFlapper = partOn(theme, 'flapper')
  const armRef = useRef<SVGGElement>(null)

  const clickerRef = useRef<ReturnType<typeof createClicker> | null>(null)
  // On demand and never during render, so a caller after a cleanup gets a live
  // clicker rather than the retired one a render had already handed out.
  const clicker = useCallback(() => {
    if (clickerRef.current === null) clickerRef.current = createClicker()
    return clickerRef.current
  }, [])

  // Read each frame, so a roster change or a look change reaches a running arm.
  const pegsRef = useRef(pegs)
  pegsRef.current = pegs
  const silentRef = useRef(theme.flapper === 'silent')
  silentRef.current = theme.flapper === 'silent'

  useEffect(() => {
    if (!hasFlapper) return
    return trackFlapper(motion, {
      pegs: () => pegsRef.current,
      write: (deg) => armRef.current?.setAttribute('transform', `rotate(${deg.toFixed(3)})`),
      click: (count, speed) => {
        if (!silentRef.current) clicker().click(count, speed)
      },
    })
  }, [motion, hasFlapper, clicker])
```

The rotor's `ref` callback no longer needs the own ref:

```tsx
            ref={(node) => {
              if (typeof rotorRef === 'function') rotorRef(node)
              else if (rotorRef) rotorRef.current = node
            }}
```

The flapper markup: the outer group keeps its place, an inner group carries the turn React never sets:

```tsx
      {hasFlapper && (
        <g
          className="wheel__flapper"
          transform={`translate(0 ${-(radius + theme.metrics.rimWidth + 20)})`}
        >
          <g className="wheel__flapper-arm" ref={armRef}>
            <rect x={-6} y={-10} width={12} height={11} rx={2.5} />
            <path
              d={`M -6.5 -1 L 6.5 -1 L 2.6 ${theme.metrics.rimWidth + 26} L -2.6 ${theme.metrics.rimWidth + 26} Z`}
            />
          </g>
        </g>
      )}
```

If `ownRotorRef` is now unused anywhere else in the file, delete its declaration.

- [ ] **Step 5: Pass the motion from App and Editor**

In `src/App.tsx` and `src/editor/Editor.tsx`, add `motion={motion}` as the first prop of `<Wheel`.

- [ ] **Step 6: Delete the readback**

```bash
git rm src/wheel/useWheelAngle.ts src/wheel/useWheelAngle.test.tsx
```

Run: `grep -rn "useWheelAngle\|angleOfMatrix\|settledDeflection" src`
Expected: no output.

- [ ] **Step 7: Check the styles still reach the arm**

Run: `grep -n "flapper" src/wheel/Wheel.css src/wheel/themes/*.ts`
Every selector that targets `.wheel__flapper rect` or `.wheel__flapper path` still matches, since the
shapes are descendants. A selector using the child combinator (`.wheel__flapper > rect`) does not:
change it to `.wheel__flapper-arm > rect`. Expected: no `>` selectors, nothing to change.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/wheel src/transition src/App.test.tsx src/editor`
Expected: PASS. `npx tsc --noEmit -p .` and `npx biome check src` exit 0.

- [ ] **Step 9: Look at it**

Use the `run` skill to start the dev server in the background, open `http://localhost:<port>/` with
the headless playwright MCP, pick a look with a flapper (`wof`), spin, and screenshot mid-spin and after
landing. Post both to the wall with `transom post <file>` (zone `wod`). Expected: the arm rides pegs
during the spin and stands upright after landing. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add -A src/wheel src/transition/usePresence.test.tsx src/App.tsx src/editor/Editor.tsx
git commit -m "$(cat <<'EOF'
write the flapper arm from the wheel mix and remove useWheelAngle

The arm no longer re-renders the Wheel each frame, and its fall back upright is
a spring rather than 1.5 degrees per frame, so it takes the same time at any
refresh rate.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Record phase 2 as built

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-blits-migration-design.md`, `docs/HANDOFF.md`
- Delete: this plan

- [ ] **Step 1: Update the spec**

In the opening paragraph, change "**Phases 1 and 3 built** (clock, outage visuals); phases 2, 4, 5 and 6
unbuilt, blocked on blits 0.4.0" to "**Phases 1, 2 and 3 built** (clock, wheel angle and flapper,
outage visuals); phases 4, 5 and 6 unbuilt".

In "Prerequisite", replace "**`inert` is agreed with blits but not built yet.**" with "Both shipped in
0.4.0."

Replace the **Flapper.** paragraph with:

```markdown
**Flapper.** `trackFlapper` aims a `spring` on `deflection` at `deflectionDeg` (the peg's push at the
current angle) while the wheel turns and at 0 once its speed is under `STILL_SPEED`, retargeting only
when the target changes. A subscriber writes the arm's `rotate()` onto `.wheel__flapper-arm` and counts
`pegCrossings` for the clicker, whose speed is the angle voice's `speed` channel: the track's analytic
slope. Arm and clicker both carry on while `dark`: the clicker is mechanical.
```

Replace the **Angle.** paragraph's last two sentences ("`angleAt` moves into the patch. The angle is
wrapped only where it is drawn.") with: "The patch also writes `speed`, the track's slope, 0 once the
track ends. Each of the rotor's WAAPI animations is given `startTime = startedAt`, the motion clock's
time, so the voice and the pixels share a start. The angle is wrapped only where it is drawn."

In the Wheel test table, replace the "Peg kick" row with
`| Peg lift | a peg coming under the hinge lifts the arm past half of MAX_DEFLECTION_DEG |`.

- [ ] **Step 2: Update the handoff**

In `docs/HANDOFF.md`, under State: phases 1, 2 and 3 are merged; blits is pinned at `0.4.0`. Under
Next: drop the phase 2 planning, so step 1 reads "Build phase 4 from
`docs/superpowers/plans/2026-10-03-blits-tricks.md`, then phase 5 from
`docs/superpowers/plans/2026-10-03-blits-transitions.md`." In Traps, change "Measured on blits 0.3.0, and
still true until checked against 0.4.0" to the result: re-run each of the four claims against 0.4.0 with
a scratch script and write down which still hold.

- [ ] **Step 3: Delete this plan**

```bash
git rm docs/superpowers/plans/2026-10-03-blits-wheel-angle.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-03-blits-migration-design.md docs/HANDOFF.md
git commit -m "$(cat <<'EOF'
record the wheel angle and flapper phase as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Run the full suite on the fleet**

After this lands on `main`, start the full suite with the `onto-test` skill
in the background and read its exit code when it finishes. If wod is not enlisted yet, enlist it with
`onto-enlist` first (it is item 2 of the handoff).
