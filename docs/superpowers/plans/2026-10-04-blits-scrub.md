# Editor Scrub Over the Whole Show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The editor's scrub slider shows the whole planned spin — rotation, outage prologue, trick morphs, blackout, flapper — at any instant, silently, forward or backward.

**Architecture:** Phase 6 of `docs/superpowers/specs/2026-10-03-blits-migration-design.md`. `useSpin` gains `preview()`, which plans the spin a press of Spin would make (fixed draw, authored duration, from the current resting angle) through the same `planShow` the live spin uses, and `pose(track, ms)`, which seeks paused WAAPI copies of the rotor, rider and level tracks. `recordShow` cues the same voices on a manual-clock motion whose mixes keep `history`, runs the real `trackFlapper` against it at 60 fps once, and then answers `at(ms)` with `project(ms)` on both mixes. The editor paints the result through the existing writers: segments to the Wheel, deflection to the arm, blackout to a cover.

**Tech Stack:** React 19, TypeScript, vitest + jsdom, `@msb235/blits` 0.4.0.

**Measured before planning** (blits 0.4.0, jsdom, a 20.4 s outage show with 6 morphs on 12 wedges): recording both mixes with `history` at 60 fps takes 35–55 ms; a projection of both mixes takes 0.1 ms; a projection at a recorded frame equals the live probe exactly, deflection included, and reading 3 s back and returning gives the same frame.

## Departures from the spec, decided here

- The rotor is seeked, not canceled and written: paused WAAPI copies of the rotor, rider and level tracks, at `currentTime = ms`. Writing the rotor's transform alone would leave level groups and the hub rider on the landed angle. The landed spin's fill-forward animations stay underneath, so canceling the copies restores rest.
- The preview draws its winner with a fixed rng (`0.5`), so the scrubbed show does not change between recordings. It starts from the wheel's current resting angle, so `0` matches what is on screen.
- The preview plays at the authored duration regardless of reduced motion: it is the show being authored.

## Files

| File | Change |
|---|---|
| `src/wheel/show.ts` | new: `planShow`, the spin plan shared by `spin()` and `preview()` |
| `src/wheel/anglePatch.ts` | add `angleVoice(track, start)` |
| `src/outage/voices.ts` | add `darkVoice(plan, start)`, `blackoutVoice(depth, start)` |
| `src/outage/blackout.ts` | split out `createBlackoutCover(doc)` |
| `src/clock/motion.ts` | `createMotion(timing, { historyMs })` |
| `src/clock/manual.ts` | new: `manualMotion`, the hand-stepped clock (was `fakeMotion` in `testing.ts`) |
| `src/clock/compose.ts` | `composeSegments` takes anything with `probe` |
| `src/editor/recordShow.ts` | new: `recordShow(show, options): Recording` |
| `src/wheel/useSpin.ts` | use `planShow`; add `preview()` and `pose()` |
| `src/wheel/Wheel.tsx` | `flapperDeg?: number` prop |
| `src/editor/Transport.tsx` | controlled slider over the whole show in ms |
| `src/editor/useScrub.ts` | new: owns the scrub position and paints a recording |
| `src/editor/Editor.tsx` | wire `useScrub` |

---

### Task 1: `planShow`

**Files:** Create `src/wheel/show.ts`, `src/wheel/show.test.ts`. Modify `src/wheel/useSpin.ts` (the body of `spin` from `planSpin` to `outagePlan`).

