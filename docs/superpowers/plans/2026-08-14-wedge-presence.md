# Wedge Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wedges animate out as well as in, survivors reflow around a departure, and any two of those animations interrupt each other from wherever they got to.

**Architecture:** Every drawn wedge id has a *track* — a phase (`entering`, `present`, `exiting`) plus the keyframes, base values, and clock it is animating against. Pure functions turn a track and a timestamp into a *presence*: `hold` (how much of its authored weight the wedge currently occupies) and the six presentation values. One `requestAnimationFrame` loop samples every track, and the wheel renders the result. Wedge animation leaves the Web Animations API entirely; the rotor keeps it.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-08-14-wedge-presence-design.md`. Read it before Task 4 — the interrupt rule and the selection guard are stated there and this plan implements them without restating the reasoning.

**Scope:** The `enter` and `exit` moments, wedge scope. Out of scope, unchanged from the transitions spec: the `spin` and `reveal` moments, and the wheel-scope transitions (`shutter`, `zoom`). Also out: transitions that turn one wedge into many (shards, particles), which need a renderer of their own.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/keyframes/bracket.ts` | *new* — finds the two keyframes surrounding a progress value. Shared by morphs and presences so neither imports the other, the same way `src/form/fields.ts` is shared by recipes and transitions. |
| `src/transition/sample.ts` | *new* — `Presence`, `RESTING`, and sampling a keyframe list into a presence. |
| `src/transition/tracks.ts` | *new* — the track record, the membership diff that starts and reverses tracks, sampling a track at a time, and the draw list. All pure. |
| `src/transition/usePresence.ts` | *new* — the rAF clock and the refs around `tracks.ts`. Replaces `useEnter.ts`. |
| `src/transition/transitions/shrink.ts` | *new* — the transition that declares `hold`. |
| `src/transition/types.ts` | `hold` on `PresentationKeyframe`, `moment` on `TransitionContext`, `moments` on `Transition`. |
| `src/transition/css.ts` | unchanged in shape; gains a presence-to-style emitter beside the keyframe one. |
| `src/wheel/morph.ts` | drops its private `bracket` for the shared one. |
| `src/wheel/Wheel.tsx` | renders a draw list instead of computing arcs itself. |
| `src/editor/TransitionPanel.tsx` | arms a transition per moment rather than only `enter`. |
| `src/transition/useEnter.ts` | deleted in Task 7. |

---

### Task 1: Share the keyframe bracket

`morph.ts` has a private `bracket` that finds the two keyframes surrounding a
progress value. Presence sampling needs exactly the same search. Lift it out
before there are two copies.

**Files:**
- Create: `src/keyframes/bracket.ts`
- Create: `src/keyframes/bracket.test.ts`
- Modify: `src/wheel/morph.ts`

- [ ] **Step 1: Write the failing test**

Create `src/keyframes/bracket.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bracket } from './bracket'

const p = (at: number, value: number) => ({ at, value })

describe('bracket', () => {
  it('returns null for no points', () => {
    expect(bracket([], 0.5)).toBeNull()
  })

  it('finds the surrounding pair and the fraction between them', () => {
    const found = bracket([p(0, 10), p(1, 20)], 0.25)
    expect(found?.from.value).toBe(10)
    expect(found?.to.value).toBe(20)
    expect(found?.t).toBeCloseTo(0.25)
  })

  it('clamps below the first point', () => {
    const found = bracket([p(0.4, 10), p(1, 20)], 0)
    expect(found).toEqual({ from: p(0.4, 10), to: p(0.4, 10), t: 0 })
  })

  it('clamps past the last point', () => {
    const found = bracket([p(0, 10), p(0.6, 20)], 1)
    expect(found).toEqual({ from: p(0.6, 20), to: p(0.6, 20), t: 1 })
  })

  it('gives a tie to the later point when two share an offset', () => {
    const found = bracket([p(0.5, 10), p(0.5, 20)], 0.5)
    expect(found?.to.value).toBe(20)
    expect(found?.t).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/keyframes/bracket.test.ts`
Expected: FAIL — "Failed to resolve import './bracket'".

- [ ] **Step 3: Write the implementation**

Create `src/keyframes/bracket.ts`. This is `morph.ts`'s function with its type
loosened from `MorphKeyframe` to anything carrying an `at`:

```ts
/** Any keyframe-like point on a 0…1 timeline. */
export type At = { at: number }

/** Finds the pair of points bracketing `p`, plus how far between them it sits. */
export function bracket<T extends At>(
  points: T[],
  p: number,
): { from: T; to: T; t: number } | null {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  // Checked before `p <= first.at`: when every point shares one offset,
  // `first === last`, and a tie must go to the later keyframe to agree with
  // the `span === 0` branch below, which already prefers `to`.
  if (p >= last.at) return { from: last, to: last, t: 1 }
  if (p <= first.at) return { from: first, to: first, t: 0 }
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    if (p >= from.at && p <= to.at) {
      const span = to.at - from.at
      return { from, to, t: span === 0 ? 1 : (p - from.at) / span }
    }
  }
  return { from: last, to: last, t: 1 }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/keyframes/bracket.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point morph.ts at the shared copy**

In `src/wheel/morph.ts`, add the import at the top of the import block:

```ts
import { bracket } from '../keyframes/bracket'
```

Then delete the whole private `bracket` function — the one whose signature is
`function bracket<K extends keyof MorphKeyframe>(points: Defined<K>[], p: number)`
— along with the comment above it, which moved to the new file. Leave
`pointsFor`, `withImplicitBase`, and every `sample*` function alone: the shared
`bracket` accepts `Defined<K>[]` unchanged, because `MorphKeyframe` has an `at`.

- [ ] **Step 6: Run the morph tests to verify nothing moved**

Run: `npx vitest run src/wheel/morph.test.ts`
Expected: PASS, no test changes. This is a pure refactor; a failure here means
the signature was loosened wrongly, not that behavior was meant to change.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 8: Commit**

```bash
git add src/keyframes/bracket.ts src/keyframes/bracket.test.ts src/wheel/morph.ts
git commit -m "refactor(keyframes): share the bracket search between morphs and transitions"
```

---

### Task 2: Sample a keyframe list into a presence

A presence is the seven values a transition animates. Sampling turns a keyframe
list plus a progress value into one, interpolating each property independently
and falling back to a supplied base wherever the keyframes are silent.

The base is the whole interrupt mechanism: pass `RESTING` for a fresh
transition, or the current sample for one that is interrupting another.

**Files:**
- Create: `src/transition/sample.ts`
- Create: `src/transition/sample.test.ts`
- Modify: `src/transition/types.ts`

- [ ] **Step 1: Add `hold` to the keyframe vocabulary**

In `src/transition/types.ts`, add `hold` to `PresentationKeyframe`, directly
above `opacity`:

```ts
  /**
   * 0…1 of the wedge's authored weight it occupies. The only property that
   * changes geometry, so it is sampled at `enter` and `exit` only.
   */
  hold?: number
