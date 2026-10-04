# blits clock and outage visuals: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put wod on one blits-driven animation clock and move the outage's blackout, `dark` flag and sparks onto it, retiring their `setTimeout` and delayed-WAAPI schedulers.

**Architecture:** A ticker in `src/clock/` is the only `requestAnimationFrame` caller; it syncs a blits "wheel" mix each frame and notifies subscribers. The outage cues blits `keys` voices for `blackout` and `dark` on that mix, and fires its sparks from a ticker subscriber walking a precomputed cue list. Phases 1 and 3 of the spec; phases 2, 4, 5 and 6 wait for blits 0.4.0 and get their own plan.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + jsdom, Biome, `@msb235/blits` 0.3.0.

**Spec:** `docs/superpowers/specs/2026-10-03-blits-migration-design.md`

## Global Constraints

- `@msb235/blits` pinned exactly: `"@msb235/blits": "0.3.0"` (no caret).
- The ticker's time is `document.timeline.currentTime`, falling back to `performance.now()` where there is no document timeline (jsdom). Never call blits `rebase()`.
- `OutageRun.startedAt` and every `OutagePlan` field (`sparkAtMs`, `popAtMs`, `lightsAtMs`) stay as they are: ms on the `performance.now()` origin, plan fields relative to `startedAt`.
- No inline styles: per-frame values go through CSS custom properties (`style.setProperty('--name', …)`), as `--wedge-opacity` already does.
- US English in code, comments and commits. Biome style: single quotes, no semicolons, 2-space indent, 100 columns. Run `npm run check` before each commit.
- Comments only where a reader cannot get it from the code and would be hurt without it; 1–2 lines.

## Review Focus

- **A hidden tab during the spark build-up.** rAF stops while hidden, so on return every overdue spark would fire in one frame. Expected: shots more than `STALE_MS` (250) late are skipped, never burst. Pinned in Task 5.
- **A spark cue at exactly 0 ms** (`sparkAtMs` is 0 when `sparkMs` covers the whole prologue), with the ticker already running before `play` subscribes. Expected: it fires. A `(prev, t]` window would miss it; Task 5 uses a cursor instead, and tests it.
- **A second outage before the first finishes** (spin, reset, spin). Expected: the first run's blackout cover is removed and its voice faded at once, with no stacked covers. Pinned in Task 4.
- **The editor and the show page each mounting their own motion.** Expected: each owns its own ticker and mix; neither leaks frames after unmount. `useMotionRoot` holds no subscriptions of its own, so the clock sleeps once its users unsubscribe; Task 3 tests that unmounting `useOutageFx` after a run leaves no frame waiting.
- **`dark` after the voice ends.** A finished voice leaves the `dark` channel undefined. Expected: read as `false`, and the flapper is unmuted. Pinned in Task 3.

## Files

| File | Responsibility |
|---|---|
| `src/clock/ticker.ts` (new) | the single rAF loop: sync mixes, notify subscribers, sleep when idle |
| `src/clock/motion.ts` (new) | `wheelKit`, `WheelPose`, `WHEEL`, `createMotion`, `useMotionRoot` |
| `src/clock/testing.ts` (new) | `fakeMotion()`: a motion on a hand-stepped clock, for tests |
| `src/outage/voices.ts` (new) | `blackoutPatch(depth)`, `darkPatch(plan)` |
| `src/outage/cues.ts` (new) | `sparkCues(plan)`, `takeDue(...)`, `STALE_MS` |
| `src/outage/blackout.ts` | `cueBlackout(motion, startAt, depth, doc)` replaces `playBlackout` |
| `src/outage/blackout.css` | opacity from `--blackout` |
| `src/outage/fx.ts` | sparks from a ticker subscriber; blackout via `cueBlackout`; `FxOptions.motion` |
| `src/outage/useOutageFx.ts` | `dark` from the wheel mix; `motion` option |
| `src/App.tsx`, `src/editor/Editor.tsx` | own a motion with `useMotionRoot()` and pass it to `useOutageFx` |
| spec | record what this plan measured and changed |

---