- [ ] **Step 1: Failing test** — `src/wheel/show.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { landingSegments } from './morph'
import { planShow } from './show'
import type { Segment, SpinConfig } from './types'

const segments: Segment[] = [
  { id: 'a', label: 'A', weight: 1 },
  { id: 'b', label: 'B', weight: 1 },
]
const config: SpinConfig = {
  durationMs: 4000, fullSpins: 3, direction: 'cw', easing: [0.2, 0.8, 0.3, 1], morphs: [],
}
const half = () => 0.5

describe('planShow', () => {
  it('turns from the given angle to the planned rest', () => {
    const show = planShow({ segments, config, rng: half, from: 90, durationMs: 4000 })
    expect(show?.track.keyframes[0].transform).toBe('rotate(90deg)')
    expect(show?.outagePlan).toBeNull()
    expect(show?.morphsAt).toBe(0)
  })

  it('prefixes an outage and starts the morphs once the wheel resumes', () => {
    const show = planShow({
      segments, config: { ...config, outage: { cruiseMs: 1000, sparkMs: 500 } },
      rng: half, from: 0, durationMs: 4000,
    })
    expect(show?.outagePlan).not.toBeNull()
    expect(show?.morphsAt).toBe(show?.outagePlan?.resumedAtMs)
    expect(show?.track.durationMs).toBe((show?.outagePlan?.resumedAtMs ?? 0) + 4000)
  })

  it('lands on the late morphs when a swap resolves them', () => {
    const late = [{ segmentId: 'a', durationMs: 4000, keyframes: [{ at: 1, label: 'Z' }] }]
    const show = planShow({
      segments, config, rng: half, from: 0, durationMs: 4000, resolveLate: () => late,
    })
    expect(show?.morphs).toBe(late)
    expect(show?.landedFrame).toEqual(landingSegments(segments, late, 4000))
  })
})
```

- [ ] **Step 2:** `npx vitest run src/wheel/show.test.ts` — FAIL, no module.
- [ ] **Step 3: Implement** — `src/wheel/show.ts`

```ts
import { landingSegments } from './morph'
import { type OutagePlan, withOutage } from './outage'
import type { PegMode } from './pegs'
import { type RotationTrack, rotationTrack } from './rotation'
import { type Rng, type SelectionStrategy, weightedRandom } from './selection'
import { type SpinPlan, planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

export type ShowInput = {
  segments: Segment[]
  config: SpinConfig
  strategy?: SelectionStrategy
  rng: Rng
  /** Where the wheel rests now. */
  from: number
  /** How long the authored spin plays: the config's, or shorter under reduced motion. */
  durationMs: number
  /** Whether the outage prologue may play. Reduced motion is spared it. */
  outage?: boolean
  resolveLate?: (winnerId: string) => Morph[]
  catchPegs?: PegMode
}

/** One spin, planned: who wins, how the wheel turns there, and what plays on the way. */
export type Show = {
  plan: SpinPlan
  segments: Segment[]
  morphs: Morph[]
  landedFrame: Segment[]
  track: RotationTrack
  outagePlan: OutagePlan | null
  /** When the morphs start, ms from the start of the show. */
  morphsAt: number
}

export function planShow(input: ShowInput): Show | null {
  const { segments, config, rng, from, durationMs } = input
  const plan = planSpin(segments, config, input.strategy ?? weightedRandom, rng, input.catchPegs)
  if (!plan) return null
  const late = input.resolveLate?.(plan.winnerId)
  const morphs = late ?? config.morphs
  // plan.landing was sampled from pass 1 and still shows the pre-swap labels;
  // landing on it would undo the trick as it fires.
  const landedFrame = late ? landingSegments(segments, late, config.durationMs) : plan.landing
  const planned = rotationTrack(from, plan.restingRotationDeg, config, durationMs)
  const outaged =
    config.outage && (input.outage ?? true) && durationMs > 0
      ? withOutage(planned, config.outage)
      : null
  return {
    plan,
    segments,
    morphs,
    landedFrame,
    track: outaged?.track ?? planned,
    outagePlan: outaged?.plan ?? null,
    morphsAt: outaged?.plan.resumedAtMs ?? 0,
  }
}
```

In `useSpin.spin`, replace the `planSpin` … `outagePlan` block with one `planShow` call (`rng: cryptoRng`, `from: rotationRef.current`, `outage: !reduceMotion`), computing `reduceMotion`/`durationMs` first, and read `plan`, `morphs`, `landedFrame`, `track`, `outagePlan` from the show. The morph cue uses `startedAt + show.morphsAt`.

- [ ] **Step 4:** `npx vitest run src/wheel/show.test.ts src/wheel/useSpin.test.ts` — PASS.
- [ ] **Step 5:** commit `plan a spin's show in one function the live spin and the preview share`.

### Task 2: Shared voice specs