```

Then add the presence type at the end of the file:

```ts
/** Every value a transition animates, at one instant. */
export type Presence = {
  hold: number
  opacity: number
  scale: number
  offset: number
  offsetAngle: number
  rotate: number
  aperture: number
}
```

- [ ] **Step 2: Write the failing test**

Create `src/transition/sample.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RESTING, samplePresence } from './sample'
import type { PresentationKeyframe } from './types'

const fadeIn: PresentationKeyframe[] = [
  { at: 0, opacity: 0 },
  { at: 1, opacity: 1 },
]

describe('samplePresence', () => {
  it('interpolates a declared property', () => {
    expect(samplePresence(fadeIn, 0.25, RESTING).opacity).toBeCloseTo(0.25)
  })

  it('leaves an undeclared property at its base', () => {
    expect(samplePresence(fadeIn, 0.5, RESTING).scale).toBe(1)
    expect(samplePresence(fadeIn, 0.5, { ...RESTING, scale: 0.5 }).scale).toBe(0.5)
  })

  it('interpolates from the base when the first frame arrives late', () => {
    const late: PresentationKeyframe[] = [{ at: 1, opacity: 0 }]
    const base = { ...RESTING, opacity: 0.5 }
    expect(samplePresence(late, 0.5, base).opacity).toBeCloseTo(0.25)
  })

  it('holds a property declared only once', () => {
    const frames: PresentationKeyframe[] = [
      { at: 0, offset: 1, offsetAngle: 137 },
      { at: 1, offset: 0 },
    ]
    expect(samplePresence(frames, 0.5, RESTING).offsetAngle).toBe(137)
  })

  it('samples every property independently', () => {
    const frames: PresentationKeyframe[] = [
      { at: 0, opacity: 0, scale: 0.5 },
      { at: 1, opacity: 1, scale: 1 },
    ]
    const presence = samplePresence(frames, 0.5, RESTING)
    expect(presence.opacity).toBeCloseTo(0.5)
    expect(presence.scale).toBeCloseTo(0.75)
  })

  it('sorts frames declared out of order', () => {
    const frames: PresentationKeyframe[] = [
      { at: 1, opacity: 1 },
      { at: 0, opacity: 0 },
    ]
    expect(samplePresence(frames, 0.25, RESTING).opacity).toBeCloseTo(0.25)
  })

  it('reports whether a list declares hold', () => {
    expect(declaresHold(fadeIn)).toBe(false)
    expect(declaresHold([{ at: 1, hold: 0 }])).toBe(true)
  })
})
```

Add `declaresHold` to the import line at the top:

```ts
import { RESTING, declaresHold, samplePresence } from './sample'
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `npx vitest run src/transition/sample.test.ts`
Expected: FAIL — "Failed to resolve import './sample'".

- [ ] **Step 3: Write the implementation**

Create `src/transition/sample.ts`:

```ts
import { bracket } from '../keyframes/bracket'
import type { Presence, PresentationKeyframe } from './types'

/** A wedge sitting in its arc with nothing applied. */
export const RESTING: Presence = {
  hold: 1,
  opacity: 1,
  scale: 1,
  offset: 0,
  offsetAngle: 0,
  rotate: 0,
  aperture: 1,
}

const KEYS = [
  'hold',
  'opacity',
  'scale',
  'offset',
  'offsetAngle',
  'rotate',
  'aperture',
] as const

type Point = { at: number; value: number }

function pointsFor(frames: PresentationKeyframe[], key: (typeof KEYS)[number]): Point[] {
  return frames
    .filter((frame) => frame[key] !== undefined)
    .map((frame) => ({ at: frame.at, value: frame[key] as number }))
    .sort((a, b) => a.at - b.at)
}

export function declaresHold(frames: PresentationKeyframe[]): boolean {
  return frames.some((frame) => frame.hold !== undefined)
}

/**
 * `base` supplies every property the keyframes do not mention, and stands in
 * for a missing frame at 0. Passing the current sample rather than RESTING is
 * what lets one transition interrupt another without snapping.
 */
export function samplePresence(
  frames: PresentationKeyframe[],
  p: number,
  base: Presence,
): Presence {
  const out = { ...base }
  for (const key of KEYS) {
    const points = pointsFor(frames, key)
    if (points.length === 0) continue
    const withBase = points[0].at > 0 ? [{ at: 0, value: base[key] }, ...points] : points
    const found = bracket(withBase, p)
    if (!found) continue
    out[key] = found.from.value + (found.to.value - found.from.value) * found.t
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/transition/sample.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transition/sample.ts src/transition/sample.test.ts src/transition/types.ts
git commit -m "feat(transition): sample presentation keyframes into a presence"
```

---

### Task 3: Give a transition its moment

A transition needs to know which moment it is being asked for, so it can write
its own departure instead of having its arrival reversed. It also declares which
moments it serves, so the editor offers only the ones that apply.

**Files:**
- Modify: `src/transition/types.ts`
- Modify: `src/transition/transitions/fade.ts`
- Modify: `src/transition/transitions/fade.test.ts`
- Modify: `src/transition/transitions/fly.ts`
- Modify: `src/transition/transitions/fly.test.ts`
- Modify: `src/transition/useEnter.ts`

- [ ] **Step 1: Write the failing tests**

In `src/transition/transitions/fade.test.ts`, the existing tests call
`fade.frames(params, ctx)` with a context lacking `moment`. Add `moment: 'enter'`
to every existing context literal in the file, then append:

```ts
it('serves both membership moments', () => {
  expect(fade.moments).toEqual(['enter', 'exit'])
})

it('fades out at exit', () => {
  const { keyframes } = fade.frames({}, { index: 0, count: 1, angle: 0, durationMs: 400, moment: 'exit' })
  expect(keyframes[0].opacity).toBe(1)
  expect(keyframes[keyframes.length - 1].opacity).toBe(0)
})
```

In `src/transition/transitions/fly.test.ts`, likewise add `moment: 'enter'` to
every existing context literal, then append:

```ts
it('flies out at exit, ending away from the hub', () => {
  const { keyframes } = fly.frames(
    { distance: 2 },
    { index: 0, count: 1, angle: 0, durationMs: 500, moment: 'exit' },
  )
  const last = keyframes[keyframes.length - 1]
  expect(last.offset).toBe(2)
  expect(last.opacity).toBe(0)
})

it('puts the direction on the frame that carries the offset', () => {
  const { keyframes } = fly.frames(
    { from: 'top' },
    { index: 0, count: 1, angle: 0, durationMs: 500, moment: 'exit' },
  )
  const last = keyframes[keyframes.length - 1]
  expect(last.offsetAngle).toBe(0)
  expect(keyframes[0].offsetAngle).toBeUndefined()
})
```