### Task 1: Ticker

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/clock/ticker.ts`
- Test: `src/clock/ticker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Syncable = { sync(timestamp: number): void; readonly live: boolean }
  export type Frame = (t: number) => void
  export type TickerTiming = {
    now?: () => number
    raf?: (callback: FrameRequestCallback) => number
    caf?: (id: number) => void
  }
  export type Ticker = {
    now(): number
    subscribe(fn: Frame): () => void
    /** Keeps frames coming, live mixes or not, until the returned release is called. */
    stay(): () => void
    wake(): void
  }
  export function createTicker(mixes: readonly Syncable[], timing?: TickerTiming): Ticker
  ```

- [ ] **Step 1: Install blits pinned**

Run: `npm install --save-exact @msb235/blits@0.3.0`
Expected: `package.json` gains `"@msb235/blits": "0.3.0"` under `dependencies`.

- [ ] **Step 2: Write the failing tests**

`src/clock/ticker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createTicker } from './ticker'

function harness(live = false) {
  let t = 0
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  const mix = { sync: vi.fn(), live }
  const ticker = createTicker([mix], {
    now: () => t,
    raf: (cb) => {
      frames.set(++id, cb)
      return id
    },
    caf: (i) => frames.delete(i),
  })
  const step = (to: number) => {
    t = to
    const due = [...frames.values()]
    frames.clear()
    for (const cb of due) cb(to)
  }
  return { mix, ticker, step, waiting: () => frames.size }
}