**Files:** `src/wheel/anglePatch.ts`, `src/outage/voices.ts`, callers in `useSpin.ts`, `useOutageFx.ts`, `blackout.ts`; tests beside each.

- [ ] **Step 1: Failing tests** — in `anglePatch.test.ts`:

```ts
it('cues as a one-pass voice holding its rest', () => {
  const spec = angleVoice(track, 500)
  expect(spec).toMatchObject({ subjects: [WHEEL], start: 500, loop: false, hold: 'after' })
})
```

in `voices.test.ts`:

```ts
it('cues dark from the start of the spin and blackout from the pop', () => {
  expect(darkVoice(plan, 100)).toMatchObject({ subjects: [WHEEL], start: 100, loop: false })
  expect(blackoutVoice(0.6, 900)).toMatchObject({ subjects: [WHEEL], start: 900, loop: false })
})
```

- [ ] **Step 2:** run both — FAIL.
- [ ] **Step 3: Implement**

```ts
// anglePatch.ts
export function angleVoice(track: RotationTrack, start: number): VoiceSpec<string, WheelPose> {
  return { patch: anglePatch(track), subjects: [WHEEL], start, loop: false, hold: 'after' }
}
// voices.ts
export const darkVoice = (plan: OutagePlan, start: number): VoiceSpec<string, WheelPose> => ({
  patch: darkPatch(plan), subjects: [WHEEL], start, loop: false,
})
export const blackoutVoice = (depth: number, start: number): VoiceSpec<string, WheelPose> => ({
  patch: blackoutPatch(depth), subjects: [WHEEL], start, loop: false,
})
```

Replace the three inline `wheel.cue({...})` literals with `wheel.cue(angleVoice(track, startedAt))`, `wheel.cue(darkVoice(run.plan, run.startedAt))`, `wheel.cue(blackoutVoice(depth, startAt))`.

- [ ] **Step 4:** `npx vitest run src/wheel src/outage` — PASS.
- [ ] **Step 5:** commit `build the angle, dark and blackout voices in one place each`.

### Task 3: Motion with history, a manual clock, and a cover of its own

**Files:** `src/clock/motion.ts`, new `src/clock/manual.ts`, `src/clock/testing.ts`, `src/clock/compose.ts`, `src/outage/blackout.ts`; tests `motion.test.ts`, `blackout.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
// motion.test.ts
it('reads back over a show when made with history', () => {
  const { motion, step } = manualMotion({ historyMs: 10_000 })
  motion.wheel.cue({ patch: blackoutPatch(1), subjects: [WHEEL], start: 0, loop: false })
  const release = motion.ticker.stay()
  for (let t = 0; t <= 2000; t += 16) step(t)
  release()
  expect(motion.wheel.project(400).probe(WHEEL).blackout).toBeGreaterThan(0)
})
// blackout.test.ts
it('makes a cover that sets its own darkness and leaves', () => {
  const cover = createBlackoutCover(document)
  cover.set(0.4)
  const node = document.querySelector('.outage-blackout') as HTMLElement
  expect(node.style.getPropertyValue('--blackout')).toBe('0.4')
  cover.remove()
  expect(document.querySelector('.outage-blackout')).toBeNull()
})
```

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement**

`motion.ts`: `export type MotionOptions = { historyMs?: number }`; `createMotion(timing?, { historyMs }: MotionOptions = {})` passes `historyMs ? { history: { ms: historyMs } } : {}` as the second argument of both `mix(...)` calls.

`manual.ts`: the body of today's `fakeMotion`, renamed `manualMotion(options?: MotionOptions)` and passing `options` to `createMotion`. `testing.ts` becomes `export { manualMotion as fakeMotion } from './manual'`.

`compose.ts`: `composeSegments(segments, wedges: { probe(id: string): WedgePose })`.

`blackout.ts`:

```ts
export type BlackoutCover = { set(darkness: number): void; remove(): void }

export function createBlackoutCover(doc: Document = document): BlackoutCover {
  const cover = doc.createElement('div')
  cover.className = 'outage-blackout'
  cover.setAttribute('aria-hidden', 'true')
  doc.body.appendChild(cover)
  return {
    set: (darkness) => cover.style.setProperty('--blackout', String(darkness)),
    remove: () => cover.remove(),
  }
}
```