That last test pins a rule the interrupt mechanism depends on. An interrupted
transition drops its declared frame at 0, so a direction declared there would be
lost. Declaring it on the frame that actually carries a nonzero `offset` — frame
0 for an arrival, frame 1 for a departure — survives the drop in both cases.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/transition/transitions/`
Expected: FAIL — `moments` is undefined, and TypeScript rejects `moment` in the
context literals.

- [ ] **Step 3: Extend the types**

In `src/transition/types.ts`, add `moment` to `TransitionContext`:

```ts
  /** Which moment is being asked for, so a departure is authored, not reversed. */
  moment: Moment
```

`Moment` is declared lower in the same file, which is fine — type aliases are
hoisted, so a forward reference resolves. Leave it where it is.

Then add to `Transition`, directly under `scope`:

```ts
  /** Which moments this transition serves. The editor offers it only for these. */
  moments: Moment[]
```

Also add `'shrink'` to `TransitionId`, which Task 8 fills in:

```ts
export type TransitionId = 'fade' | 'fly' | 'shrink'
```

- [ ] **Step 4: Give fade a departure**

Replace the `frames` function in `src/transition/transitions/fade.ts`, and add
`moments` under `scope`:

```ts
  scope: 'wedge',
  moments: ['enter', 'exit'],
```

```ts
  frames(params, ctx) {
    const [from, to] = ctx.moment === 'exit' ? [1, 0] : [0, 1]
    return {
      keyframes: [
        { at: 0, opacity: from },
        { at: 1, opacity: to },
      ],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
    }
  },
```

- [ ] **Step 5: Give fly a departure**

In `src/transition/transitions/fly.ts`, add `moments` under `scope`:

```ts
  scope: 'wedge',
  moments: ['enter', 'exit'],
```

Replace the `frames` function:

```ts
  frames(params, ctx) {
    const offsetAngle = directionOf(params, ctx)
    const distance = readNumber(params, 'distance', DISTANCE)
    const tumble = readNumber(params, 'tumbleDeg', 0)
    const delayMs = readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index

    // The direction rides on whichever frame carries the nonzero offset. An
    // interrupted transition drops its frame at 0, and a direction declared
    // there would go with it.
    const away: PresentationKeyframe = {
      at: ctx.moment === 'exit' ? 1 : 0,
      opacity: 0,
      scale: 0.9,
      offset: distance,
      rotate: ctx.moment === 'exit' ? -tumble : tumble,
    }
    if (offsetAngle !== undefined) away.offsetAngle = offsetAngle

    const settled: PresentationKeyframe = {
      at: ctx.moment === 'exit' ? 0 : 1,
      opacity: 1,
      scale: 1,
      offset: 0,
      rotate: 0,
    }

    return {
      keyframes: ctx.moment === 'exit' ? [settled, away] : [away, settled],
      delayMs,
    }
  },
```

- [ ] **Step 6: Keep useEnter compiling**

`src/transition/useEnter.ts` builds a `TransitionContext` and now misses a field.
In its `transition.frames(params, {...})` call, add:

```ts
        moment: 'enter',
```

Task 7 deletes this file. The one-line change keeps the suite green until then.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/transition/`
Expected: PASS.

- [ ] **Step 8: Run the whole suite and the type check**

Run: `npm test && npm run build`
Expected: both clean. `registry.ts` types `TRANSITIONS` as
`Record<TransitionId, Transition>`, so adding `'shrink'` to the union makes the
build fail until Task 8 registers it — if `npm run build` reports a missing
`shrink` property, move the `TransitionId` change from Step 3 to Task 8 Step 3
and re-run.

- [ ] **Step 9: Commit**

```bash
git add src/transition/types.ts src/transition/transitions/
git commit -m "feat(transition): let a transition author its own departure"
```

---

### Task 4: Start, reverse, and interrupt tracks

A track is one wedge's animation: its phase, the keyframes it is running, the
base those keyframes interpolate from, and when it started. `advance` diffs the
composed roster against the tracks already drawn and returns the new set.

This task is the membership rules only. Sampling is Task 5.

**Files:**
- Create: `src/transition/tracks.ts`
- Create: `src/transition/tracks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/transition/tracks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Segment } from '../wheel/types'
import { RESTING } from './sample'
import { advance, sampleTrack, settle } from './tracks'
import type { Transitions } from './types'

const segment = (id: string): Segment => ({ id, label: id, weight: 1 })

const enterOnly: Transitions = { enter: { id: 'fade', params: { staggerMs: 0 } } }
const both: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
}

const input = (over: Partial<Parameters<typeof advance>[0]> = {}) => ({
  tracks: new Map(),
  segments: [segment('ana')],
  arcs: new Map(),
  transitions: both,
  now: 0,
  reduced: false,
  ...over,
})

describe('advance', () => {
  it('enters every wedge on first paint', () => {
    const tracks = advance(input())
    expect(tracks.get('ana')?.phase).toBe('entering')
  })

  it('leaves a wedge that was already there alone', () => {
    const first = advance(input())
    const second = advance(input({ tracks: first, now: 1000 }))
    expect(second.get('ana')?.startedAt).toBe(first.get('ana')?.startedAt)
  })

  it('exits a wedge that leaves the roster', () => {
    const first = advance(input({ now: 0 }))
    const second = advance(input({ tracks: first, segments: [], now: 1000 }))
    expect(second.get('ana')?.phase).toBe('exiting')
  })

  it('drops an exiting wedge once its transition finishes', () => {
    const first = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: first, segments: [], now: 1000 }))
    const done = advance(input({ tracks: exiting, segments: [], now: 1000 + 400 + 1 }))
    expect(done.has('ana')).toBe(false)
  })

  it('keeps drawing a departed wedge until then', () => {
    const first = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: first, segments: [], now: 1000 }))
    const midway = advance(input({ tracks: exiting, segments: [], now: 1100 }))
    expect(midway.get('ana')?.segment.label).toBe('ana')
  })

  it('starts an interrupting transition from the current sample', () => {
    // Enter is 400ms of fade; interrupt it a quarter of the way in.
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 100 }))
    expect(exiting.get('ana')?.base.opacity).toBeCloseTo(0.25)
  })

  it('drops a declared zero frame when interrupting', () => {
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 100 }))
    expect(exiting.get('ana')?.frames.every((frame) => frame.at > 0)).toBe(true)
  })

  it('keeps a declared zero frame when nothing was in flight', () => {
    const entering = advance(input({ now: 0 }))
    const present = advance(input({ tracks: entering, now: 1000 }))
    const exiting = advance(input({ tracks: present, segments: [], now: 1000 }))
    expect(exiting.get('ana')?.frames.some((frame) => frame.at === 0)).toBe(true)
  })

  it('reverses a wedge that re-joins while exiting', () => {
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 1000 }))
    const back = advance(input({ tracks: exiting, now: 1100 }))
    expect(back.get('ana')?.phase).toBe('entering')
    expect(back.size).toBe(1)
  })

  it('promotes a finished entrance to present', () => {
    const entering = advance(input({ now: 0 }))
    const present = advance(input({ tracks: entering, now: 1000 }))
    expect(present.get('ana')?.phase).toBe('present')
  })

  it('leaves a wedge alone when its moment has no transition', () => {
    const tracks = advance(input({ transitions: enterOnly, now: 0 }))
    const gone = advance(input({ tracks, segments: [], transitions: enterOnly, now: 10 }))
    expect(gone.has('ana')).toBe(false)
  })

  it('tracks a label change without restarting anything', () => {
    const first = advance(input({ now: 0 }))
    const renamed = advance(
      input({ tracks: first, segments: [{ ...segment('ana'), label: 'Ana L.' }], now: 100 }),
    )
    expect(renamed.get('ana')?.segment.label).toBe('Ana L.')
    expect(renamed.get('ana')?.startedAt).toBe(0)
  })
})

describe('settle', () => {
  it('drops exiting wedges and rests the rest', () => {
    const entering = advance(input({ segments: [segment('ana'), segment('ben')], now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [segment('ana')], now: 100 }))
    const settled = settle(exiting)
    expect(settled.has('ben')).toBe(false)
    expect(settled.get('ana')?.phase).toBe('present')
    expect(sampleTrack(settled.get('ana')!, 999)).toEqual(RESTING)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: FAIL — "Failed to resolve import './tracks'".

- [ ] **Step 3: Write the implementation**

Create `src/transition/tracks.ts`, complete as below. `sampleTrack` is real
here, not a placeholder — the interrupt test above asserts a sampled `base`,
which only a working sampler produces. Task 5 adds `drawList` beside it and
changes nothing in this file's other functions.

```ts
import { readNumber } from '../tricks/params'
import type { Arc } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { getTransition } from './registry'
import { RESTING, declaresHold, samplePresence } from './sample'
import { fade } from './transitions/fade'
import type { Moment, Presence, PresentationKeyframe, Transitions } from './types'