describe('createTicker', () => {
  it('runs no frame until woken', () => {
    const { mix, step } = harness()
    step(16)
    expect(mix.sync).not.toHaveBeenCalled()
  })

  it('syncs every mix with the time, then tells subscribers', () => {
    const { mix, ticker, step } = harness()
    const order: string[] = []
    mix.sync.mockImplementation(() => order.push('sync'))
    ticker.subscribe((t) => order.push(`frame ${t}`))
    ticker.wake()
    step(16)
    expect(mix.sync).toHaveBeenCalledWith(16)
    expect(order).toEqual(['sync', 'frame 16'])
  })

  it('keeps going while a mix is live, and sleeps once none is', () => {
    const { mix, ticker, step, waiting } = harness(true)
    ticker.wake()
    step(16)
    expect(waiting()).toBe(1)
    mix.live = false
    step(32)
    expect(waiting()).toBe(0)
  })

  it('keeps going while held, whatever the mixes say', () => {
    const { ticker, step, waiting } = harness(false)
    const release = ticker.stay()
    step(16)
    step(32)
    expect(waiting()).toBe(1)
    release()
    release()
    step(48)
    expect(waiting()).toBe(0)
  })

  it('asks for one frame however often it is woken', () => {
    const { ticker, waiting } = harness()
    ticker.wake()
    ticker.wake()
    expect(waiting()).toBe(1)
  })

  it('stops telling a subscriber that left', () => {
    const { ticker, step } = harness()
    const fn = vi.fn()
    const off = ticker.subscribe(fn)
    off()
    ticker.wake()
    step(16)
    expect(fn).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `npx vitest run src/clock/ticker.test.ts`
Expected: FAIL, `Failed to resolve import "./ticker"`.

- [ ] **Step 4: Implement**

`src/clock/ticker.ts`:

```ts
export type Syncable = { sync(timestamp: number): void; readonly live: boolean }
export type Frame = (t: number) => void
export type TickerTiming = {
  now?: () => number
  raf?: (callback: FrameRequestCallback) => number
  caf?: (id: number) => void
}
export type Ticker = {
  now(): number
  subscribe(fn: Frame): () => void
  /** Keeps frames coming, live mixes or not, until the returned release is called. */
  stay(): () => void
  wake(): void
}

// The rotor's WAAPI animation runs on the document timeline; the mixes must read the same clock.
const timelineNow = () =>
  (globalThis.document?.timeline?.currentTime as number | null | undefined) ?? performance.now()

/** The app's one animation loop. Runs while any mix is live or anyone holds it; sleeps otherwise. */
export function createTicker(mixes: readonly Syncable[], timing: TickerTiming = {}): Ticker {
  const now = timing.now ?? timelineNow
  const raf = timing.raf ?? ((callback) => requestAnimationFrame(callback))
  const subscribers = new Set<Frame>()
  let holds = 0
  let pending: number | null = null

  const schedule = () => {
    if (pending === null) pending = raf(frame)
  }
  function frame() {
    pending = null
    const t = now()
    for (const mix of mixes) mix.sync(t)
    for (const fn of [...subscribers]) fn(t)
    if (holds > 0 || mixes.some((mix) => mix.live)) schedule()
  }

  return {
    now,
    subscribe(fn) {
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
    stay() {
      holds++
      schedule()
      let released = false
      return () => {
        if (released) return
        released = true
        holds--
      }
    },
    wake: schedule,
  }
}
```

`caf` stays in `TickerTiming` for `fakeMotion` (Task 2) to type against; the ticker itself never cancels a frame.

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run src/clock/ticker.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
npm run check
git add package.json package-lock.json src/clock/ticker.ts src/clock/ticker.test.ts
git commit -m "add one animation ticker that syncs blits mixes"
```

---

### Task 2: Wheel kit, motion and the test clock

**Files:**
- Create: `src/clock/motion.ts`, `src/clock/testing.ts`
- Test: `src/clock/motion.test.ts`

**Interfaces:**
- Consumes: `createTicker`, `Ticker`, `TickerTiming` (Task 1).
- Produces:
  ```ts
  export type WheelPose = { blackout?: number; dark?: boolean }
  export const WHEEL: 'wheel'
  export const wheelKit: Kit<WheelPose>
  export type Motion = { ticker: Ticker; wheel: Mix<string, WheelPose> }
  export function createMotion(timing?: TickerTiming): Motion
  export function useMotionRoot(): Motion
  // src/clock/testing.ts
  export function fakeMotion(): { motion: Motion; step(to: number): void; waiting(): boolean }
  ```

- [ ] **Step 1: Write the failing tests**

`src/clock/motion.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx vitest run src/clock/motion.test.ts`
Expected: FAIL, `Failed to resolve import "./motion"`.

- [ ] **Step 3: Implement**

`src/clock/motion.ts`:

```ts
import { type Kit, type Mix, kit, last, max, mix } from '@msb235/blits'
import { useState } from 'react'
import { type Ticker, type TickerTiming, createTicker } from './ticker'

export type WheelPose = { blackout?: number; dark?: boolean }

/** The wheel mix's one subject. */
export const WHEEL = 'wheel'

// blits' stock `last` flips halfway between stops; a schedule means the stop itself.
const atStop = <V>(a: V, b: V, u: number): V => (u < 1 ? a : b)

export const wheelKit: Kit<WheelPose> = kit<WheelPose>({
  blackout: max(),
  dark: last<boolean>({ lerp: atStop }),
})

export type Motion = { ticker: Ticker; wheel: Mix<string, WheelPose> }

export function createMotion(timing?: TickerTiming): Motion {
  const wheel = mix<string, WheelPose>(wheelKit)
  return { ticker: createTicker([wheel], timing), wheel }
}

/** One motion per page, made on first render. Its owners unsubscribe; it holds nothing itself. */
export function useMotionRoot(): Motion {
  const [motion] = useState(() => createMotion())
  return motion
}
```

`src/clock/testing.ts`:

```ts
import { type Motion, createMotion } from './motion'

/** A motion on a clock that moves only when the test steps it. */
export function fakeMotion() {
  let t = 0
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const motion: Motion = createMotion({
    now: () => t,
    raf: (callback) => {
      frames.set(++id, callback)
      return id
    },
    caf: (i) => frames.delete(i),
  })
  return {
    motion,
    /** Moves the clock to `to` and runs the frame waiting, if there is one. */
    step(to: number) {
      t = to
      const due = [...frames.values()]
      frames.clear()
      for (const callback of due) callback(to)
    },
    waiting: () => frames.size > 0,
  }
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/clock`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/clock/motion.ts src/clock/testing.ts src/clock/motion.test.ts
git commit -m "add the wheel mix and a hand-stepped test clock"
```

---

### Task 3: `dark` from the wheel mix

**Files:**
- Create: `src/outage/voices.ts`
- Modify: `src/outage/useOutageFx.ts`, `src/App.tsx:124-132`, `src/editor/Editor.tsx:153-156`
- Test: `src/outage/voices.test.ts`, `src/outage/useOutageFx.test.tsx`

**Interfaces:**
- Consumes: `Motion`, `WHEEL`, `WheelPose`, `useMotionRoot` (Task 2); `fakeMotion` (Task 2).
- Produces:
  ```ts
  // src/outage/voices.ts
  export function darkPatch(plan: OutagePlan): Patch<string, WheelPose, void>
  export function blackoutPatch(depth: number): Patch<string, WheelPose, void>
  // src/outage/useOutageFx.ts — options gain:
  motion: Motion
  ```

- [ ] **Step 1: Write the failing voice tests**

`src/outage/voices.test.ts`:

```ts
import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { WHEEL, type WheelPose, wheelKit } from '../clock/motion'
import { blackoutPatch, darkPatch } from './voices'
import { blackoutKeyframes, blackoutMs } from './schedule'

const plan = { sparkAtMs: 0, popAtMs: 500, lightsAtMs: 900, resumedAtMs: 900 }

function reader(patch: ReturnType<typeof darkPatch>) {
  const wheel = mix<string, WheelPose>(wheelKit)
  wheel.cue({ patch, subjects: [WHEEL], start: 0, loop: false })
  return (t: number) => {
    wheel.sync(t)
    return wheel.probe(WHEEL)
  }
}

describe('darkPatch', () => {
  it('is dark from the pop until the lights, to the millisecond', () => {
    const read = reader(darkPatch(plan))
    expect([499, 500, 899, 900].map((t) => read(t).dark ?? false)).toEqual([
      false,
      true,
      true,
      false,
    ])
  })
})

describe('blackoutPatch', () => {
  it('lands on every blackout keyframe', () => {
    const read = reader(blackoutPatch(0.6))
    const total = blackoutMs()
    for (const frame of blackoutKeyframes(0.6)) {
      const t = (frame.offset as number) * total
      if (t >= total) continue
      expect(read(t).blackout).toBeCloseTo(Number(frame.opacity), 9)
    }
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/outage/voices.test.ts`
Expected: FAIL, `Failed to resolve import "./voices"`.

- [ ] **Step 3: Implement the patches**

`src/outage/voices.ts`:

```ts
import { type Patch, keys } from '@msb235/blits'
import type { WheelPose } from '../clock/motion'
import type { OutagePlan } from '../wheel/outage'
import { blackoutKeyframes, blackoutMs } from './schedule'

/** Over the spin from its start: lit, dark from the pop, lit again when the lights come back. */
export function darkPatch(plan: OutagePlan): Patch<string, WheelPose, void> {
  return keys<string, WheelPose>(plan.lightsAtMs, [
    { at: 0, delta: { dark: false } },
    { at: plan.popAtMs / plan.lightsAtMs, delta: { dark: true } },
    { at: 1, delta: { dark: false } },
  ])
}

/** The blackout's opacity from the pop, over `blackoutMs()`. */
export function blackoutPatch(depth: number): Patch<string, WheelPose, void> {
  return keys<string, WheelPose>(
    blackoutMs(),
    blackoutKeyframes(depth).map((frame) => ({
      at: frame.offset as number,
      delta: { blackout: Number(frame.opacity) },
    })),
  )
}
```

- [ ] **Step 4: Run them to make sure they pass**

Run: `npx vitest run src/outage/voices.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Rewrite the hook's `dark` tests against the fake clock**

In `src/outage/useOutageFx.test.tsx`, change `render` to take a motion, and replace the test `'reports the room dark from the pop until the lights come back'` with the two below. Leave the other tests' bodies as they are; they only gain the motion through `render`.

```ts
import { fakeMotion } from '../clock/testing'
import type { Motion } from '../clock/motion'

function render(initial: OutageRun | null, create: () => Fx, motion: Motion = fakeMotion().motion) {
  const targetRef = { current: document.createElement('div') }
  return renderHook(
    ({ run, muted }) =>
      useOutageFx(run, { targetRef, depth: 1, sound: true, muted, create, motion }),
    { initialProps: { run: initial, muted: false } },
  )
}
```

```ts
  it('reports the room dark from the pop until the lights come back', () => {
    const { create } = fake()
    const clock = fakeMotion()
    const view = render(runOf(1), create, clock.motion)
    act(() => clock.step(plan.popAtMs - 1))
    expect(view.result.current).toBe(false)
    act(() => clock.step(plan.popAtMs))
    expect(view.result.current).toBe(true)
    act(() => clock.step(plan.lightsAtMs))
    expect(view.result.current).toBe(false)
  })

  it('stays lit once the run is over, and lets the clock sleep', () => {
    const { create } = fake()
    const clock = fakeMotion()
    const view = render(runOf(1), create, clock.motion)
    act(() => clock.step(plan.popAtMs))
    act(() => clock.step(plan.lightsAtMs + 1000))
    expect(view.result.current).toBe(false)
    view.unmount()
    expect(clock.waiting()).toBe(false)
  })
```

`runOf` keeps `startedAt: 0`, so plan times are clock times.

- [ ] **Step 6: Run them to make sure they fail**

Run: `npx vitest run src/outage/useOutageFx.test.tsx`
Expected: FAIL. TypeScript-wise `motion` is an unknown option; at runtime the dark tests fail because the hook still uses timers.

- [ ] **Step 7: Drive `dark` from the mix**

In `src/outage/useOutageFx.ts`: add `motion: Motion` to `UseOutageFxOptions` (import `type Motion, WHEEL` from `'../clock/motion'`, `darkPatch` from `'./voices'`), destructure it, and replace the timer effect with:

```ts
  useEffect(() => {
    if (!run) return
    const { ticker, wheel } = motion
    const voice = wheel.cue({
      patch: darkPatch(run.plan),
      subjects: [WHEEL],
      start: run.startedAt,
      loop: false,
    })
    const off = ticker.subscribe(() => setDark(wheel.probe(WHEEL).dark ?? false))
    ticker.wake()
    return () => {
      off()
      voice.fade({ over: 0 })
      setDark(false)
    }
  }, [run, motion])
```

Pass `motion` into the play options too, ahead of Task 4, by changing the play line to `fx.current.play(run, { target, motion, ...settings.current })` and adding `motion` to that effect's dependency list. `FxOptions` gains the field in Task 4; until then add it now to `FxOptions` in `src/outage/fx.ts` as `motion: Motion` (import `type Motion` from `'../clock/motion'`), unused by `fx.ts` yet.

- [ ] **Step 8: Give App and Editor a motion**

`src/App.tsx`: import `useMotionRoot` from `'./clock/motion'`; above the `useOutageFx` call add `const motion = useMotionRoot()` and pass `motion` in its options.

`src/editor/Editor.tsx`: import `useMotionRoot` from `'../clock/motion'`; replace line 156 with:

```ts
  const motion = useMotionRoot()
  useOutageFx(outage, { targetRef: wheelRef, depth: 0.6, sound: false, muted: true, motion })
```

- [ ] **Step 9: Run the affected tests**

Run: `npx vitest run src/outage src/clock src/App.test.tsx src/editor/Editor.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
npm run check
git add src/outage/voices.ts src/outage/voices.test.ts src/outage/useOutageFx.ts src/outage/useOutageFx.test.tsx src/outage/fx.ts src/App.tsx src/editor/Editor.tsx
git commit -m "say the room is dark from the wheel mix instead of two timers"
```

---

### Task 4: Blackout cover on the wheel mix

**Files:**
- Modify: `src/outage/blackout.ts`, `src/outage/blackout.css`, `src/outage/fx.ts:92`
- Test: `src/outage/blackout.test.ts` (new)

**Interfaces:**
- Consumes: `Motion`, `WHEEL` (Task 2); `blackoutPatch` (Task 3); `fakeMotion` (Task 2).
- Produces:
  ```ts
  export type Blackout = { stop(): void }
  export function cueBlackout(motion: Motion, startAt: number, depth: number, doc?: Document): Blackout
  ```
  `playBlackout` is deleted.

- [ ] **Step 1: Write the failing tests**

`src/outage/blackout.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fakeMotion } from '../clock/testing'
import { cueBlackout } from './blackout'
import { blackoutKeyframes, blackoutMs } from './schedule'

const cover = () => document.querySelector<HTMLElement>('.outage-blackout')
const level = () => Number(cover()?.style.getPropertyValue('--blackout'))

describe('cueBlackout', () => {
  it('covers the window and follows the schedule from its start', () => {
    const { motion, step } = fakeMotion()
    const blackout = cueBlackout(motion, 1000, 1)
    expect(cover()).not.toBeNull()
    const frame = blackoutKeyframes(1)[5]
    step(1000 + (frame.offset as number) * blackoutMs())
    expect(level()).toBeCloseTo(Number(frame.opacity), 9)
    blackout.stop()
  })

  it('takes the cover down when it ends, and lets the clock sleep', async () => {
    const { motion, step, waiting } = fakeMotion()
    cueBlackout(motion, 0, 1)
    step(blackoutMs() / 2)
    step(blackoutMs())
    await vi.waitFor(() => expect(cover()).toBeNull())
    step(blackoutMs() + 16)
    expect(waiting()).toBe(false)
  })

  it('stops at once, cover and all', () => {
    const { motion, step, waiting } = fakeMotion()
    const blackout = cueBlackout(motion, 0, 1)
    step(100)
    blackout.stop()
    expect(cover()).toBeNull()
    step(116)
    expect(waiting()).toBe(false)
  })

  it('leaves one cover when a newer outage cuts an older one short', () => {
    const { motion, step } = fakeMotion()
    const first = cueBlackout(motion, 0, 1)
    step(100)
    first.stop()
    const second = cueBlackout(motion, 100, 1)
    expect(document.querySelectorAll('.outage-blackout')).toHaveLength(1)
    second.stop()
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/outage/blackout.test.ts`
Expected: FAIL, `cueBlackout` is not exported.

- [ ] **Step 3: Implement**

Replace `src/outage/blackout.ts` with:

```ts
import { type Motion, WHEEL } from '../clock/motion'
import { blackoutPatch } from './voices'
import './blackout.css'

export type Blackout = { stop(): void }

/**
 * Blacks out the window from `startAt` on the motion's clock, flickers it on the
 * schedule, and lifts it on the chord. `depth` is how dark it gets: 1 on the show page.
 */
export function cueBlackout(
  motion: Motion,
  startAt: number,
  depth: number,
  doc: Document = document,
): Blackout {
  const { ticker, wheel } = motion
  const cover = doc.createElement('div')
  cover.className = 'outage-blackout'
  cover.setAttribute('aria-hidden', 'true')
  doc.body.appendChild(cover)

  const voice = wheel.cue({ patch: blackoutPatch(depth), subjects: [WHEEL], start: startAt, loop: false })
  const release = ticker.stay()
  const off = ticker.subscribe(() => {
    cover.style.setProperty('--blackout', String(wheel.probe(WHEEL).blackout ?? 0))
  })

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    off()
    release()
    voice.fade({ over: 0 })
    cover.remove()
  }
  void voice.done.then(stop)
  return { stop }
}
```

`src/outage/blackout.css`: replace `opacity: 0;` with `opacity: var(--blackout, 0);`.

`src/outage/fx.ts`: change the import to `import { cueBlackout } from './blackout'` and line 92 to:

```ts
      const blackout = cueBlackout(options.motion, run.startedAt + plan.popAtMs, options.depth)
```

- [ ] **Step 4: Run them to make sure they pass**

Run: `npx vitest run src/outage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/outage/blackout.ts src/outage/blackout.css src/outage/blackout.test.ts src/outage/fx.ts
git commit -m "play the outage blackout from the wheel mix"
```

---

### Task 5: Sparks on the ticker

**Files:**
- Create: `src/outage/cues.ts`
- Modify: `src/outage/fx.ts:58-90` (the `timers`/`at` scheduling and the spark block), and its stop function
- Test: `src/outage/cues.test.ts`

**Interfaces:**
- Consumes: `OutagePlan` (`src/wheel/outage.ts`); `escalation`, `BLOW_MS`, `Shot` (`src/outage/schedule.ts`); `Motion` (Task 2).
- Produces:
  ```ts
  export const STALE_MS = 250
  export type SparkCue =
    | { at: number; kind: 'fault' }
    | { at: number; kind: 'shot'; shot: Shot; sparkMs: number }
    | { at: number; kind: 'blow'; sparkMs: number }
  export function sparkCues(plan: OutagePlan): SparkCue[]
  export function takeDue<T extends { at: number }>(
    cues: readonly T[], cursor: number, elapsed: number, staleMs: number,
  ): { fire: T[]; cursor: number }
  ```

- [ ] **Step 1: Write the failing tests**

`src/outage/cues.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STALE_MS, sparkCues, takeDue } from './cues'
import { BLOW_MS, escalation } from './schedule'

const plan = { sparkAtMs: 2000, popAtMs: 8000, lightsAtMs: 19000, resumedAtMs: 21000 }

describe('sparkCues', () => {
  it('starts the fault, plays the escalation, and blows before the pop', () => {
    const cues = sparkCues(plan)
    const sparkMs = plan.popAtMs - plan.sparkAtMs
    expect(cues[0]).toEqual({ at: 2000, kind: 'fault' })
    expect(cues.filter((cue) => cue.kind === 'shot')).toHaveLength(escalation(sparkMs).length)
    expect(cues.at(-1)).toEqual({ at: plan.popAtMs - BLOW_MS, kind: 'blow', sparkMs })
  })

  it('is in time order', () => {
    const times = sparkCues(plan).map((cue) => cue.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('takeDue', () => {
  const cues = [{ at: 0 }, { at: 100 }, { at: 200 }, { at: 300 }]

  it('fires a cue at 0 on the first frame, however late that frame starts', () => {
    expect(takeDue(cues, 0, 5, STALE_MS).fire).toEqual([{ at: 0 }])
  })

  it('fires each cue once across frames', () => {
    let cursor = 0
    const fired: number[] = []
    for (const elapsed of [50, 150, 150, 250, 400]) {
      const due = takeDue(cues, cursor, elapsed, STALE_MS)
      cursor = due.cursor
      fired.push(...due.fire.map((cue) => cue.at))
    }
    expect(fired).toEqual([0, 100, 200, 300])
  })

  it('skips cues gone stale, as after a hidden tab, without bursting them', () => {
    const due = takeDue(cues, 0, 450, STALE_MS)
    expect(due.fire).toEqual([{ at: 300 }])
    expect(due.cursor).toBe(4)
  })

  it('waits for a cue still ahead', () => {
    expect(takeDue(cues, 1, 99, STALE_MS)).toEqual({ fire: [], cursor: 1 })
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/outage/cues.test.ts`
Expected: FAIL, `Failed to resolve import "./cues"`.

- [ ] **Step 3: Implement the cue list**

`src/outage/cues.ts`:

```ts
import type { OutagePlan } from '../wheel/outage'
import { BLOW_MS, type Shot, escalation } from './schedule'

/** A spark more than this late is skipped: a hidden tab must not come back to a burst. */
export const STALE_MS = 250

export type SparkCue =
  | { at: number; kind: 'fault' }
  | { at: number; kind: 'shot'; shot: Shot; sparkMs: number }
  | { at: number; kind: 'blow'; sparkMs: number }

/** Every spark effect of one outage, in ms from the spin's start, in time order. */
export function sparkCues(plan: OutagePlan): SparkCue[] {
  const sparkMs = plan.popAtMs - plan.sparkAtMs
  const cues: SparkCue[] = [{ at: plan.sparkAtMs, kind: 'fault' }]
  for (const shot of escalation(sparkMs)) {
    cues.push({ at: plan.sparkAtMs + shot.at, kind: 'shot', shot, sparkMs })
  }
  cues.push({ at: Math.max(plan.sparkAtMs, plan.popAtMs - BLOW_MS), kind: 'blow', sparkMs })
  return cues.sort((a, b) => a.at - b.at)
}

/** The cues from `cursor` that are due at `elapsed`, minus those more than `staleMs` late. */
export function takeDue<T extends { at: number }>(
  cues: readonly T[],
  cursor: number,
  elapsed: number,
  staleMs: number,
): { fire: T[]; cursor: number } {
  const fire: T[] = []
  let next = cursor
  while (next < cues.length && cues[next].at <= elapsed) {
    if (elapsed - cues[next].at <= staleMs) fire.push(cues[next])
    next++
  }
  return { fire, cursor: next }
}
```

`sort` is stable, so the fault (pushed first) stays ahead of a shot at the same time.

- [ ] **Step 4: Run them to make sure they pass**

Run: `npx vitest run src/outage/cues.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Fire the sparks from the ticker**

In `src/outage/fx.ts`: import `{ STALE_MS, type SparkCue, sparkCues, takeDue }` from `'./cues'`; drop the `escalation` import (`BLOW_MS` stays; the blow branch uses it). Inside `play`, delete `timers`, `at`, and the block from `let fault` through the `fault?.blow` call, and put in its place:

```ts
      let fault: ReturnType<Overlay['fault']> | null = null
      const fire = (cue: SparkCue) => {
        if (cue.kind === 'fault') fault = sparks.fault({ at: next(), to: next(), intensity: 0.1 })
        else if (cue.kind === 'blow') fault?.blow({ peak: Math.min(BLOW_MS, cue.sparkMs), after: 400 })
        else {
          const { shot, sparkMs } = cue
          if (fault) fault.intensity = Math.min(0.9, 0.1 + (0.8 * shot.at) / sparkMs)
          if (shot.kind === 'arc') sparks.arc(next(), next(), shot.energy)
          else sparks[shot.kind](next(), shot.energy)
        }
      }
      const cues = sparkCues(plan)
      let cursor = 0
      const { ticker } = options.motion
      const release = ticker.stay()
      const off = ticker.subscribe((t) => {
        const due = takeDue(cues, cursor, t - run.startedAt, STALE_MS)
        cursor = due.cursor
        for (const cue of due.fire) fire(cue)
        if (cursor === cues.length) {
          off()
          release()
        }
      })
```

In the returned stop function replace `for (const timer of timers) window.clearTimeout(timer)` with:

```ts
        off()
        release()
```

(`release` is idempotent from Task 1; `off` is a `Set.delete`, so calling either twice is harmless.)

- [ ] **Step 6: Run the outage tests and the type check**

Run: `npx vitest run src/outage src/clock && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
npm run check
git add src/outage/cues.ts src/outage/cues.test.ts src/outage/fx.ts
git commit -m "fire the outage sparks from the animation ticker"
```

---

### Task 6: See it run, and bring the spec up to date

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-blits-migration-design.md`

- [ ] **Step 1: Build and run the whole local check**

Run: `npm run build && npx vitest run src/outage src/clock src/App.test.tsx src/editor/Editor.test.tsx`
Expected: build succeeds; tests PASS. (The full suite runs on the fleet after merge, not here.)

- [ ] **Step 2: Watch an outage in the real app**

Start `npm run dev -- --host ::` in the background. With the headless Playwright MCP, open `http://localhost:5173/#/outage`, click the Spin button, and take screenshots at about 1 s into the sparks, just after the pop (dark), and after the lights return. Post each with `transom post <file>` to the `wod` zone. Expected: sparks on the rim before the pop; the window dark with flickers after it; the cover gone (no `.outage-blackout` in the DOM) once the lights are up; no console errors. Stop the dev server afterwards.

- [ ] **Step 3: Record what changed in the spec**

Edit the spec:
- In **Structure**, replace `MotionProvider.tsx  React context: { ticker, wedges, wheel }` with `motion.ts  wheelKit, createMotion, useMotionRoot` and note that each page owns one motion through `useMotionRoot()`; the React context and the wedge mix arrive with phase 4, where the wheel's children first need them.
- In **The wheel → Outage visuals**, replace the sparks row with: `fx.ts` `setTimeout` sparks → a precomputed cue list fired by a ticker subscriber with a cursor; cues more than 250 ms late are skipped. Add one sentence of why: measured on 0.3.0, a mix without `history` drops announced marks once `sync` passes them, so `marks(prev, t)` after `sync(t)` returns nothing.
- In **Open points**, delete the `announce`/`marks` bullet (settled above).
- Change the `dark` channel line in the kits table to `dark: last()` with a lerp that steps at the stop (stock `last` steps at the midpoint between stops; measured).
- Change the status line at the top to: "Phases 1 and 3 built (clock, outage visuals); phases 2, 4, 5 and 6 unbuilt, blocked on blits 0.4.0."

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-03-blits-migration-design.md
git commit -m "record the built clock and outage phases in the blits design"
```