`cueBlackout` makes its cover with it.

- [ ] **Step 4:** `npx vitest run src/clock src/outage` — PASS.
- [ ] **Step 5:** commit `keep history on a hand-stepped motion and let the blackout cover stand alone`.

### Task 4: `recordShow`

**Files:** Create `src/editor/recordShow.ts`, `src/editor/recordShow.test.ts`.

- [ ] **Step 1: Failing tests** (the spec's Scrub table)

```ts
import { describe, expect, it, vi } from 'vitest'
import { composeSegments } from '../clock/compose'
import { cueMorphs } from '../clock/morphVoices'
import { WHEEL } from '../clock/motion'
import { manualMotion } from '../clock/manual'
import { trackFlapper } from '../wheel/trackFlapper'
import { angleVoice } from '../wheel/anglePatch'
import { blackoutVoice, darkVoice } from '../outage/voices'
import { arcs } from '../wheel/geometry'
import { pegAngles } from '../wheel/pegs'
import { planShow } from '../wheel/show'
import { FRAME_MS, recordShow } from './recordShow'

// segments, config with an outage and a recolor morph; show = planShow({... rng: () => 0.5, from: 0 })

it('matches a live run of the same show', () => {
  const recording = recordShow(show, { pegs: { kind: 'bounds' }, depth: 0.6 })
  const live = manualMotion()
  // the same cues at startedAt = 1000, flapper included, stepped on the same frames
  ...
  for (const k of [10, 300, 700, 1200]) {
    const ms = k * FRAME_MS
    live.step(1000 + ms)
    expect(recording.at(ms).wheel).toEqual(live.motion.wheel.probe(WHEEL))
    expect(recording.at(ms).segments).toEqual(composeSegments(show.segments, live.motion.wedges))
  }
})

it('reads the same frame after reading backward', () => {
  const a = recording.at(8000); recording.at(3000)
  expect(recording.at(8000)).toEqual(a)
})

it('shows the outage inside the dark', () => {
  const mid = (plan.popAtMs + plan.lightsAtMs) / 2
  expect(recording.at(mid).wheel.blackout).toBeGreaterThan(0)
  expect(recording.at(mid).wheel.dark).toBe(true)
})

it('makes no sound', () => {
  const audio = vi.fn(); vi.stubGlobal('AudioContext', audio)
  for (let ms = 0; ms <= recording.durationMs; ms += 250) recording.at(ms)
  expect(audio).not.toHaveBeenCalled()
})
```

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement**

```ts
import type { WheelPose } from '../clock/motion'
import { WHEEL } from '../clock/motion'
import { composeSegments } from '../clock/compose'
import { manualMotion } from '../clock/manual'
import { cueMorphs } from '../clock/morphVoices'
import { blackoutVoice, darkVoice } from '../outage/voices'
import { angleVoice } from '../wheel/anglePatch'
import { arcs } from '../wheel/geometry'
import { type PegMode, pegAngles } from '../wheel/pegs'
import type { Show } from '../wheel/show'
import { trackFlapper } from '../wheel/trackFlapper'
import type { Segment } from '../wheel/types'

export const FRAME_MS = 1000 / 60

export type Recording = {
  durationMs: number
  at(ms: number): { wheel: WheelPose; segments: Segment[] }
}

export type RecordOptions = {
  /** The pegs the flapper meets; null for a look without a flapper. */
  pegs: PegMode | null
  depth: number
}

/**
 * Plays a show once on a clock of its own, at 60 fps, keeping history, so any
 * instant of it reads back exactly. Nothing it plays reaches the page.
 */
export function recordShow(show: Show, { pegs, depth }: RecordOptions): Recording {
  const durationMs = show.track.durationMs
  const { motion, step } = manualMotion({ historyMs: durationMs + 1000 })
  const { wheel, wedges, ticker } = motion
  wheel.cue(angleVoice(show.track, 0))
  if (show.outagePlan) {
    wheel.cue(darkVoice(show.outagePlan, 0))
    wheel.cue(blackoutVoice(depth, show.outagePlan.popAtMs))
  }
  if (show.morphs.length > 0) cueMorphs(wedges, show.segments, show.morphs, show.morphsAt)
  const stop = pegs
    ? trackFlapper(motion, {
        pegs: () => pegAngles(pegs, arcs(composeSegments(show.segments, wedges))),
        write: () => undefined,
        click: () => undefined,
      })
    : null
  const release = ticker.stay()
  const frames = Math.ceil(durationMs / FRAME_MS)
  for (let i = 0; i <= frames; i++) step(i * FRAME_MS)
  release()
  stop?.()  // fades over 0 at the last frame; history keeps every frame before it
  return {
    durationMs,
    at(ms) {
      const t = Math.min(Math.max(0, ms), frames * FRAME_MS)
      return {
        wheel: wheel.project(t).probe(WHEEL),
        segments: composeSegments(show.segments, wedges.project(t)),
      }
    },
  }
}
```

Check while implementing: `stop()` fading the spring at the last synced frame must not change reads at that frame; if it does, leave the flapper voice cued (the recording's motion is garbage once dropped).

- [ ] **Step 4:** `npx vitest run src/editor/recordShow.test.ts` — PASS.
- [ ] **Step 5:** commit `record a planned show once and read any instant of it back`.

### Task 5: `useSpin.preview` and `useSpin.pose`

**Files:** `src/wheel/useSpin.ts`, `src/wheel/useSpin.test.ts` (harness fake gains `pause()` and a writable `currentTime`).

- [ ] **Step 1: Failing tests**

```ts
it('previews the spin a press would make, from where the wheel rests', () => {
  const { result } = renderSpin(CONFIG)
  const show = result.current.preview()
  expect(show?.track.keyframes[0].transform).toBe('rotate(0deg)')
  expect(show?.track.durationMs).toBe(CONFIG.durationMs)
})

it('poses the rotor paused at an instant of a track, and hands it back', () => {
  const { result } = renderSpin(CONFIG)
  const show = result.current.preview()!
  act(() => result.current.pose(show.track, 1200))
  const [call] = harness.animateCalls
  expect(call.animation.currentTime).toBe(1200)
  expect(call.paused).toBe(true)
  act(() => result.current.pose(show.track, 300))
  expect(harness.animateCalls).toHaveLength(1)
  expect(call.animation.currentTime).toBe(300)
  act(() => result.current.pose(null))
  expect(call.canceled).toBe(true)
})

it('lets a spin take the rotor back from a pose', () => {
  ... pose, then spin(); the posed animation is canceled
})
```

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement** in `useSpin`:

```ts
/** The spin a press of Spin would make now, drawn the same way every time, at the authored length. */
preview: (override?: SpinOverride) => Show | null
/** Holds the rotor, its rider and its level groups `ms` into `track`, paused; null hands them back. */
pose: (track: RotationTrack | null, ms?: number) => void
```

`preview` calls `planShow` with `rng: PREVIEW_RNG` (`() => 0.5`), `from: rotationRef.current`, `durationMs: config.durationMs`, the override's segments/config/strategy/resolveLate/catchPegs. `pose` keeps `{ track, animations }` in a ref: a new track cancels the old animations and makes paused ones (`rotor.animate(track.keyframes, …)`, the rider likewise, each level with `invertTrack`), then sets every `currentTime = ms`. `stopTracks` calls `pose(null)`.

- [ ] **Step 4:** `npx vitest run src/wheel/useSpin.test.ts` — PASS.
- [ ] **Step 5:** commit `let the editor plan a spin without playing it and hold the rotor anywhere along it`.

### Task 6: Wheel `flapperDeg`

**Files:** `src/wheel/Wheel.tsx`, `src/wheel/Wheel.test.tsx`.

- [ ] **Step 1: Failing test**

```ts
it('holds the flapper arm where the caller puts it, then hands it back', () => {
  const fake = fakeMotion()
  const { container, rerender } = render(
    <Wheel motion={fake.motion} segments={segments} theme={wof} flapperDeg={12} />,
  )
  const arm = container.querySelector('.wheel__flapper-arm')
  expect(arm?.getAttribute('transform')).toBe('rotate(12.000)')
  rerender(<Wheel motion={fake.motion} segments={segments} theme={wof} />)
  expect(arm?.getAttribute('transform')).toBe('rotate(0.000)')
})
```

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement** — one `writeArm(deg)` used by `trackFlapper`'s `write` and by a layout effect on `flapperDeg`: defined → write it; undefined → write `motion.wheel.probe(WHEEL).deflection ?? 0`.
- [ ] **Step 4:** `npx vitest run src/wheel/Wheel.test.tsx` — PASS.
- [ ] **Step 5:** commit `let the caller hold the flapper arm at a deflection`.

### Task 7: Transport over the whole show

**Files:** `src/editor/Transport.tsx`, `src/editor/Transport.test.tsx`, `src/editor/Editor.css`.

Props become `{ durationMs: number; valueMs: number; showScrub: boolean; isSpinning: boolean; onSpin(): void; onScrub(ms: number): void }`. The slider runs `0..durationMs` in steps of `FRAME_MS`, is hidden when `!showScrub || durationMs <= 0`, disabled while spinning; the readout is seconds, `(ms / 1000).toFixed(2)`, in an `<output>` pinned with `min-width` and `tabular-nums`.

- [ ] **Step 1:** rewrite `Transport.test.tsx`: parked at 0; reports the ms of a change (`'2500'` → `onScrub(2500)`); readout `2.50`; hidden when `durationMs` is 0; withheld when `showScrub` false; disabled while spinning; Spin calls `onSpin`.
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run — PASS.
- [ ] **Step 5:** commit with Task 8.

### Task 8: `useScrub` and the editor

**Files:** Create `src/editor/useScrub.ts`. Modify `src/editor/Editor.tsx`, `src/editor/Editor.test.tsx`.

```ts
export function useScrub({ spinner, override, pegs, active }: {
  spinner: Pick<UseSpinResult, 'preview' | 'pose' | 'isSpinning'>
  override: SpinOverride
  pegs: PegMode | null
  /** False while a spin owns the wheel: the scrub lets go of everything it painted. */
  active: boolean
}): { durationMs: number; valueMs: number; segments: Segment[] | null; flapperDeg?: number; scrub(ms: number): void }
```

- `show` = `spinner.preview(override)`, memoized on the override and `isSpinning` (the resting angle changes when a spin lands).
- `ms` state, `null` until the slider moves; set back to `null` when `active` turns false.
- `recording` = `recordShow(show, { pegs, depth: 0.6 })`, memoized, made only while `ms !== null`.
- A layout effect on `[recording, ms]`: `frame = recording.at(ms)`; `spinner.pose(show.track, ms)`; cover `set(frame.wheel.blackout ?? 0)`; returns segments and `flapperDeg = frame.wheel.deflection ?? 0`. Leaving (`ms` null or unmount) poses null and removes the cover.

Editor: `shown = spinOwns ? displaySegments : (scrub.segments ?? resolved.segments)`; Wheel gets `flapperDeg={scrub.flapperDeg}`; Transport gets `durationMs`, `valueMs`, `onScrub={scrub.scrub}`. `handleSpin`'s `resolveLate` becomes the shared `override`.

- [ ] **Step 1: Failing Editor tests** (installSpinHarness gains `pause`/`currentTime`): scrubbing mid-show poses the rotor paused at that ms; a trick's landed frame shows at the end of the slider; pressing Spin after scrubbing cancels the pose; the locked editor still offers no scrubber.
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npx vitest run src/editor src/wheel src/clock src/outage` — PASS; `npx tsc --noEmit`; `npx biome check .`
- [ ] **Step 5:** commit `scrub the editor through the whole planned show`.

### Task 9: Close out

- [ ] Check in the browser (playwright, headless): scrub through an outage preset, screenshot mid-dark and at landing, post to transom.
- [ ] Spec: mark phase 6 built, replace the "Editor scrub" section with what was built (the departures above), drop the `history` open point with the measurement. Note that nothing paints `dark`.
- [ ] `docs/HANDOFF.md`: phase 6 done; drop item 1.
- [ ] Delete this plan.
- [ ] Merge to `main`; launch `onto test` in the background.