export type Phase = 'entering' | 'present' | 'exiting'

export type Track = {
  id: string
  phase: Phase
  /** Last composed, so a departed wedge can still be drawn. */
  segment: Segment
  frames: PresentationKeyframe[]
  /** What the keyframes interpolate from wherever they are silent. */
  base: Presence
  startedAt: number
  delayMs: number
  durationMs: number
  declaresHold: boolean
  /** Where it sat when it left the layout. Read only once `hold` reaches zero. */
  ghostArc: Arc | null
}

export type AdvanceInput = {
  tracks: Map<string, Track>
  /** The composed roster now, with colors already resolved. */
  segments: Segment[]
  /** Last frame's layout, so a departing wedge can freeze where it stood. */
  arcs: Map<string, Arc>
  transitions: Transitions | undefined
  now: number
  reduced: boolean
}

/** A phase whose animation is still running, and so can be interrupted. */
function inFlight(track: Track, now: number): boolean {
  return track.phase !== 'present' && !isDone(track, now)
}

export function isDone(track: Track, now: number): boolean {
  if (track.phase === 'present') return true
  return now - track.startedAt >= track.delayMs + track.durationMs
}

export function sampleTrack(track: Track, now: number): Presence {
  if (track.phase === 'present') return RESTING
  const elapsed = now - track.startedAt - track.delayMs
  // A stagger delay holds the current sample rather than the keyframes'
  // declared start, so an interrupted wedge waits where it stands.
  if (elapsed < 0) return track.base
  const p = track.durationMs <= 0 ? 1 : Math.min(1, elapsed / track.durationMs)
  const presence = samplePresence(track.frames, p, track.base)
  if (!track.declaresHold) presence.hold = track.phase === 'exiting' ? 0 : 1
  return presence
}

/** Drops a declared zero frame so an interrupted transition resumes where it is. */
function withoutZeroFrame(frames: PresentationKeyframe[]): PresentationKeyframe[] {
  return frames.filter((frame) => frame.at > 0)
}

type Plan = { frames: PresentationKeyframe[]; delayMs: number; durationMs: number }

function planTrack(
  transitions: Transitions | undefined,
  moment: Moment,
  index: number,
  count: number,
  angle: number,
  reduced: boolean,
): Plan | null {
  const instance = transitions?.[moment]
  if (!instance) return null
  const authored = getTransition(instance.id)
  if (!authored) return null
  if (!authored.moments.includes(moment)) return null

  const transition = reduced ? fade : authored
  const params = reduced ? { staggerMs: 0 } : instance.params
  const durationMs = reduced
    ? REDUCED_MOTION_MS
    : readNumber(instance.params, 'durationMs', readNumber(transition.defaults, 'durationMs', 400))

  const { keyframes, delayMs } = transition.frames(params, {
    index,
    count,
    angle,
    durationMs,
    moment,
  })
  return { frames: keyframes, delayMs, durationMs }
}

function angleOf(arc: Arc | undefined): number {
  if (!arc) return 0
  return (arc.start + (arc.end - arc.start) / 2) * 360
}

export function advance(input: AdvanceInput): Map<string, Track> {
  const { tracks, segments, arcs, transitions, now, reduced } = input
  const next = new Map<string, Track>()
  const count = segments.length

  segments.forEach((segment, index) => {
    const existing = tracks.get(segment.id)

    if (existing && existing.phase !== 'exiting') {
      next.set(segment.id, {
        ...existing,
        segment,
        phase: isDone(existing, now) ? 'present' : existing.phase,
      })
      return
    }

    const interrupting = existing !== undefined && inFlight(existing, now)
    const plan = planTrack(transitions, 'enter', index, count, angleOf(arcs.get(segment.id)), reduced)
    if (!plan) {
      next.set(segment.id, restingTrack(segment))
      return
    }

    next.set(segment.id, {
      id: segment.id,
      phase: 'entering',
      segment,
      frames: interrupting ? withoutZeroFrame(plan.frames) : plan.frames,
      base: interrupting ? sampleTrack(existing, now) : RESTING,
      startedAt: now,
      delayMs: plan.delayMs,
      durationMs: plan.durationMs,
      declaresHold: declaresHold(plan.frames),
      ghostArc: null,
    })
  })

  let departed = 0
  for (const [id, track] of tracks) {
    if (next.has(id)) continue

    if (track.phase === 'exiting') {
      if (!isDone(track, now)) next.set(id, track)
      continue
    }

    const interrupting = inFlight(track, now)
    const plan = planTrack(transitions, 'exit', departed, tracks.size, angleOf(arcs.get(id)), reduced)
    departed += 1
    if (!plan) continue

    next.set(id, {
      ...track,
      phase: 'exiting',
      frames: interrupting ? withoutZeroFrame(plan.frames) : plan.frames,
      base: interrupting ? sampleTrack(track, now) : RESTING,
      startedAt: now,
      delayMs: plan.delayMs,
      durationMs: plan.durationMs,
      declaresHold: declaresHold(plan.frames),
      ghostArc: arcs.get(id) ?? null,
    })
  }

  return next
}

function restingTrack(segment: Segment): Track {
  return {
    id: segment.id,
    phase: 'present',
    segment,
    frames: [],
    base: RESTING,
    startedAt: 0,
    delayMs: 0,
    durationMs: 0,
    declaresHold: false,
    ghostArc: null,
  }
}

/**
 * Everything at its target, now. A spin owns the geometry it is about to plan
 * against, so nothing may still be arriving or leaving underneath it.
 */
export function settle(tracks: Map<string, Track>): Map<string, Track> {
  const next = new Map<string, Track>()
  for (const [id, track] of tracks) {
    if (track.phase === 'exiting') continue
    next.set(id, restingTrack(track.segment))
  }
  return next
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/transition/tracks.ts src/transition/tracks.test.ts
git commit -m "feat(transition): track a wedge from arrival through departure"
```

---

### Task 5: Build the draw list

The wheel needs three things per drawn wedge: the segment, the arc it occupies,
and its presence. Wedges still holding arc take part in layout at
`weight * hold`; one whose hold has reached zero is drawn at the arc it last
held, outside the layout.

**Files:**
- Modify: `src/transition/tracks.ts`
- Modify: `src/transition/tracks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/transition/tracks.test.ts`:

```ts
describe('drawList', () => {
  const holding = (id: string, hold: number): Track => ({
    id,
    phase: 'exiting',
    segment: segment(id),
    frames: [{ at: 1, hold }],
    base: { ...RESTING, hold: 1 },
    startedAt: 0,
    delayMs: 0,
    durationMs: 100,
    declaresHold: true,
    ghostArc: null,
  })

  it('lays out holding wedges by weight times hold', () => {
    const tracks = new Map<string, Track>([
      ['ana', { ...holding('ana', 1), phase: 'present', frames: [], declaresHold: false }],
      ['ben', holding('ben', 1)],
    ])
    const { drawn } = drawList(tracks, 100)
    // ben has decayed to hold 0 at p=1, so ana takes the whole circle.
    const ana = drawn.find((item) => item.segment.id === 'ana')
    expect(ana?.arc.end - ana!.arc.start).toBeCloseTo(1)
  })

  it('draws a wedge at zero hold on its frozen arc', () => {
    const ghost = { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }
    const tracks = new Map<string, Track>([['ben', ghost]])
    const { drawn } = drawList(tracks, 100)
    expect(drawn[0].arc).toEqual({ id: 'ben', start: 0.5, end: 1 })
    expect(drawn[0].presence.hold).toBe(0)
  })

  it('moves no other wedge when a ghost is present', () => {
    const solo = new Map<string, Track>([['ana', restingFor('ana')]])
    const withGhost = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }],
    ])
    const before = drawList(solo, 100).drawn[0].arc
    const after = drawList(withGhost, 100).drawn.find((item) => item.segment.id === 'ana')?.arc
    expect(after).toEqual(before)
  })

  it('drops a ghost that never had an arc', () => {
    const tracks = new Map<string, Track>([['ben', holding('ben', 0)]])
    expect(drawList(tracks, 100).drawn).toHaveLength(0)
  })

  it('reports the arcs it laid out, for the next departure to freeze', () => {
    const tracks = new Map<string, Track>([['ana', restingFor('ana')]])
    expect(drawList(tracks, 0).arcs.get('ana')).toEqual({ id: 'ana', start: 0, end: 1 })
  })

  it('orders ghosts after the live roster', () => {
    const tracks = new Map<string, Track>([
      ['ben', { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }],
      ['ana', restingFor('ana')],
    ])
    const { drawn } = drawList(tracks, 100)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
  })
})
```

Add the helper above that describe block:

```ts
const restingFor = (id: string): Track => ({
  id,
  phase: 'present',
  segment: segment(id),
  frames: [],
  base: RESTING,
  startedAt: 0,
  delayMs: 0,
  durationMs: 0,
  declaresHold: false,
  ghostArc: null,
})
```

And extend the import from `./tracks`:

```ts
import { advance, drawList, sampleTrack, settle } from './tracks'
import type { Track } from './tracks'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: FAIL — `drawList` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/transition/tracks.ts`. Extend the geometry import first:

```ts
import { type Arc, arcs as layoutArcs } from '../wheel/geometry'
```

Then append:

```ts
export type Drawn = {
  segment: Segment
  arc: Arc
  presence: Presence
}

/**
 * A wedge still holding arc takes part in layout at `weight * hold`; one that
 * has released it is drawn where it last stood, so nothing else shifts as it
 * animates out.
 */
export function drawList(
  tracks: Map<string, Track>,
  now: number,
): { drawn: Drawn[]; arcs: Map<string, Arc> } {
  const sampled = [...tracks.values()].map((track) => ({
    track,
    presence: sampleTrack(track, now),
  }))

  const holding = sampled.filter((item) => item.presence.hold > 0)
  const laid = layoutArcs(
    holding.map((item) => ({
      id: item.track.id,
      weight: item.track.segment.weight * item.presence.hold,
    })),
  )

  const arcs = new Map<string, Arc>()
  const drawn: Drawn[] = []
  holding.forEach((item, index) => {
    const arc = laid[index]
    arcs.set(item.track.id, arc)
    drawn.push({ segment: item.track.segment, arc, presence: item.presence })
  })

  for (const item of sampled) {
    if (item.presence.hold > 0) continue
    // A wedge that released its arc before it was ever laid out has nowhere to
    // be drawn, which is the same as not being on the wheel.
    if (!item.track.ghostArc) continue
    drawn.push({ segment: item.track.segment, arc: item.track.ghostArc, presence: item.presence })
  }

  return { drawn, arcs }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transition/tracks.ts src/transition/tracks.test.ts
git commit -m "feat(transition): lay out holding wedges and freeze released ones"
```

---

### Task 6: Emit a presence as style

`css.ts` compiles keyframes for WAAPI. Sampling needs the same arithmetic
applied to one presence, producing a style object React can hand to an element.

**Files:**
- Modify: `src/transition/css.ts`
- Modify: `src/transition/css.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/transition/css.test.ts`:

```ts
describe('styleOf', () => {
  const target = { angle: 90, radius: 200, pivot: 120 }

  it('emits nothing extra for a resting presence', () => {
    const style = styleOf(RESTING, target)
    expect(style.transform).toBe('none')
    expect(style.opacity).toBe(1)
  })

  it('emits opacity and a transform together', () => {
    const style = styleOf({ ...RESTING, opacity: 0.5, scale: 0.9 }, target)
    expect(style.opacity).toBe(0.5)
    expect(style.transform).toContain('scale(0.9)')
  })

  it('clips only when the aperture is closed', () => {
    expect(styleOf(RESTING, target).clipPath).toBeUndefined()
    expect(styleOf({ ...RESTING, aperture: 0.5 }, target).clipPath).toContain('circle(')
  })

  it('reuses the keyframe transform arithmetic', () => {
    const presence = { ...RESTING, offset: 1, offsetAngle: 45 }
    expect(styleOf(presence, target).transform).toBe(
      transformOf({ at: 0, offset: 1, offsetAngle: 45 }, target),
    )
  })
})
```

Extend the file's imports:

```ts
import { RESTING } from './sample'
import { styleOf, transformOf } from './css'
```

Keep whatever `./css` imports the file already has, merged into that one line.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transition/css.test.ts`
Expected: FAIL — `styleOf` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/transition/css.ts`, extend the type import:

```ts
import type { Presence, PresentationKeyframe } from './types'
```

Then append:

```ts
export type PresenceStyle = {
  transform: string
  opacity: number
  clipPath?: string
}

/**
 * One presence as inline style. `transformOf` and `clipOf` take a keyframe, and
 * a presence is a keyframe with every property present — so the arithmetic is
 * shared rather than reimplemented, and the two can never drift.
 */
export function styleOf(presence: Presence, target: EmitTarget): PresenceStyle {
  const frame: PresentationKeyframe = { at: 0, ...presence }
  const style: PresenceStyle = {
    transform: transformOf(frame, target),
    opacity: presence.opacity,
  }
  if (presence.aperture < 1) style.clipPath = clipOf(frame)
  return style
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/transition/css.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transition/css.ts src/transition/css.test.ts
git commit -m "feat(transition): emit a sampled presence as style"
```

---

### Task 7: Run the clock and draw it

The hook owns the only mutable state: the track map, the last frame's arcs, and
the rAF handle. Everything it does is a call into `tracks.ts`.

`Wheel` stops computing arcs and stops resolving palette colors — the hook
resolves colors before diffing, so a departing wedge keeps the color it had.

**Files:**
- Create: `src/transition/usePresence.ts`
- Modify: `src/wheel/Wheel.tsx`
- Modify: `src/App.tsx`
- Delete: `src/transition/useEnter.ts`
- Delete: `src/transition/useEnter.test.tsx`
- Create: `src/transition/usePresence.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/transition/usePresence.test.tsx`. These replace `useEnter.test.tsx`
— same behaviors, asserted on what is rendered rather than on a stubbed
`Element.prototype.animate`:

```tsx
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'

const segment = (id: string): Segment => ({ id, label: id, weight: 1 })

const matchMedia = (matches: boolean) => {
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

const wedges = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-segment-id]')].map((node) =>
    node.getAttribute('data-segment-id'),
  )

const transitions = {
  enter: { id: 'fade' as const, params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade' as const, params: { staggerMs: 0, durationMs: 400 } },
}

beforeEach(() => {
  matchMedia(false)
})

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('wedge presence', () => {
  it('draws an arriving wedge from its transition start', () => {
    const { container } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    const wedge = container.querySelector('[data-segment-id="ana"]') as SVGGElement
    expect(wedge.style.opacity).toBe('0')
  })

  it('keeps drawing a wedge that leaves the roster', () => {
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(wedges(container)).toContain('ben')
  })

  it('drops a departing wedge when no exit is armed', () => {
    const enterOnly = { enter: transitions.enter }
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={enterOnly} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={enterOnly} />)
    expect(wedges(container)).not.toContain('ben')
  })

  it('draws nothing extra when no transitions are armed', () => {
    const { container, rerender } = render(<Wheel segments={[segment('ana'), segment('ben')]} />)
    rerender(<Wheel segments={[segment('ana')]} />)
    expect(wedges(container)).toEqual(['ana'])
  })

  it('settles everything while something else owns the wheel', () => {
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} held={true} />)
    expect(wedges(container)).toEqual(['ana'])
    const wedge = container.querySelector('[data-segment-id="ana"]') as SVGGElement
    expect(wedge.style.opacity).toBe('1')
  })

  it('rests every wedge under reduced motion once the short fade is done', () => {
    matchMedia(true)
    const { container } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(wedges(container)).toEqual(['ana'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transition/usePresence.test.tsx`
Expected: FAIL — `Wheel` takes no `held`, and wedges carry no inline
opacity.

- [ ] **Step 3: Write the hook**

Create `src/transition/usePresence.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import type { Arc } from '../wheel/geometry'
import { paletteColor } from '../wheel/palette'
import type { Segment } from '../wheel/types'
import { type Drawn, type Track, advance, drawList, isDone, settle } from './tracks'
import type { Transitions } from './types'

/** Freezes the palette color onto the segment, so a departed wedge keeps it. */
function withColor(segments: Segment[]): Segment[] {
  return segments.map((segment, index) =>
    segment.color === undefined ? { ...segment, color: paletteColor(index) } : segment,
  )
}

export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
): Drawn[] {
  const tracks = useRef(new Map<string, Track>())
  const arcs = useRef(new Map<string, Arc>())
  const frame = useRef<number | null>(null)
  const [, tick] = useState(0)

  const now = typeof performance === 'undefined' ? 0 : performance.now()
  const colored = withColor(segments)

  // Rendering, not an effect: the first painted frame has to already show the
  // transition's start, or every arrival flashes at rest before it begins.
  tracks.current = held
    ? settle(tracks.current)
    : advance({
        tracks: tracks.current,
        segments: colored,
        arcs: arcs.current,
        transitions,
        now,
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      })

  const { drawn, arcs: laid } = drawList(tracks.current, now)
  arcs.current = laid

  const running = [...tracks.current.values()].some((track) => !isDone(track, now))

  // Self-scheduling: `running` only changes on the frame the last track
  // finishes, so an effect that scheduled one frame per change would render
  // exactly twice and stop.
  useEffect(() => {
    if (!running) return
    let active = true
    const step = () => {
      if (!active) return
      tick((n) => n + 1)
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => {
      active = false
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [running])

  return drawn
}
```

- [ ] **Step 4: Draw the list**

Replace the body of `src/wheel/Wheel.tsx`. The pointer block and the constants
above it are unchanged; only the props, the hook call, and the rotor's children
differ:

```tsx
import type { Ref } from 'react'
import { styleOf } from '../transition/css'
import type { Transitions } from '../transition/types'
import { usePresence } from '../transition/usePresence'
import { arcPath } from './geometry'
import { fitLabel } from './label'
import type { Segment } from './types'
import './Wheel.css'

export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
  transitions?: Transitions
  /**
   * Something other than the roster owns the geometry, so presences settle and
   * stay settled. A spin today; `useSpin` is growing a landed-frame hold that
   * means the same thing, so this takes the condition rather than the cause.
   */
  held?: boolean
}
```

```tsx
export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  held = false,
}: WheelProps) {
  const drawn = usePresence(segments, transitions, held)
  const half = radius + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
          {drawn.map(({ segment, arc, presence }) => {
            const width = arc.end - arc.start
            if (!(width > 0)) return null

            const d = arcPath(arc.start, arc.end, radius)
            if (d === '') return null

            const fitted = fitLabel(segment.label, width, radius)
            const midDeg = (arc.start + width / 2) * 360
            // Radial text reads upside down when its baseline points leftward on
            // screen. Flip those segments so every label reads left-to-right.
            const flipped = Math.cos(((midDeg + 90) * Math.PI) / 180) < 0
            const style = styleOf(presence, { angle: midDeg, radius, pivot: radius * 0.6 })

            return (
              <g
                key={segment.id}
                className="wheel__wedge"
                data-segment-id={segment.id}
                style={style}
              >
                <path className="wheel__segment" d={d} fill={segment.color} />
                {fitted && (
                  <text
                    className="wheel__label"
                    fontSize={fitted.fontSize}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${midDeg}) translate(0 ${-radius * 0.62}) rotate(90)${flipped ? ' rotate(180)' : ''}`}
                  >
                    {fitted.text}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </g>
```

The inline `style` here is the sampled animation frame — a value that changes
every frame and has no class to belong to. It is the exception the no-inline-styles
rule exists to make rare, not a shortcut around a stylesheet.

- [ ] **Step 5: Tell the wheel about the spin**

In `src/App.tsx`, pass the flag the hook needs:

```tsx
      <Wheel
        segments={displaySegments}
        rotorRef={rotorRef}
        transitions={preset.transitions}
        held={isSpinning}
      />
```

- [ ] **Step 6: Delete the old path**

```bash
git rm src/transition/useEnter.ts src/transition/useEnter.test.tsx
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/transition/ src/wheel/`
Expected: PASS. `Wheel.test.tsx` asserts on rendered arcs and labels, which the
draw list still produces; if a test there asserted a palette fill by index it now
reads the frozen color instead — same value, since `withColor` uses the same
`paletteColor(index)`.

- [ ] **Step 8: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add -A src/transition src/wheel/Wheel.tsx src/App.tsx
git commit -m "feat(wheel): sample wedge presence on one clock"
```

---

### Task 8: The shrink transition

The transition that declares `hold`. A departing wedge collapses into nothing
while its neighbors grow into the space, which is the reflow the spec describes
falling out of a declaration rather than being a setting.

**Files:**
- Create: `src/transition/transitions/shrink.ts`
- Create: `src/transition/transitions/shrink.test.ts`
- Modify: `src/transition/registry.ts`
- Modify: `src/transition/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/transition/transitions/shrink.test.ts`:

```ts
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

  it('scales with the arc so the wedge does not stretch', () => {
    const { keyframes } = shrink.frames({}, ctx('exit'))
    expect(keyframes[keyframes.length - 1].scale).toBe(0)
  })

  it('staggers by index', () => {
    expect(shrink.frames({ staggerMs: 30 }, { ...ctx('exit'), index: 2 }).delayMs).toBe(60)
  })

  it('falls back to its default stagger on a malformed param', () => {
    expect(shrink.frames({ staggerMs: 'soon' }, { ...ctx('exit'), index: 1 }).delayMs).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transition/transitions/shrink.test.ts`
Expected: FAIL — "Failed to resolve import './shrink'".

- [ ] **Step 3: Write the implementation**

Create `src/transition/transitions/shrink.ts`:

```ts
import { readNumber } from '../../tricks/params'
import type { Transition } from '../types'

const STAGGER_MS = 0

export const shrink: Transition = {
  id: 'shrink',
  name: 'Wedges shrink away',
  description: 'The arc itself closes, and the wedges beside it grow into the space.',
  scope: 'wedge',
  moments: ['enter', 'exit'],
  defaults: { durationMs: 500, staggerMs: STAGGER_MS },
  fields: [
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
  ],
  frames(params, ctx) {
    const [from, to] = ctx.moment === 'exit' ? [1, 0] : [0, 1]
    return {
      keyframes: [
        { at: 0, hold: from, scale: from, opacity: from },
        { at: 1, hold: to, scale: to, opacity: to },
      ],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
    }
  },
}
```

- [ ] **Step 4: Register it**

In `src/transition/registry.ts`:

```ts
import { fade } from './transitions/fade'
import { fly } from './transitions/fly'
import { shrink } from './transitions/shrink'
import type { Transition, TransitionId } from './types'

export const TRANSITIONS: Record<TransitionId, Transition> = { fade, fly, shrink }

export const TRANSITION_LIST: Transition[] = [fade, fly, shrink]
```

In `src/transition/registry.test.ts`, any test asserting the list's length or
contents needs `shrink` added. Run the file to see which.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/transition/`
Expected: PASS.

- [ ] **Step 6: Prove the reflow, end to end**

Append to `src/transition/tracks.test.ts`:

```ts
it('gives a shrinking wedge less arc and its neighbor more', () => {
  const shrinking: Transitions = {
    exit: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
  }
  const start = advance(
    input({ segments: [segment('ana'), segment('ben')], transitions: shrinking, now: 0 }),
  )
  const laid = drawList(start, 0)
  const leaving = advance(
    input({
      tracks: start,
      segments: [segment('ana')],
      arcs: laid.arcs,
      transitions: shrinking,
      now: 0,
    }),
  )
  const midway = drawList(leaving, 200)
  const ana = midway.drawn.find((item) => item.segment.id === 'ana')
  const ben = midway.drawn.find((item) => item.segment.id === 'ben')
  expect(ben?.presence.hold).toBeCloseTo(0.5)
  // ana is 1, ben is 0.5, so ana takes two thirds of the circle.
  expect(ana!.arc.end - ana!.arc.start).toBeCloseTo(2 / 3)
})
```

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/transition/
git commit -m "feat(transition): add shrink, which closes the arc as it leaves"
```

---

### Task 9: Arm a transition per moment

The panel hard-codes `enter`. Both membership moments need arming, and only
transitions that serve a moment should be offered for it.

**Files:**
- Modify: `src/editor/TransitionPanel.tsx`
- Modify: `src/editor/TransitionPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/editor/TransitionPanel.test.tsx`:

```tsx
it('arms a transition for departing wedges', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<TransitionPanel transitions={undefined} onChange={onChange} />)

  await user.selectOptions(screen.getByLabelText('Wedges leaving'), 'shrink')

  expect(onChange).toHaveBeenCalledWith({
    exit: { id: 'shrink', params: expect.objectContaining({ durationMs: 500 }) },
  })
})

it('keeps the other moment when one is disarmed', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const armed = {
    enter: { id: 'fade' as const, params: {} },
    exit: { id: 'fade' as const, params: {} },
  }
  render(<TransitionPanel transitions={armed} onChange={onChange} />)

  await user.selectOptions(screen.getByLabelText('Wedges leaving'), '')

  expect(onChange).toHaveBeenCalledWith({ enter: { id: 'fade', params: {} } })
})

it('offers only transitions that serve the moment', () => {
  render(<TransitionPanel transitions={undefined} onChange={vi.fn()} />)
  const options = [...screen.getByLabelText('Wedges leaving').querySelectorAll('option')]
  expect(options.map((option) => option.value)).toEqual(['', 'fade', 'fly', 'shrink'])
})
```

Match the file's existing imports; it already brings in `userEvent`, `render`,
`screen`, and `vi`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/TransitionPanel.test.tsx`
Expected: FAIL — no "Wedges leaving" control exists.

- [ ] **Step 3: Write the implementation**

Replace `src/editor/TransitionPanel.tsx`:

```tsx
import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { TRANSITION_LIST, getTransition } from '../transition/registry'
import type { Moment, TransitionParams, Transitions } from '../transition/types'
import { RecipeForm } from './RecipeForm'

export type TransitionPanelProps = {
  transitions: Transitions | undefined
  onChange: (transitions: Transitions | undefined) => void
}

const NONE = ''

const MOMENTS: { moment: Moment; label: string }[] = [
  { moment: 'enter', label: 'Wedges arriving' },
  { moment: 'exit', label: 'Wedges leaving' },
]

function without(transitions: Transitions | undefined, moment: Moment): Transitions | undefined {
  const rest = { ...transitions }
  delete rest[moment]
  return Object.keys(rest).length === 0 ? undefined : rest
}

export function TransitionPanel({ transitions, onChange }: TransitionPanelProps) {
  const arm = (moment: Moment) => (value: string) => {
    if (value === NONE) {
      onChange(without(transitions, moment))
      return
    }
    const chosen = getTransition(value)
    if (!chosen) return
    onChange({ ...transitions, [moment]: { id: chosen.id, params: { ...chosen.defaults } } })
  }

  const edit = (moment: Moment) => (params: TransitionParams) => {
    const armed = transitions?.[moment]
    if (!armed) return
    onChange({ ...transitions, [moment]: { ...armed, params } })
  }

  return (
    <PropertyPanel title="Transitions">
      {MOMENTS.map(({ moment, label }) => {
        const armed = transitions?.[moment]
        const transition = armed ? getTransition(armed.id) : null
        return (
          <div key={moment}>
            <SelectRow
              label={label}
              value={armed?.id ?? NONE}
              options={[
                { value: NONE, label: 'None' },
                ...TRANSITION_LIST.filter((item) => item.moments.includes(moment)).map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ]}
              onChange={arm(moment)}
            />
            {transition && armed ? (
              <RecipeForm
                fields={transition.fields}
                params={armed.params}
                segments={[]}
                onChange={edit(moment)}
              />
            ) : null}
          </div>
        )
      })}
    </PropertyPanel>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/editor/`
Expected: PASS. The existing enter tests still address "Wedges arriving", which
is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/editor/TransitionPanel.tsx src/editor/TransitionPanel.test.tsx
git commit -m "feat(editor): arm a transition for departing wedges"
```

---

### Task 10: Pin the selection guard

The drawn roster and the true roster are allowed to disagree. This task writes
the test that says selection never sees the difference — the one the spec calls
out as protecting the boundary.

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/transition/tracks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/transition/tracks.test.ts`:

```ts
it('settles a mid-flight roster to exactly the composed one', () => {
  const shrinking: Transitions = {
    enter: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
    exit: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
  }
  const start = advance(
    input({ segments: [segment('ana'), segment('ben')], transitions: shrinking, now: 0 }),
  )
  const leaving = advance(
    input({
      tracks: start,
      segments: [segment('ana')],
      arcs: drawList(start, 0).arcs,
      transitions: shrinking,
      now: 100,
    }),
  )
  const settled = settle(leaving)
  const { drawn } = drawList(settled, 200)

  expect(drawn.map((item) => item.segment.id)).toEqual(['ana'])
  expect(drawn[0].presence).toEqual(RESTING)
  expect(drawn[0].arc.end - drawn[0].arc.start).toBeCloseTo(1)
})
```

In `src/App.test.tsx`, append this to the `describe('feed', …)` block — it needs
the module-level `publish` helper declared just above that block, and
`installSpinHarness`, which stubs both `Element.prototype.animate` and
`requestAnimationFrame` because jsdom implements neither:

```tsx
it('spins against the composed roster, not the one still animating', async () => {
  const harness = installSpinHarness()
  try {
    // A four-second departure, so the drawn roster stays larger than the
    // composed one for the whole test.
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({
        ...DEFAULT_PRESET,
        transitions: { exit: { id: 'shrink', params: { durationMs: 4000, staggerMs: 0 } } },
      }),
    )
    render(<App />)

    await publish([{ id: 'zoe', label: 'Zoe' }])
    await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())

    await publish([])
    // Still drawn: the shrink has barely started. Without this the test would
    // pass for the trivial reason that she was already gone.
    expect(screen.getByText('Zoe')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /spin/i }))

    // Settled to the roster the spin planned against, mid-departure or not.
    expect(screen.queryByText('Zoe')).not.toBeInTheDocument()
  } finally {
    harness.restore()
  }
})
```

The neighboring `drops someone who leaves` test publishes an empty roster and
expects the wedge gone on the next tick. It stays green because `DEFAULT_PRESET`
arms no transitions, so `advance` drops a departing wedge immediately. If that
test starts failing, a default was added where the spec says there is none.

- [ ] **Step 2: Run the tests to verify they fail or pass for the right reason**

Run: `npx vitest run src/transition/tracks.test.ts src/App.test.tsx`
Expected: the `tracks` test passes immediately — `settle` was built in Task 4 and
this pins it. The App test should also pass; if it fails, the guard is broken and
that is a bug in this plan's work, not in the test.

- [ ] **Step 3: Run the whole suite, the build, and the linter**

Run: `npm test && npm run build && npx biome check .`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/transition/tracks.test.ts src/App.test.tsx
git commit -m "test(transition): pin selection to the composed roster"
```

---

### Task 11: See it move

Every prior task asserts on values. This one confirms the thing actually
animates in a browser, which no test in this repo can do.

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Arm both moments**

Open the editor at `#/edit`. In the Transitions panel set "Wedges arriving" to
*Wedges fly in from outside* and "Wedges leaving" to *Wedges shrink away*.

- [ ] **Step 3: Watch a departure**

Delete a segment. Confirm three things:

- the departing wedge's arc closes rather than vanishing
- the wedges beside it grow into the space smoothly, not in a jump
- nothing flickers at the moment the wedge is finally dropped

- [ ] **Step 4: Watch an interrupt**

Add a segment and delete it again before its entrance finishes. Confirm it
departs from wherever it had got to, rather than snapping to rest first.

Then delete a segment and re-add it mid-departure. Confirm it turns around, and
that only one wedge with that label ends up on the wheel.

- [ ] **Step 5: Watch a spin cancel it**

Delete a segment and click Spin while it is still leaving. Confirm the wheel
snaps to the composed roster immediately and the winner it names is one of the
wedges actually on it.

- [ ] **Step 6: Screenshot the result**

Capture the wheel mid-departure and open the image so it lands on screen.

- [ ] **Step 7: Commit anything the pass turned up**

If steps 3-5 revealed a defect, fix it with a test first, then commit. If they
did not, there is nothing to commit and the plan is done.

---

## What this leaves for the next plan

- `spin` and `reveal`, and the two wheel-scope transitions (`shutter`, `zoom`),
  which need the stage wrapper the entrance plan added but nothing else new.
- Transitions that turn one wedge into many — shards, particles, trails. They
  need a transition that brings its own rendering rather than a keyframe list,
  which is a second kind with its own registry entry and its own renderer.
