# blits wedge transitions: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Unbuilt.** Phase 5 of the blits migration. It starts once phases 2 and 4 have merged and blits 0.4.0 (with `hold` and `Mix.inert`) is pinned.

**Goal:** Wedge entrances and exits play as blits voices on the wedge mix instead of a per-frame React loop, and an interrupted transition carries on from where the wedge actually is.

**Architecture:** `advance` still diffs the roster, but where it used to store keyframes and a base to sample, it now cues one blits `keys` voice per transition on `motion.wedges`, with `locus: 'presence:<id>'`. An interruption fades the old voice and cues the new one with `from: 'current'`. `drawList` reads each wedge's presence from `wedges.probe(id)`. `usePresence` subscribes to the ticker: on a frame where only CSS-carried values moved it writes `--wedge-*` properties onto the wedge elements; it renders only when a wedge arrives, leaves, finishes, or an arc moves.

**Tech Stack:** TypeScript, React 19, Vitest + jsdom, Biome, `@msb235/blits` 0.4.0.

**Spec:** `docs/superpowers/specs/2026-10-03-blits-migration-design.md` (sections Structure, Wedge transitions, Tests → Wedge transitions).

## Readings taken where the spec is open

Accepted on 2026-10-04.

Each is answered below the way that keeps today's behavior, or the spec's where today's is a bug. Flip any before building.

1. Measured on 0.3.0: `from: 'current'` carries the interrupted voice's **speed** as well as its value. A fade-out cut into a fade-in at 40% keeps rising (0.40 → 0.49) for about 100 ms before it falls. Today it turns straight around. The plan keeps blits' behavior, since the spec chose `from: 'current'`.
2. The spec says React renders only on structural change. `shrink`, and the share ramp every exit runs by default, move arcs every frame, and a moving arc is a new path. The plan renders on frames where an arc moved and only writes CSS properties on the rest. Fade and fly entrances render nothing per frame.
3. The spec says every transition voice uses `from: 'current'`. Measured: a fresh entrance cued that way starts at rest, not at its declared first frame. Only interruptions use it.
4. The spec says wod calls `drop(id)` on `handle.done`. A voice holding after never reaches `done` until it is faded (blits `VoiceSpec.hold` docs), so the plan retires an exit on the frame its voice turns `held`.
5. A transition with `durationMs: 0` cues no voice: an entrance rests at once, an exit leaves at once. Today the exit's end frame is drawn for one frame first.
6. An interruption now moves every channel the old voice was moving: an entrance takes the ones its own frames don't mention back to rest, and an exit holds them where they stood. Today they sat at the interrupted value until the entrance finished, then snapped to rest.
7. Under `StrictMode` (dev only), React's mount–unmount–mount makes each first-paint entrance restart once, on the same timestamp. Nothing visible.

## Global Constraints

- Phases 2 and 4 have landed: `Syncable.inert`, `useSpin(segments, config, motion)`, `<Wheel motion={motion}>` required, `fakeMotion()` in `src/clock/testing.ts`, `motion.wedges: Mix<string, WedgePose>`, and `wedgeKit`/`WedgePose` exported from `src/clock/motion.ts`. If phase 4 put `wedgeKit` and `WedgePose` in `src/clock/mixes.ts` (the spec's layout), change this plan's imports to match; `grep -rn "export const wedgeKit" src/clock` finds it.
- `@msb235/blits` pinned exactly at `"0.4.0"`. Tests marked `// 0.4.0` depend on `hold` or `inert` and cannot pass on 0.3.0.
- One wheel per motion. Presence voices name wedges by segment id on `motion.wedges`; two wheels on one motion would share them.
- The `Wheel.tsx` snippets show this phase's change only. Phase 4 may have moved the lines around them; apply the change, don't paste the block over theirs.
- No inline styles: per-frame values go through `style.setProperty('--wedge-…')`.
- US English. Biome: single quotes, no semicolons, 2-space indent, 100 columns. Run `npm run check` before each commit.
- Comments only where the code can't say it and a reader would be hurt without it; 1–2 lines.
- Run only the test files a task names. The full suite runs on the fleet after merge (`onto test`).

## Measured on blits 0.3.0 (scratch scripts, not committed)

| What | Result |
|---|---|
| Probe of a subject with no voices | rest-bound channels present at rest (`mul` 1, `sum` 0); a `last` channel absent |
| `keys` default ease | linear: 0→1 over 400 ms reads 0.5 at 200 |
| `from: 'current'` | replaces the voice's stop at 0, explicit or not, with the subject's **last probed** pose: cued at 160 after a probe only at 100, it starts at the 100 ms value |
| `from: 'current'` and speed | carries the old voice's rate of change (question 1) |
| `fade: { in }` on the interrupting voice | starts from rest, not from current: discontinuous; not used |
| A channel first declared at 0.5 | holds that stop's value before it (old code interpolated from base) |
| `last({ lerp: linear })` | interpolates numerically between stops; absent when no voice writes it |
| An easing function as `ease` | passes through: `easeOut` reads 0.75 at half |
| Two weight-1 voices in one locus | average |

## Review Focus

- **Probe before interrupting.** `from: 'current'` reads the last probe, so `advance` must probe a wedge before cueing over it, or the new voice starts from a stale frame. Task 4 tests it.
- **An exit that never finishes.** An exit voice holding after stays in the mix until faded; if `retire` misses it, the ticker never sleeps. Task 6 tests that the clock sleeps after an exit.
- **React and the ticker writing the same properties.** React's `style` prop no longer carries `--wedge-*`; only `paintPresence` writes them, from a layout effect after each render and from the ticker between renders.
- **Interior stops.** blits eases each segment between stops; the old sampler eased overall progress, then interpolated. Identical for every registered transition (all two-stop); different for a future one with a stop in the middle.

## Files

| File | Responsibility |
|---|---|
| `src/transition/channels.ts` (new) | `PresencePose`, `presenceChannels` |
| `src/clock/motion.ts` | `wedgeKit` spreads `presenceChannels`; `WedgePose` includes `PresencePose` |
| `src/transition/types.ts`, `transitions/shrink.ts` | `hold` renamed `share` |
| `src/transition/voices.ts` (new) | `RESTING`, `stopsOf`, `presenceVoice`, `presenceOf` |
| `src/transition/tracks.ts` | roster diff cues voices; `drawList` probes; `retire`, `settle`, `release` |
| `src/transition/css.ts` | `paintPresence` |
| `src/transition/usePresence.ts` | render-time diff, ticker subscriber, element registry |
| `src/wheel/Wheel.tsx` | `wedgeRef` on each wedge; presence leaves the `style` prop |
| `src/transition/sample.ts`, `sample.test.ts` | deleted |
| spec | record what was built and measured |

---

### Task 1: Rename the presence `hold` to `share`

Pure rename on today's code, so every later task speaks one name. `hold` is now blits' voice option.

**Files:**
- Modify: `src/transition/types.ts`, `src/transition/transitions/shrink.ts`, `src/transition/sample.ts`, `src/transition/tracks.ts`
- Test: `src/transition/sample.test.ts`, `src/transition/tracks.test.ts`, `src/transition/transitions/shrink.test.ts`

- [ ] **Step 1: Rename in the types**

In `src/transition/types.ts`, `PresentationKeyframe`:

```ts
  /** 0…1 of the wedge's authored weight it occupies. The one property here that changes geometry. */
  share?: number
```

and `Presence`:

```ts
export type Presence = {
  share: number
  opacity: number
  ...
```

- [ ] **Step 2: Rename every use**

Run:

```bash
cd /Users/mike/src/wod
sed -i '' -E 's/\bhold\b/share/g; s/declaresHold/declaresShare/g' \
  src/transition/sample.ts src/transition/tracks.ts src/transition/transitions/shrink.ts \
  src/transition/sample.test.ts src/transition/tracks.test.ts src/transition/transitions/shrink.test.ts
grep -rn "\bhold\b\|declaresHold" src/transition
```

Expected: the grep prints nothing. Then read the diff (`git diff src/transition`) and fix any comment the substitution made ungrammatical ("ramps share both ways" reads fine; "releases its share at once" reads fine).

- [ ] **Step 3: Run the transition tests**

Run: `npx vitest run src/transition`
Expected: PASS, same count as before.

- [ ] **Step 4: Commit**

```bash
npm run check
git add src/transition
git commit -F - <<'EOF'
rename the presence hold to share, freeing hold for blits' voice option

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Presence channels on the wedge mix

**Files:**
- Create: `src/transition/channels.ts`
- Modify: `src/clock/motion.ts` (phase 4's `wedgeKit` and `WedgePose`)
- Test: `src/transition/channels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PresencePose = {
    share?: number; opacity?: number; scale?: number; offset?: number
    offsetAngle?: number; rotate?: number; aperture?: number
  }
  export const presenceChannels: Kit<PresencePose>
  ```
- Consumes: `kit`, `mul`, `sum`, `last` from `@msb235/blits`.

The spec's kit table lists `transform` and `clip` as channels. They can't be: a CSS string can't be interpolated in a locus crossfade, and `styleOf` needs the wedge's angle and radius, which only the Wheel knows. The mix carries the numbers; `styleOf` builds the strings.

- [ ] **Step 1: Write the failing test**

`src/transition/channels.test.ts`:

```ts
import { keys, mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { type WedgePose, wedgeKit } from '../clock/motion'

const wedges = () => mix<string, WedgePose>(wedgeKit)

describe('presence channels', () => {
  it('read at rest for a wedge no voice touches', () => {
    const w = wedges()
    w.sync(0)
    const pose = w.probe('ana')
    expect(pose).toMatchObject({
      share: 1,
      opacity: 1,
      scale: 1,
      offset: 0,
      rotate: 0,
      aperture: 1,
    })
    // Absent means the wedge's own angle, which no number can say.
    expect(pose.offsetAngle).toBeUndefined()
  })

  it('interpolate a direction as a number', () => {
    const w = wedges()
    w.cue({
      patch: keys<string, WedgePose>(400, [
        { at: 0, delta: { offsetAngle: 0 } },
        { at: 1, delta: { offsetAngle: 90 } },
      ]),
      subjects: ['ana'],
      start: 0,
      loop: false,
    })
    w.sync(200)
    expect(w.probe('ana').offsetAngle).toBe(45)
  })

  it('keep share and aperture inside 0…1', () => {
    const w = wedges()
    w.cue({
      patch: keys<string, WedgePose>(400, [{ at: 0, delta: { share: 1.5, aperture: -0.5 } }]),
      subjects: ['ana'],
      start: 0,
      loop: false,
    })
    w.sync(10)
    expect(w.probe('ana')).toMatchObject({ share: 1, aperture: 0 })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/transition/channels.test.ts`
Expected: FAIL: `share` is undefined, or `offsetAngle` is missing from `WedgePose`.

- [ ] **Step 3: Write the channels**

`src/transition/channels.ts`:

```ts
import { type Kit, kit, last, mul, sum } from '@msb235/blits'

/** Every value a wedge transition animates, as the wedge mix carries it. */
export type PresencePose = {
  share?: number
  opacity?: number
  scale?: number
  offset?: number
  /** Rest-less: absent means the wedge's own angle. */
  offsetAngle?: number
  rotate?: number
  aperture?: number
}

const linear = (a: number, b: number, u: number): number => a + (b - a) * u

export const presenceChannels: Kit<PresencePose> = kit<PresencePose>({
  share: mul({ bounds: [0, 1] }),
  opacity: mul(),
  scale: mul(),
  offset: sum(),
  offsetAngle: last<number>({ lerp: linear }),
  rotate: sum(),
  aperture: mul({ bounds: [0, 1] }),
})
```

- [ ] **Step 4: Put them in the wedge kit**

In `src/clock/motion.ts`, delete whatever phase 4 declared for `transform`, `opacity`, `clip` and `share` from `WedgePose` and from `wedgeKit`, then:

```ts
import { type PresencePose, presenceChannels } from '../transition/channels'

export type WedgePose = TrickPose & PresencePose
```

where `TrickPose` is phase 4's `weight`, `color`, `label`, `media`, `reveal` fields (name it `TrickPose` if phase 4 inlined them), and:

```ts
export const wedgeKit: Kit<WedgePose> = kit<WedgePose>({
  ...trickChannels,
  ...presenceChannels,
})
```

where `trickChannels` is phase 4's channel object for those five fields, pulled out under that name if it was inline.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/transition/channels.test.ts src/clock`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/transition/channels.ts src/transition/channels.test.ts src/clock/motion.ts
git commit -F - <<'EOF'
carry each wedge's presence as numbers on the wedge mix

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A transition as a blits voice

**Files:**
- Create: `src/transition/voices.ts`
- Test: `src/transition/voices.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const RESTING: Presence
  export type PresencePlan = {
    frames: PresentationKeyframe[]; delayMs: number; durationMs: number; easing?: EasingName
  }
  export function stopsOf(
    frames: PresentationKeyframe[], moment: 'enter' | 'exit', from: Presence | null,
  ): Keyframe<WedgePose>[]
  export function presenceVoice(
    id: string, plan: PresencePlan, moment: 'enter' | 'exit', now: number, from: Presence | null,
  ): VoiceSpec<string, WedgePose> | null
  export function presenceOf(pose: PresencePose): Presence
  ```
- Consumes: `EASINGS` (`src/keyframes/easing.ts`), `PresencePose` (Task 2), `WedgePose`.

- [ ] **Step 1: Write the failing tests**

`src/transition/voices.test.ts`. The `TODAY` table was produced from the old `advance` + `sampleTrack` (default params, `staggerMs: 0`, `durationMs: 400`) before this phase; it is the "Enter matches today" case.

```ts
import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { type WedgePose, wedgeKit } from '../clock/motion'
import { TRANSITIONS } from './registry'
import type { Presence, TransitionId } from './types'
import { type PresencePlan, RESTING, presenceOf, presenceVoice, stopsOf } from './voices'

const planOf = (id: TransitionId, moment: 'enter' | 'exit'): PresencePlan => {
  const { keyframes, delayMs, easing } = TRANSITIONS[id].frames(
    { staggerMs: 0, durationMs: 400 },
    { index: 0, count: 1, angle: 0, durationMs: 400, moment },
  )
  return { frames: keyframes, delayMs, durationMs: 400, easing }
}

/** What the old sampler drew at 0, 200 and 400 ms. */
const TODAY: Record<string, Partial<Presence>[]> = {
  'fade.enter': [{ opacity: 0 }, { opacity: 0.75 }, {}],
  'fade.exit': [{}, { share: 0.25, opacity: 0.25 }, { share: 0, opacity: 0 }],
  'fly.enter': [
    { opacity: 0, scale: 0.9, offset: 1.6 },
    { opacity: 0.75, scale: 0.975, offset: 0.4 },
    {},
  ],
  'fly.exit': [
    {},
    { share: 0.25, opacity: 0.25, scale: 0.925, offset: 1.2 },
    { share: 0, opacity: 0, scale: 0.9, offset: 1.6 },
  ],
  'shrink.enter': [
    { share: 0, opacity: 0, scale: 0 },
    { share: 0.5, opacity: 0.5, scale: 0.5 },
    {},
  ],
  'shrink.exit': [{}, { share: 0.5, opacity: 0.5, scale: 0.5 }, { share: 0, opacity: 0, scale: 0 }],
}

describe('a transition as a voice', () => {
  for (const [name, expected] of Object.entries(TODAY)) {
    // 0.4.0: an exit's 400 ms frame is its held last frame.
    it(`plays ${name} as today`, () => {
      const [id, moment] = name.split('.') as [TransitionId, 'enter' | 'exit']
      const w = mix<string, WedgePose>(wedgeKit)
      const spec = presenceVoice('ana', planOf(id, moment), moment, 0, null)
      if (!spec) throw new Error('no voice')
      w.cue(spec)
      ;[0, 200, 400].forEach((t, i) => {
        w.sync(t)
        const got = presenceOf(w.probe('ana'))
        for (const [key, value] of Object.entries({ ...RESTING, ...expected[i] })) {
          expect(got[key as keyof Presence], `${key} at ${t}`).toBeCloseTo(value as number, 6)
        }
      })
    })
  }
})

describe('stopsOf', () => {
  it('starts a channel declared late from rest, as the old sampler did', () => {
    const stops = stopsOf(
      [
        { at: 0.5, opacity: 0 },
        { at: 1, opacity: 1 },
      ],
      'enter',
      null,
    )
    expect(stops).toEqual([
      { at: 0, delta: { opacity: 1, share: 1 } },
      { at: 0.5, delta: { opacity: 0 } },
      { at: 1, delta: { opacity: 1, share: 1 } },
    ])
  })

  it('ramps share in when the transition declares none', () => {
    const stops = stopsOf([{ at: 0, opacity: 0 }], 'enter', { ...RESTING, share: 0.3 })
    expect(stops[0].delta.share).toBe(0.3)
    expect(stops.at(-1)?.delta.share).toBe(1)
  })

  it('releases share on the way out when the transition declares none', () => {
    const stops = stopsOf([{ at: 1, opacity: 0 }], 'exit', null)
    expect(stops[0].delta.share).toBe(1)
    expect(stops.at(-1)?.delta.share).toBe(0)
  })

  it('leaves share to a transition that declares it', () => {
    const stops = stopsOf(
      [
        { at: 0, share: 1 },
        { at: 1, share: 0 },
      ],
      'exit',
      null,
    )
    expect(stops.map((stop) => stop.delta.share)).toEqual([1, 0])
  })

  it('takes a silent channel back to rest when an entrance interrupts', () => {
    const stops = stopsOf([{ at: 1, opacity: 1 }], 'enter', { ...RESTING, offset: 0.4 })
    expect(stops[0].delta.offset).toBe(0.4)
    expect(stops.at(-1)?.delta.offset).toBe(0)
  })

  it('holds a silent channel where it stands when an exit interrupts', () => {
    const stops = stopsOf([{ at: 1, opacity: 0 }], 'exit', { ...RESTING, offset: 0.4 })
    expect(stops[0].delta.offset).toBe(0.4)
    expect(stops.at(-1)?.delta.offset).toBe(0.4)
  })

  it('leaves the direction out unless a frame names one', () => {
    const stops = stopsOf([{ at: 0, offset: 1 }], 'enter', null)
    expect(stops.every((stop) => !('offsetAngle' in stop.delta))).toBe(true)
  })
})

describe('presenceVoice', () => {
  const plan: PresencePlan = { frames: [{ at: 0, opacity: 0 }], delayMs: 200, durationMs: 400 }

  it('holds an entrance both ways and an exit after', () => {
    expect(presenceVoice('ana', plan, 'enter', 0, null)?.hold).toBe('both')
    expect(presenceVoice('ana', plan, 'exit', 0, null)?.hold).toBe('after')
  })

  it('starts after its stagger, in the wedge own locus', () => {
    const spec = presenceVoice('ana', plan, 'enter', 1000, null)
    expect(spec).toMatchObject({ start: 1200, subjects: ['ana'], locus: 'presence:ana' })
    expect(spec?.loop).toBe(false)
  })

  it('reads from where the wedge stands only when it interrupts', () => {
    expect(presenceVoice('ana', plan, 'enter', 0, null)?.from).toBeUndefined()
    expect(presenceVoice('ana', plan, 'enter', 0, RESTING)?.from).toBe('current')
  })

  it('cues nothing for a transition with no duration', () => {
    expect(presenceVoice('ana', { ...plan, durationMs: 0 }, 'enter', 0, null)).toBeNull()
  })
})

describe('presenceOf', () => {
  it('fills what a pose leaves out from rest', () => {
    expect(presenceOf({})).toEqual(RESTING)
  })

  it('keeps a direction only when the pose has one', () => {
    expect(presenceOf({ offsetAngle: 30 }).offsetAngle).toBe(30)
    expect('offsetAngle' in presenceOf({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/transition/voices.test.ts`
Expected: FAIL: `Cannot find module './voices'`.

- [ ] **Step 3: Write `voices.ts`**

`src/transition/voices.ts`:

```ts
import { type Keyframe, type VoiceSpec, keys } from '@msb235/blits'
import type { WedgePose } from '../clock/motion'
import { EASINGS } from '../keyframes/easing'
import type { EasingName } from '../wheel/types'
import type { PresencePose } from './channels'
import type { Presence, PresentationKeyframe } from './types'

/** A wedge sitting in its arc with nothing applied. */
// Handed out by identity to every resting wedge, so a consumer writing into one
// sample would move them all.
export const RESTING: Presence = Object.freeze({
  share: 1,
  opacity: 1,
  scale: 1,
  offset: 0,
  rotate: 0,
  aperture: 1,
})

const KEYS = ['share', 'opacity', 'scale', 'offset', 'offsetAngle', 'rotate', 'aperture'] as const
type Key = (typeof KEYS)[number]

export type PresencePlan = {
  frames: PresentationKeyframe[]
  delayMs: number
  durationMs: number
  /** Absent means `easeOut`, the curve the entrance path has always run on. */
  easing?: EasingName
}

const declares = (frames: PresentationKeyframe[], key: Key): boolean =>
  frames.some((frame) => frame[key] !== undefined)

/**
 * The frames as one `keys` patch's stops. `from` is where an interrupted wedge
 * stands, null for a fresh start. Every channel gets a stop at 0: blits holds a
 * channel's first stop before it, where the old sampler ramped from the base.
 */
export function stopsOf(
  frames: PresentationKeyframe[],
  moment: 'enter' | 'exit',
  from: Presence | null,
): Keyframe<WedgePose>[] {
  const byAt = new Map<number, Partial<PresencePose>>()
  const put = (at: number, key: Key, value: number) => {
    const delta = byAt.get(at) ?? {}
    delta[key] = value
    byAt.set(at, delta)
  }
  const start = from ?? RESTING

  for (const key of KEYS) {
    const points = frames.filter((frame) => frame[key] !== undefined).sort((a, b) => a.at - b.at)
    if (points.length === 0) continue
    if (points[0].at > 0) put(0, key, start[key] ?? 0)
    for (const point of points) put(point.at, key, point[key] as number)
  }

  if (!declares(frames, 'share')) {
    put(0, 'share', start.share)
    put(1, 'share', moment === 'exit' ? 0 : 1)
  }

  // The interrupted voice is faded, so a channel this one is silent on would snap to rest.
  if (from) {
    for (const key of KEYS) {
      const value = from[key]
      if (key === 'share' || value === undefined || declares(frames, key)) continue
      put(0, key, value)
      put(1, key, moment === 'exit' ? value : (RESTING[key] ?? value))
    }
  }

  return [...byAt.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, delta]) => ({ at, delta: delta as Partial<WedgePose> }))
}

/** The voice that plays one wedge's transition, or null when it has no time to play. */
export function presenceVoice(
  id: string,
  plan: PresencePlan,
  moment: 'enter' | 'exit',
  now: number,
  from: Presence | null,
): VoiceSpec<string, WedgePose> | null {
  if (!(plan.durationMs > 0)) return null
  const spec: VoiceSpec<string, WedgePose> = {
    patch: keys<string, WedgePose>(plan.durationMs, stopsOf(plan.frames, moment, from), {
      ease: EASINGS[plan.easing ?? 'easeOut'],
    }),
    subjects: [id],
    start: now + plan.delayMs,
    loop: false,
    // An entrance shows its first frame through its stagger; both show their last
    // until wod takes the voice out.
    hold: moment === 'enter' ? 'both' : 'after',
    locus: `presence:${id}`,
  }
  if (from) spec.from = 'current'
  return spec
}

export function presenceOf(pose: PresencePose): Presence {
  const presence: Presence = {
    share: pose.share ?? 1,
    opacity: pose.opacity ?? 1,
    scale: pose.scale ?? 1,
    offset: pose.offset ?? 0,
    rotate: pose.rotate ?? 0,
    aperture: pose.aperture ?? 1,
  }
  if (pose.offsetAngle !== undefined) presence.offsetAngle = pose.offsetAngle
  return presence
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/transition/voices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/transition/voices.ts src/transition/voices.test.ts
git commit -F - <<'EOF'
turn a wedge transition into one blits keys voice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The roster diff cues voices

**Files:**
- Modify: `src/transition/tracks.ts` (rewrite)
- Test: `src/transition/tracks.test.ts` (rewrite)

**Interfaces:**
- Produces:
  ```ts
  export type Wedges = Mix<string, WedgePose>
  export type Track = {
    id: string; phase: Phase; segment: Segment
    voice: Handle<string> | null; ghostArc: Arc | null
  }
  export type AdvanceInput = {
    tracks: Map<string, Track>; segments: Segment[]; arcs: Map<string, Arc>
    transitions: Transitions | undefined; now: number; reduced: boolean; wedges: Wedges
  }
  export function isDone(track: Track): boolean
  export function advance(input: AdvanceInput): Map<string, Track>
  export function retire(tracks: Map<string, Track>, wedges: Wedges): Map<string, Track> | null
  export function drawList(tracks: Map<string, Track>, wedges: Wedges): { drawn: Drawn[]; arcs: Map<string, Arc> }
  export function settle(tracks: Map<string, Track>, segments: Segment[], wedges: Wedges): Map<string, Track>
  export function release(tracks: Map<string, Track>, wedges: Wedges): void
  ```
- Consumes: `presenceVoice`, `presenceOf`, `RESTING`, `PresencePlan` (Task 3).

`advance`, `retire`, `settle` and `release` cue and fade voices: they act on the mix as well as returning tracks. `drawList` reads the mix at its last `sync`; callers sync first.

- [ ] **Step 1: Write the failing tests**

Replace `src/transition/tracks.test.ts` with:

```ts
import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { type WedgePose, wedgeKit } from '../clock/motion'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { type AdvanceInput, type Track, type Wedges, advance, drawList, retire, settle } from './tracks'
import type { Transitions } from './types'
import { RESTING } from './voices'

const segment = (id: string, weight = 1): Segment => ({ id, label: id, weight })

const enterOnly: Transitions = { enter: { id: 'fade', params: { staggerMs: 0 } } }
const both: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
}
const shrinking: Transitions = {
  enter: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
  exit: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
}
const staggered: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 100, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 100, durationMs: 400 } },
}

const wedges = (): Wedges => mix<string, WedgePose>(wedgeKit)

/** Syncs the mix to `now`, as usePresence does before every diff, then diffs. */
const run = (w: Wedges, over: Partial<AdvanceInput> = {}): Map<string, Track> => {
  const now = over.now ?? 0
  w.sync(now)
  return advance({
    tracks: new Map(),
    segments: [segment('ana')],
    arcs: new Map(),
    transitions: both,
    now,
    reduced: false,
    wedges: w,
    ...over,
  })
}

const draw = (w: Wedges, tracks: Map<string, Track>, t: number) => {
  w.sync(t)
  return drawList(tracks, w)
}

const presenceAt = (w: Wedges, tracks: Map<string, Track>, id: string, t: number) =>
  draw(w, tracks, t).drawn.find((item) => item.segment.id === id)?.presence

describe('advance', () => {
  it('enters every wedge on first paint', () => {
    expect(run(wedges()).get('ana')?.phase).toBe('entering')
  })

  it('leaves a wedge that was already there alone', () => {
    const w = wedges()
    const first = run(w)
    const second = run(w, { tracks: first, now: 100 })
    expect(second.get('ana')?.voice).toBe(first.get('ana')?.voice)
  })

  it('exits a wedge that leaves the roster', () => {
    const w = wedges()
    const first = run(w)
    expect(run(w, { tracks: first, segments: [], now: 1000 }).get('ana')?.phase).toBe('exiting')
  })

  it('drops an exiting wedge once its transition finishes', () => {
    const w = wedges()
    const exiting = run(w, { tracks: run(w), segments: [], now: 1000 })
    const done = run(w, { tracks: exiting, segments: [], now: 1401 })
    expect(done.has('ana')).toBe(false)
  })

  it('keeps drawing a departed wedge until then', () => {
    const w = wedges()
    const exiting = run(w, { tracks: run(w), segments: [], now: 1000 })
    const midway = run(w, { tracks: exiting, segments: [], now: 1100 })
    expect(midway.get('ana')?.segment.label).toBe('ana')
  })

  it('starts an interrupting transition from where the wedge stands', () => {
    // A quarter into a 400 ms ease-out fade: 1 - 0.75² of the way.
    const w = wedges()
    const entering = run(w)
    expect(presenceAt(w, entering, 'ana', 100)?.opacity).toBeCloseTo(0.4375)
    const exiting = run(w, { tracks: entering, segments: [], now: 100 })
    expect(presenceAt(w, exiting, 'ana', 100)?.opacity).toBeCloseTo(0.4375, 3)
    expect(presenceAt(w, exiting, 'ana', 116)?.opacity).toBeCloseTo(0.4375, 1)
  })

  it('starts from the frame it interrupts even when nothing probed that frame', () => {
    // blits' `from: 'current'` reads the last probe, so advance has to take one.
    const w = wedges()
    const entering = run(w)
    presenceAt(w, entering, 'ana', 20)
    const exiting = run(w, { tracks: entering, segments: [], now: 100 })
    expect(presenceAt(w, exiting, 'ana', 100)?.opacity).toBeCloseTo(0.4375, 3)
  })

  it('reverses a wedge that re-joins while exiting', () => {
    const w = wedges()
    const present = run(w, { tracks: run(w), now: 1000 })
    const exiting = run(w, { tracks: present, segments: [], now: 1000 })
    const leaving = presenceAt(w, exiting, 'ana', 1100)?.opacity
    const back = run(w, { tracks: exiting, now: 1100 })
    expect(back.get('ana')?.phase).toBe('entering')
    expect(back.size).toBe(1)
    // A quarter of the way out of an ease-out fade: 1 - 0.4375.
    expect(leaving).toBeCloseTo(0.5625)
    expect(presenceAt(w, back, 'ana', 1100)?.opacity).toBeCloseTo(0.5625, 3)
  })

  it('promotes a finished entrance to present and lets its voice go', () => {
    const w = wedges()
    const present = run(w, { tracks: run(w), now: 1000 })
    expect(present.get('ana')).toMatchObject({ phase: 'present', voice: null })
  })

  it('leaves a wedge alone when its moment has no transition', () => {
    const w = wedges()
    const tracks = run(w, { transitions: enterOnly })
    expect(run(w, { tracks, segments: [], transitions: enterOnly, now: 10 }).has('ana')).toBe(false)
  })

  it('leaves a wedge alone when its transition id is unknown', () => {
    // Ids come out of localStorage, so one that no longer exists is reachable.
    const unknown = { enter: { id: 'nope' }, exit: { id: 'nope' } } as unknown as Transitions
    const w = wedges()
    const tracks = run(w, { transitions: unknown })
    expect(tracks.get('ana')?.phase).toBe('present')
    expect(run(w, { tracks, segments: [], transitions: unknown, now: 10 }).has('ana')).toBe(false)
  })

  it('rests a wedge at once when its transition has no duration', () => {
    const instant: Transitions = { enter: { id: 'shrink', params: { durationMs: 0 } } }
    const w = wedges()
    const tracks = run(w, { transitions: instant })
    expect(tracks.get('ana')?.phase).toBe('present')
    expect(presenceAt(w, tracks, 'ana', 0)?.share).toBe(1)
  })

  // 0.4.0: hold 'before' shows the first frame through the stagger.
  it('holds a waiting wedge at its declared start until its turn', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')], transitions: staggered })
    expect(presenceAt(w, tracks, 'ben', 50)?.opacity).toBe(0)
  })

  // 0.4.0: hold 'before' on a `from: 'current'` voice.
  it('holds an interrupted wedge where it stands until its turn', () => {
    const w = wedges()
    const entering = run(w, { segments: [segment('ana'), segment('ben')] })
    const exiting = run(w, { tracks: entering, segments: [], transitions: staggered, now: 100 })
    expect(presenceAt(w, exiting, 'ben', 150)?.opacity).toBeCloseTo(0.4375, 3)
  })

  it('ramps share both ways when the transition declares none', () => {
    const w = wedges()
    const entering = run(w)
    expect(presenceAt(w, entering, 'ana', 100)?.share).toBe(1)
    const exiting = run(w, { tracks: entering, segments: [], now: 100 })
    // Still holding a quarter of its arc halfway out. Releasing it at once would
    // expand the survivors under a wedge still painted at full width.
    expect(presenceAt(w, exiting, 'ana', 300)?.share).toBeCloseTo(0.25)
  })

  it('leaves the tracks it was given untouched', () => {
    const w = wedges()
    const first = run(w)
    const before = { ...first.get('ana') }
    run(w, { tracks: first, segments: [{ ...segment('ana'), label: 'Ana L.' }], now: 1000 })
    run(w, { tracks: first, segments: [], now: 100 })
    expect(first.size).toBe(1)
    expect(first.get('ana')).toEqual(before)
  })

  it('tracks a label change without restarting anything', () => {
    const w = wedges()
    const first = run(w)
    const renamed = run(w, {
      tracks: first,
      segments: [{ ...segment('ana'), label: 'Ana L.' }],
      now: 100,
    })
    expect(renamed.get('ana')?.segment.label).toBe('Ana L.')
    expect(renamed.get('ana')?.voice).toBe(first.get('ana')?.voice)
  })

  it('keeps a departing wedge in the slot it held', () => {
    const w = wedges()
    const start = run(w, { segments: [segment('ana'), segment('ben'), segment('cy')] })
    const leaving = run(w, { tracks: start, segments: [segment('ana'), segment('cy')] })
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy'])
  })

  it('keeps a departing wedge ahead of the roster it led', () => {
    const w = wedges()
    const start = run(w, { segments: [segment('ana'), segment('ben'), segment('cy')] })
    const leaving = run(w, { tracks: start, segments: [segment('ben'), segment('cy')] })
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy'])
  })

  it('keeps consecutive departing wedges in order behind their neighbor', () => {
    const w = wedges()
    const four = ['ana', 'ben', 'cy', 'dee'].map((id) => segment(id))
    const start = run(w, { segments: four })
    const leaving = run(w, { tracks: start, segments: [segment('ana'), segment('dee')] })
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy', 'dee'])
  })

  it('refreshes a shrinking wedge to its last non-zero arc', () => {
    const w = wedges()
    const start = run(w, {
      segments: [segment('ana'), segment('ben')],
      transitions: shrinking,
      now: -1000,
    })
    const settled = run(w, { tracks: start, segments: [segment('ana'), segment('ben')], transitions: shrinking })
    const leaving = run(w, {
      tracks: settled,
      segments: [segment('ana')],
      arcs: draw(w, settled, 0).arcs,
      transitions: shrinking,
    })
    const laid = draw(w, leaving, 100)
    const next = run(w, {
      tracks: leaving,
      segments: [segment('ana')],
      arcs: laid.arcs,
      transitions: shrinking,
      now: 100,
    })
    expect(next.get('ben')?.ghostArc).toEqual(laid.arcs.get('ben'))
  })
})

describe('retire', () => {
  it('has nothing to do while every voice still plays', () => {
    const w = wedges()
    const tracks = run(w)
    w.sync(100)
    expect(retire(tracks, w)).toBeNull()
  })

  // 0.4.0: a voice holding after reads 'held' once played.
  it('promotes a played entrance and forgets a played exit', () => {
    const w = wedges()
    const start = run(w, { segments: [segment('ana'), segment('ben')], now: -1000 })
    const present = run(w, { tracks: start, segments: [segment('ana'), segment('ben')] })
    const leaving = run(w, { tracks: present, segments: [segment('ana')], now: 0 })
    w.sync(400)
    w.probe('ben')
    const next = retire(leaving, w)
    expect(next && [...next.keys()]).toEqual(['ana'])
  })
})

describe('drawList', () => {
  /** ana at rest; ben leaving by shrink from 0. */
  const leavingBen = (w: Wedges, anaWeight = 1) => {
    const roster = [segment('ana', anaWeight), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking, now: -1000 })
    const settled = run(w, { tracks: start, segments: roster, transitions: shrinking })
    return run(w, {
      tracks: settled,
      segments: [segment('ana', anaWeight)],
      arcs: draw(w, settled, 0).arcs,
      transitions: shrinking,
    })
  }

  it('lays out live wedges in track order', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')], transitions: {} })
    const { drawn } = draw(w, tracks, 0)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
    expect(drawn[0].arc.start).toBe(0)
  })

  it('lays out a wedge by its weight as well as its share', () => {
    // Halfway through an ease-in-out shrink: ben holds half of its 1 against ana's 3.
    const w = wedges()
    const ben = draw(w, leavingBen(w, 3), 200).drawn.find((item) => item.segment.id === 'ben')
    expect(ben && ben.arc.end - ben.arc.start).toBeCloseTo(0.5 / 3.5)
  })

  // 0.4.0: the exit holds its last frame, share 0, until retired.
  it('draws a wedge at zero share on its frozen arc, out of the layout', () => {
    const w = wedges()
    const tracks = leavingBen(w)
    const frozen = tracks.get('ben')?.ghostArc
    const { drawn, arcs } = draw(w, tracks, 400)
    const ben = drawn.find((item) => item.segment.id === 'ben')
    const ana = drawn.find((item) => item.segment.id === 'ana')
    expect(ben?.arc).toEqual(frozen)
    expect(ben?.presence.share).toBe(0)
    expect(arcs.has('ben')).toBe(false)
    expect(ana && ana.arc.end - ana.arc.start).toBeCloseTo(1)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
  })

  it('drops a ghost that never had an arc', () => {
    const w = wedges()
    const start = run(w, { now: -1000 })
    const present = run(w, { tracks: start })
    const leaving = run(w, { tracks: present, segments: [], transitions: shrinking })
    expect(draw(w, leaving, 400).drawn).toHaveLength(0)
  })

  it('reports the arcs it laid out, for the next departure to freeze', () => {
    const w = wedges()
    const tracks = run(w, { transitions: {} })
    expect(draw(w, tracks, 0).arcs.get('ana')).toEqual({ id: 'ana', start: 0, end: 1 })
  })

  it('hands back the shared resting presence for a settled wedge', () => {
    const w = wedges()
    const tracks = run(w, { transitions: {} })
    expect(draw(w, tracks, 0).drawn[0].presence).toBe(RESTING)
  })
})

describe('advance through drawList', () => {
  it('draws a departed wedge at the arc it last held', () => {
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const present = run(w, { tracks: run(w, { segments: roster, now: -1000 }), segments: roster })
    const before = draw(w, present, 0)
    const leaving = run(w, { tracks: present, segments: [segment('ana')], arcs: before.arcs })
    const ben = draw(w, leaving, 0).drawn.find((item) => item.segment.id === 'ben')
    expect(ben?.arc).toEqual(before.arcs.get('ben'))
  })

  it('moves no survivor on the frame a neighbor starts leaving', () => {
    const w = wedges()
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const start = run(w, { segments: roster, transitions: shrinking, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: shrinking })
    const before = draw(w, present, 0)
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana'), segment('cy')],
      arcs: before.arcs,
      transitions: shrinking,
    })
    const after = draw(w, leaving, 0)
    const at = (list: typeof after.drawn, id: string) => list.find((item) => item.segment.id === id)
    expect(at(after.drawn, 'cy')?.arc).toEqual(at(before.drawn, 'cy')?.arc)
    expect(at(after.drawn, 'ben')?.arc).toEqual(at(before.drawn, 'ben')?.arc)
  })

  it('gives a shrinking wedge less arc and its neighbor more', () => {
    // The spec's "shrink reflows": at 50%, ana widens by what ben let go.
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: shrinking })
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana')],
      arcs: draw(w, present, 0).arcs,
      transitions: shrinking,
    })
    const midway = draw(w, leaving, 200)
    const ana = midway.drawn.find((item) => item.segment.id === 'ana')
    const ben = midway.drawn.find((item) => item.segment.id === 'ben')
    expect(ben?.presence.share).toBeCloseTo(0.5)
    expect(ana && ana.arc.end - ana.arc.start).toBeCloseTo(2 / 3)
  })

  // 0.4.0: the end reading is the exit's held last frame.
  it('still closes a shrinking wedge under reduced motion, over its shorter duration', () => {
    // Reduced motion substitutes fade, which declares no share of its own.
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking, reduced: true, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: shrinking, reduced: true })
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana')],
      arcs: draw(w, present, 0).arcs,
      transitions: shrinking,
      reduced: true,
    })
    expect(presenceAt(w, leaving, 'ben', 0)?.share).toBe(1)
    expect(presenceAt(w, leaving, 'ben', REDUCED_MOTION_MS)?.share).toBe(0)
  })

  // 0.4.0: the reversal's end reading is its held last frame.
  it('turns a half-closed wedge around and opens it fully', () => {
    const closing: Transitions = { enter: both.enter, exit: shrinking.exit }
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: closing, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: closing })
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana')],
      arcs: draw(w, present, 0).arcs,
      transitions: closing,
    })
    expect(presenceAt(w, leaving, 'ben', 200)?.share).toBeCloseTo(0.5)
    const back = run(w, {
      tracks: leaving,
      segments: roster,
      arcs: draw(w, leaving, 200).arcs,
      transitions: closing,
      now: 200,
    })
    expect(presenceAt(w, back, 'ben', 200)?.share).toBeCloseTo(0.5, 3)
    expect(presenceAt(w, back, 'ben', 600)).toMatchObject({ share: 1, opacity: 1, scale: 1 })
  })
})

describe('settle', () => {
  it('drops everything off the roster and rests what is on it', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')] })
    const settled = settle(tracks, [segment('ana')], w)
    expect([...settled.keys()]).toEqual(['ana'])
    expect(settled.get('ana')).toMatchObject({ phase: 'present', voice: null })
    expect(presenceAt(w, settled, 'ana', 1)).toBe(RESTING)
  })

  // 0.4.0: inert.
  it('takes every presence voice out of the mix', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')] })
    settle(tracks, [segment('ana')], w)
    w.sync(1)
    w.probe('ana')
    expect(w.inert).toBe(true)
  })

  it('settles a mid-flight roster to exactly the composed one', () => {
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking })
    const leaving = run(w, {
      tracks: start,
      segments: [segment('ana')],
      arcs: draw(w, start, 100).arcs,
      transitions: shrinking,
      now: 100,
    })
    expect(draw(w, leaving, 200).drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])

    const { drawn } = draw(w, settle(leaving, [segment('ana')], w), 200)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana'])
    expect(drawn[0].presence).toEqual(RESTING)
    expect(drawn[0].arc.end - drawn[0].arc.start).toBeCloseTo(1)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: FAIL: `retire` is not exported, and `advance` ignores `wedges`.

- [ ] **Step 3: Rewrite `tracks.ts`**

Replace `src/transition/tracks.ts` with:

```ts
import type { Handle, Mix } from '@msb235/blits'
import type { WedgePose } from '../clock/motion'
import { readNumber } from '../tricks/params'
import { type Arc, arcs as layoutArcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { getTransition } from './registry'
import { fade } from './transitions/fade'
import type { Moment, Presence, Transitions } from './types'
import { type PresencePlan, RESTING, presenceOf, presenceVoice } from './voices'

export type Phase = 'entering' | 'present' | 'exiting'

export type Wedges = Mix<string, WedgePose>

export type Track = {
  id: string
  phase: Phase
  /** Last composed, so a departed wedge can still be drawn. */
  segment: Segment
  /** The voice playing this phase; null for a wedge at rest. */
  voice: Handle<string> | null
  /** Where it sat when it left the layout, for drawing it once it holds no arc. */
  ghostArc: Arc | null
}

export type AdvanceInput = {
  tracks: Map<string, Track>
  /** The composed roster now. */
  segments: Segment[]
  /** Last frame's layout: where a departing wedge freezes, and the angle each transition points from. */
  arcs: Map<string, Arc>
  transitions: Transitions | undefined
  now: number
  reduced: boolean
  /** Synced to `now` by the caller. */
  wedges: Wedges
}

/** Played out: its voice holds its last frame, or it has none. */
export function isDone(track: Track): boolean {
  if (track.phase === 'present' || track.voice === null) return true
  return track.voice.state === 'held' || track.voice.state === 'done'
}

function inFlight(track: Track): boolean {
  return track.phase !== 'present' && !isDone(track)
}

function stop(track: Track): void {
  if (track.voice && track.voice.state !== 'done') track.voice.fade({ over: 0 })
}

function forget(wedges: Wedges, track: Track): void {
  stop(track)
  wedges.drop(track.id)
}

function promote(track: Track): Track {
  stop(track)
  return { ...track, phase: 'present', voice: null }
}

function planTrack(
  transitions: Transitions | undefined,
  moment: Moment,
  index: number,
  count: number,
  angle: number,
  reduced: boolean,
): PresencePlan | null {
  const instance = transitions?.[moment]
  if (!instance) return null
  const authored = getTransition(instance.id)
  if (!authored) return null
  // A stored preset can arm any transition at any moment, including one it does
  // not serve; no registered transition refuses a moment yet, so this is untested.
  if (!authored.moments.includes(moment)) return null

  const transition = reduced ? fade : authored
  const params = reduced ? { staggerMs: 0 } : instance.params
  const durationMs = reduced
    ? REDUCED_MOTION_MS
    : readNumber(instance.params, 'durationMs', readNumber(transition.defaults, 'durationMs', 400))

  const { keyframes, delayMs, easing } = transition.frames(params, {
    index,
    count,
    angle,
    durationMs,
    moment,
  })
  return { frames: keyframes, delayMs, durationMs, easing }
}

function angleOf(arc: Arc | undefined): number {
  if (!arc) return 0
  return (arc.start + (arc.end - arc.start) / 2) * 360
}

function restingTrack(segment: Segment): Track {
  return { id: segment.id, phase: 'present', segment, voice: null, ghostArc: null }
}

/**
 * Takes the wedge over from whatever it was playing. blits' `from: 'current'`
 * starts from the subject's last probe, so an interruption probes first.
 */
function start(
  wedges: Wedges,
  track: Track | undefined,
  id: string,
  plan: PresencePlan,
  moment: 'enter' | 'exit',
  now: number,
): Handle<string> | null {
  const from = track && inFlight(track) ? presenceOf(wedges.probe(id)) : null
  if (track) stop(track)
  const spec = presenceVoice(id, plan, moment, now, from)
  return spec ? wedges.cue(spec) : null
}

/**
 * Track order is layout order, so a wedge that has left the roster has to keep
 * the slot it held: appending it instead would swap it with every survivor
 * behind it on the frame it departs, before its exit has animated at all.
 */
function inPlace(
  next: Map<string, Track>,
  previous: Map<string, Track>,
  segments: Segment[],
): Map<string, Track> {
  const live = segments.map((segment) => segment.id).filter((id) => next.has(id))
  const liveIds = new Set(live)
  const held = [...next.keys()].filter((id) => !liveIds.has(id))
  if (held.length === 0) return next

  const heldIds = new Set(held)
  const behind = new Map<string, string[]>()
  const front: string[] = []
  let anchor: string | null = null
  for (const id of previous.keys()) {
    if (liveIds.has(id)) anchor = id
    else if (heldIds.has(id)) {
      if (anchor === null) front.push(id)
      else behind.set(anchor, [...(behind.get(anchor) ?? []), id])
    }
  }

  const ordered = new Map<string, Track>()
  const put = (id: string) => {
    const track = next.get(id)
    if (track) ordered.set(id, track)
  }
  front.forEach(put)
  for (const id of live) {
    put(id)
    behind.get(id)?.forEach(put)
  }
  return ordered
}

/**
 * Diffs the composed roster against the tracks already drawn, cueing a voice
 * for each wedge that starts arriving or leaving. A transition starting on a
 * wedge still in flight carries on from where that wedge stands.
 */
export function advance(input: AdvanceInput): Map<string, Track> {
  const { tracks, segments, arcs, transitions, now, reduced, wedges } = input
  const next = new Map<string, Track>()
  const count = segments.length

  segments.forEach((segment, index) => {
    const existing = tracks.get(segment.id)

    if (existing && existing.phase !== 'exiting') {
      const kept = { ...existing, segment }
      next.set(segment.id, existing.phase === 'entering' && isDone(existing) ? promote(kept) : kept)
      return
    }

    const plan = planTrack(
      transitions,
      'enter',
      index,
      count,
      angleOf(arcs.get(segment.id)),
      reduced,
    )
    const voice = plan && start(wedges, existing, segment.id, plan, 'enter', now)
    if (!voice) {
      if (existing) stop(existing)
      next.set(segment.id, restingTrack(segment))
      return
    }
    next.set(segment.id, {
      id: segment.id,
      phase: 'entering',
      segment,
      voice,
      // A reversal keeps the arc its exit froze: it may still be at share 0, and
      // a wedge holding no arc has nowhere to be drawn without one.
      ghostArc: existing ? existing.ghostArc : null,
    })
  })

  const departing: [string, Track][] = []
  for (const [id, track] of tracks) {
    if (next.has(id)) continue
    if (track.phase === 'exiting') {
      // `arcs` is last frame's layout, so it still names the arc a wedge held
      // right up to the frame its share reaches zero, and drops it after.
      if (isDone(track)) forget(wedges, track)
      else next.set(id, { ...track, ghostArc: arcs.get(id) ?? track.ghostArc })
      continue
    }
    departing.push([id, track])
  }

  departing.forEach(([id, track], index) => {
    const plan = planTrack(
      transitions,
      'exit',
      index,
      departing.length,
      angleOf(arcs.get(id)),
      reduced,
    )
    const voice = plan && start(wedges, track, id, plan, 'exit', now)
    if (!voice) {
      forget(wedges, track)
      return
    }
    next.set(id, { ...track, phase: 'exiting', voice, ghostArc: arcs.get(id) ?? null })
  })

  return inPlace(next, tracks, segments)
}

/**
 * Settles every voice that has played out: an entrance becomes present, an exit
 * leaves. Null when nothing has, so a frame that changes nothing renders nothing.
 */
export function retire(tracks: Map<string, Track>, wedges: Wedges): Map<string, Track> | null {
  let next: Map<string, Track> | null = null
  for (const [id, track] of tracks) {
    if (track.phase === 'present' || !isDone(track)) continue
    next ??= new Map(tracks)
    if (track.phase === 'exiting') {
      forget(wedges, track)
      next.delete(id)
    } else {
      next.set(id, promote(track))
    }
  }
  return next
}

export type Drawn = {
  segment: Segment
  arc: Arc
  presence: Presence
}

/**
 * Each wedge where the mix has it at its last sync. A wedge that has released
 * its arc is drawn where it last stood, so nothing else shifts as it animates out.
 */
export function drawList(
  tracks: Map<string, Track>,
  wedges: Wedges,
): { drawn: Drawn[]; arcs: Map<string, Arc> } {
  const sampled = [...tracks.values()].map((track) => ({
    track,
    presence: track.voice === null ? RESTING : presenceOf(wedges.probe(track.id)),
  }))

  const holding = sampled.filter((item) => item.presence.share > 0)
  const laid = layoutArcs(
    holding.map((item) => ({
      id: item.track.id,
      weight: item.track.segment.weight * item.presence.share,
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
    if (item.presence.share > 0) continue
    // A wedge that released its arc before it was ever laid out has nowhere to
    // be drawn, which is the same as not being on the wheel.
    if (!item.track.ghostArc) continue
    drawn.push({ segment: item.track.segment, arc: item.track.ghostArc, presence: item.presence })
  }

  return { drawn, arcs }
}

/**
 * Everything at its target, now. Built from the roster rather than from the
 * tracks: a spin owns the geometry it is about to plan against, so the drawn set
 * has to become exactly what it planned against, not whatever was mid-flight.
 */
export function settle(
  tracks: Map<string, Track>,
  segments: Segment[],
  wedges: Wedges,
): Map<string, Track> {
  const kept = new Set(segments.map((segment) => segment.id))
  for (const track of tracks.values()) {
    if (kept.has(track.id)) stop(track)
    else forget(wedges, track)
  }
  const next = new Map<string, Track>()
  for (const segment of segments) next.set(segment.id, restingTrack(segment))
  return next
}

/** Takes every voice out and forgets every wedge, for a wheel leaving the page. */
export function release(tracks: Map<string, Track>, wedges: Wedges): void {
  for (const track of tracks.values()) forget(wedges, track)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/transition/tracks.test.ts`
Expected: PASS. If "starts an interrupting transition from where the wedge stands" fails at the 116 ms reading, check the next-frame value by hand: `from: 'current'` carries speed (open question 1), so it may rise slightly; the 1-decimal tolerance allows 0.05.

`usePresence.ts` and `Wheel.tsx` don't compile against the new `advance` yet; Task 6 fixes them. Don't run the wider suite here.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/transition/tracks.ts src/transition/tracks.test.ts
git commit -F - <<'EOF'
cue a blits voice for each wedge that arrives or leaves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Paint a presence onto an element

**Files:**
- Modify: `src/transition/css.ts`
- Test: `src/transition/css.test.ts`

**Interfaces:**
- Produces: `export function paintPresence(element: ElementCSSInlineStyle, style: PresenceStyle): void`

- [ ] **Step 1: Write the failing test**

Append to `src/transition/css.test.ts` (it already imports `styleOf`; add `paintPresence` and `RESTING` to the imports, from `./css` and `./voices`):

```ts
describe('paintPresence', () => {
  const target = { angle: 0, radius: 100, pivot: 60 }

  it('writes the properties the stylesheet binds', () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    paintPresence(element, styleOf({ ...RESTING, opacity: 0.5, aperture: 0.5 }, target))
    expect(element.style.getPropertyValue('--wedge-opacity')).toBe('0.5')
    expect(element.style.getPropertyValue('--wedge-transform')).toBe('none')
    expect(element.style.getPropertyValue('--wedge-clip')).toMatch(/^circle\(/)
  })

  it('takes the clip off once the aperture opens', () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    paintPresence(element, styleOf({ ...RESTING, aperture: 0.5 }, target))
    paintPresence(element, styleOf(RESTING, target))
    expect(element.style.getPropertyValue('--wedge-clip')).toBe('')
  })
})
```

`css.test.ts` and `css.ts` still say `hold` nowhere after Task 1; if a fixture there builds a `Presence` by hand, it already says `share`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/transition/css.test.ts`
Expected: FAIL: `paintPresence` is not exported.

- [ ] **Step 3: Write it**

Append to `src/transition/css.ts`:

```ts
/** Writes a presence's properties onto a wedge, which is all React used to do with them. */
export function paintPresence(element: ElementCSSInlineStyle, style: PresenceStyle): void {
  element.style.setProperty('--wedge-transform', style['--wedge-transform'])
  element.style.setProperty('--wedge-opacity', style['--wedge-opacity'])
  const clip = style['--wedge-clip']
  if (clip === undefined) element.style.removeProperty('--wedge-clip')
  else element.style.setProperty('--wedge-clip', clip)
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/transition/css.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/transition/css.ts src/transition/css.test.ts
git commit -F - <<'EOF'
write a presence's custom properties straight onto a wedge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: `usePresence` on the ticker, and the Wheel reading it

**Files:**
- Modify: `src/transition/usePresence.ts` (rewrite), `src/wheel/Wheel.tsx`
- Test: `src/transition/usePresence.test.tsx` (rewrite)

**Interfaces:**
- Produces:
  ```ts
  export type WedgeRef = (id: string, target: EmitTarget) => (element: SVGGElement | null) => void
  export function usePresence(
    segments: Segment[], transitions: Transitions | undefined, held: boolean,
    motion: Motion, retainedRef?: RetainedIds,
  ): { drawn: Drawn[]; wedgeRef: WedgeRef }
  ```
- Consumes: `advance`, `retire`, `drawList`, `settle`, `release` (Task 4), `paintPresence`, `styleOf` (Task 5), `Motion` with `ticker` and `wedges`, `fakeMotion` (phase 2).

- [ ] **Step 1: Write the failing tests**

Replace `src/transition/usePresence.test.tsx` with:

```tsx
import { act, render } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMotion } from '../clock/testing'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import type { Transitions } from './types'

const segment = (id: string, color?: string): Segment =>
  color === undefined ? { id, label: id, weight: 1 } : { id, label: id, weight: 1, color }

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

/** NaN for a wedge nothing has painted, so an unpainted wedge never reads as transparent. */
const opacityOf = (container: HTMLElement, id: string) => {
  const element = container.querySelector(`[data-segment-id="${id}"]`) as SVGGElement
  const value = element.style.getPropertyValue('--wedge-opacity')
  return value === '' ? Number.NaN : Number(value)
}

const pathOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-segment-id="${id}"] .wheel__segment`)?.getAttribute('d')

const transitions: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
}

/** A motion on a hand-stepped clock, stepped inside act so the renders it causes land. */
function clock() {
  const fake = fakeMotion()
  return { ...fake, frame: (t: number) => act(() => fake.step(t)) }
}

beforeEach(() => {
  matchMedia(false)
})

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('wedge presence', () => {
  it('draws an arriving wedge from its transition start', () => {
    const { motion } = clock()
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    expect(opacityOf(container, 'ana')).toBe(0)
  })

  it('carries a wedge from its start frame to rest', () => {
    const { motion, frame } = clock()
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    // Half of a 400 ms fade, which ease-out has already carried to 0.75.
    frame(200)
    expect(opacityOf(container, 'ana')).toBeCloseTo(0.75, 3)
    frame(400)
    expect(opacityOf(container, 'ana')).toBeCloseTo(1, 3)
  })

  it('keeps drawing a wedge that leaves the roster', () => {
    const { motion } = clock()
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    expect(wedges(container)).toContain('ben')
  })

  it('drops a departing wedge when no exit is armed', () => {
    const { motion } = clock()
    const enterOnly = { enter: transitions.enter }
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={enterOnly} />,
    )
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={enterOnly} />)
    expect(wedges(container)).not.toContain('ben')
  })

  it('draws nothing extra when no transitions are armed', () => {
    const { motion } = clock()
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} />,
    )
    rerender(<Wheel motion={motion} segments={[segment('ana')]} />)
    expect(wedges(container)).toEqual(['ana'])
  })

  it('rests every wedge the moment a spin takes the wheel mid-transition', () => {
    const { motion, frame } = clock()
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    frame(100)
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} held />)
    expect(wedges(container)).toEqual(['ana'])
    expect(opacityOf(container, 'ana')).toBe(1)
    frame(116)
    expect(opacityOf(container, 'ana')).toBe(1)
  })

  it('keeps every wedge painted while something else owns the wheel', () => {
    const { motion } = clock()
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana', '#f4a261'), segment('ben', '#2a9d8f')]}
        transitions={transitions}
      />,
    )
    rerender(
      <Wheel motion={motion} segments={[segment('ana', '#f4a261')]} transitions={transitions} held />,
    )
    expect(
      container.querySelector('[data-segment-id="ana"] .wheel__segment')?.getAttribute('fill'),
    ).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('freezes a departing wedge on the arc it last held', () => {
    const { motion } = clock()
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const { container, rerender } = render(
      <Wheel motion={motion} segments={roster} transitions={transitions} />,
    )
    const before = pathOf(container, 'ben')
    rerender(
      <Wheel motion={motion} segments={[segment('ana'), segment('cy')]} transitions={transitions} />,
    )
    expect(before).toBeTruthy()
    expect(pathOf(container, 'ben')).toBe(before)
  })
})

describe('the presence clock', () => {
  it('stops asking for frames once everything has settled', () => {
    const { motion, frame, waiting } = clock()
    render(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    expect(waiting()).toBe(true)
    frame(400)
    frame(416)
    frame(432)
    expect(waiting()).toBe(false)
  })

  it('starts asking again when a wedge arrives after the wheel settled', () => {
    const { motion, frame, waiting } = clock()
    const { rerender } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    frame(400)
    frame(416)
    frame(432)
    rerender(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    expect(waiting()).toBe(true)
  })

  it('asks for no further frames once unmounted', () => {
    const { motion, frame, waiting } = clock()
    const { unmount } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    frame(100)
    unmount()
    frame(116)
    expect(waiting()).toBe(false)
  })

  it('settles inside the reduced-motion duration, not the authored one', () => {
    matchMedia(true)
    const { motion, frame, waiting } = clock()
    const slow: Transitions = { enter: { id: 'fade', params: { staggerMs: 0, durationMs: 4000 } } }
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={slow} />,
    )
    frame(REDUCED_MOTION_MS)
    expect(opacityOf(container, 'ana')).toBeCloseTo(1, 3)
    frame(REDUCED_MOTION_MS + 16)
    frame(REDUCED_MOTION_MS + 32)
    expect(waiting()).toBe(false)
  })

  it('renders nothing per frame while an entrance only fades', () => {
    const { motion, frame } = clock()
    const long: Transitions = { enter: { id: 'fade', params: { staggerMs: 0, durationMs: 2000 } } }
    let renders = 0
    const { container } = render(
      <Profiler id="wheel" onRender={() => renders++}>
        <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={long} />
      </Profiler>,
    )
    const settled = renders
    for (let i = 1; i <= 60; i++) frame(i * 16)
    expect(renders).toBe(settled)
    expect(opacityOf(container, 'ana')).toBeGreaterThan(0)
  })

  // 0.4.0: hold 'before'.
  it('keeps a staggered wedge invisible until its turn', () => {
    const { motion, frame } = clock()
    const staggered: Transitions = {
      enter: { id: 'fade', params: { staggerMs: 200, durationMs: 400 } },
    }
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={staggered} />,
    )
    frame(100)
    expect(opacityOf(container, 'ben')).toBe(0)
  })

  it('carries on from where an entrance was when an exit cuts in at 40%', () => {
    const { motion, frame } = clock()
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    frame(160)
    const before = opacityOf(container, 'ben')
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    expect(opacityOf(container, 'ben')).toBeCloseTo(before, 3)
    frame(176)
    expect(Math.abs(opacityOf(container, 'ben') - before)).toBeLessThan(0.06)
  })

  // 0.4.0: the exit's held last frame, then the entrance's.
  it('turns an exit around and ends fully at rest', () => {
    const { motion, frame } = clock()
    const roster = [segment('ana'), segment('ben')]
    const { container, rerender } = render(
      <Wheel motion={motion} segments={roster} transitions={transitions} />,
    )
    frame(400)
    frame(416)
    const settledPath = pathOf(container, 'ben')
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    frame(600)
    const before = opacityOf(container, 'ben')
    rerender(<Wheel motion={motion} segments={roster} transitions={transitions} />)
    expect(opacityOf(container, 'ben')).toBeCloseTo(before, 3)
    frame(1200)
    frame(1216)
    expect(opacityOf(container, 'ben')).toBe(1)
    expect(pathOf(container, 'ben')).toBe(settledPath)
  })

  // 0.4.0: the exit reads 'held' at its end.
  it('holds an exit at its last frame, then drops it and its ghost arc', () => {
    const { motion, frame, waiting } = clock()
    const retained: { current: ReadonlySet<string> } = { current: new Set() }
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    frame(400)
    rerender(
      <Wheel
        motion={motion}
        segments={[segment('ana')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    expect(retained.current.has('ben')).toBe(true)
    frame(799)
    expect(opacityOf(container, 'ben')).toBeLessThan(0.01)
    frame(800)
    expect(wedges(container)).toEqual(['ana'])
    expect([...retained.current]).toEqual(['ana'])
    frame(816)
    frame(832)
    expect(waiting()).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/transition/usePresence.test.tsx`
Expected: FAIL: TypeScript errors from `usePresence` calling the old `advance`, or wedges painted with no `--wedge-opacity`.

- [ ] **Step 3: Rewrite `usePresence.ts`**

Replace `src/transition/usePresence.ts` with:

```ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Motion } from '../clock/motion'
import type { RetainedIds } from '../wheel/colors'
import type { Arc } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { type EmitTarget, paintPresence, styleOf } from './css'
import { type Drawn, type Track, advance, drawList, release, retire, settle } from './tracks'
import type { Transitions } from './types'

export type WedgeRef = (id: string, target: EmitTarget) => (element: SVGGElement | null) => void

/** Which wedges are drawn on which arcs. Two frames of one shape differ only in what CSS carries. */
function shapeOf(drawn: Drawn[]): string {
  return drawn
    .map(({ segment, arc }) => `${segment.id}:${arc.start.toFixed(6)}:${arc.end.toFixed(6)}`)
    .join('|')
}

export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
  motion: Motion,
  retainedRef?: RetainedIds,
): { drawn: Drawn[]; wedgeRef: WedgeRef } {
  const { ticker, wedges } = motion
  const tracks = useRef(new Map<string, Track>())
  const arcs = useRef(new Map<string, Arc>())
  const shape = useRef('')
  const released = useRef(false)
  const elements = useRef(new Map<string, SVGGElement>()).current
  const targets = useRef(new Map<string, EmitTarget>()).current
  const refs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current
  const [, render] = useState(0)

  const now = ticker.now()
  wedges.sync(now)

  // Rendering, not an effect: the first painted frame has to already show the
  // transition's start, or every arrival flashes at rest before it begins.
  // Safe under StrictMode's double render only because `advance` is idempotent
  // for an unchanged roster — a second pass keeps tracks rather than recueing.
  tracks.current = held
    ? settle(tracks.current, segments, wedges)
    : advance({
        tracks: tracks.current,
        segments,
        arcs: arcs.current,
        transitions,
        now,
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        wedges,
      })

  const { drawn, arcs: laid } = drawList(tracks.current, wedges)
  arcs.current = laid
  shape.current = shapeOf(drawn)

  // Read by App during its own render, one pass stale on purpose: a late read
  // only delays releasing a swatch, never reuses one early.
  if (retainedRef) retainedRef.current = new Set(tracks.current.keys())

  const wedgeRef = useCallback<WedgeRef>(
    (id, target) => {
      targets.set(id, target)
      let ref = refs.get(id)
      if (!ref) {
        ref = (element) => {
          if (element) elements.set(id, element)
          else elements.delete(id)
        }
        refs.set(id, ref)
      }
      return ref
    },
    [elements, targets, refs],
  )

  const paint = useCallback(
    (list: Drawn[]) => {
      for (const { segment, presence } of list) {
        const element = elements.get(segment.id)
        const target = targets.get(segment.id)
        if (element && target) paintPresence(element, styleOf(presence, target))
      }
    },
    [elements, targets],
  )

  useLayoutEffect(() => {
    paint(drawn)
  })

  useEffect(() => {
    if (!wedges.inert) ticker.wake()
  })

  useEffect(() => {
    // StrictMode's remount comes after a release, with every voice gone: replay.
    if (released.current) {
      released.current = false
      render((n) => n + 1)
    }
    const off = ticker.subscribe(() => {
      const next = retire(tracks.current, wedges)
      if (next) {
        tracks.current = next
        render((n) => n + 1)
        return
      }
      const frame = drawList(tracks.current, wedges)
      if (shapeOf(frame.drawn) !== shape.current) render((n) => n + 1)
      else paint(frame.drawn)
    })
    return () => {
      off()
      release(tracks.current, wedges)
      tracks.current = new Map()
      arcs.current = new Map()
      released.current = true
    }
  }, [ticker, wedges, paint])

  return { drawn, wedgeRef }
}
```

- [ ] **Step 4: Wire the Wheel**

In `src/wheel/Wheel.tsx`:

Remove `import { styleOf } from '../transition/css'`.

Change the `retainedRef` doc in `WheelProps` from "Written during render and rewritten on every animation frame" to "Written during render".

Replace the `usePresence` call:

```tsx
  const { drawn, wedgeRef } = usePresence(segments, transitions, held, motion, retainedRef)
```

In the wedge map, drop `presence` from the destructuring (`({ segment, arc: presenceArc }, index)`) and replace the wedge group's opening tag:

```tsx
                <g
                  key={segment.id}
                  ref={wedgeRef(segment.id, {
                    angle: midDeg(layoutArc),
                    radius,
                    pivot: radius * 0.6,
                  })}
                  className="wheel__wedge"
                  data-segment-id={segment.id}
                  style={inkOf(segment.color)}
                >
```

If phase 4 already moved `inkOf` to a ticker writer, keep its version of `style` and only add the `ref`.

- [ ] **Step 5: Run the presence and wheel tests**

Run: `npx vitest run src/transition src/wheel/Wheel.test.tsx`
Expected: `src/transition` PASS. `Wheel.test.tsx` fails only in the five tests that call `installClock()`; Task 7 converts them.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/transition/usePresence.ts src/transition/usePresence.test.tsx src/wheel/Wheel.tsx
git commit -F - <<'EOF'
play wedge transitions on the shared clock and paint them without rendering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Wheel tests on the hand-stepped clock

The five `Wheel.test.tsx` tests that call `installClock()` ("fits a label against the layout arc…", "keeps a departing wedge on the layout arc…", "carries a departing wedge label…", "clips a wedge label…", "registers a level element…") drove presence through stubbed `requestAnimationFrame` and `performance.now`. Presence now runs on the motion's ticker.

**Files:**
- Modify: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Put `installClock` on a fake motion**

Replace `installClock` in `src/wheel/Wheel.test.tsx` with:

```ts
/**
 * A hand-stepped motion, so a test can watch a transition mid-flight rather
 * than only on the frame it starts. `advance` moves it forward by `ms`.
 */
function installClock() {
  const fake = fakeMotion()
  let now = 0
  return {
    motion: fake.motion,
    advance(ms: number) {
      now += ms
      act(() => fake.step(now))
    },
    restore() {},
  }
}
```

and add `import { fakeMotion } from '../clock/testing'`. Drop `vi` from the vitest import if nothing else in the file uses it (`grep -n "vi\." src/wheel/Wheel.test.tsx`).

- [ ] **Step 2: Give those five wheels the clock's motion**

In each of the five tests, every `<Wheel` inside it (in `render` and `rerender`) takes `motion={clock.motion}`, replacing whatever `motion` phase 2 gave it. Nothing else in their bodies changes: `clock.advance(1000)` then `clock.advance(200)` lands the same instants as before.

- [ ] **Step 3: Run the wheel tests**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm run check
git add src/wheel/Wheel.test.tsx
git commit -F - <<'EOF'
step the wheel's transition tests on the motion clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Remove the sampler, record what was built

**Files:**
- Delete: `src/transition/sample.ts`, `src/transition/sample.test.ts`
- Delete if unused: `src/keyframes/bracket.ts` and its test
- Modify: `docs/superpowers/specs/2026-10-03-blits-migration-design.md`

- [ ] **Step 1: Delete the sampler**

```bash
cd /Users/mike/src/wod
grep -rn "transition/sample\|from './sample'" src
```

Expected: nothing (Tasks 3–6 moved `RESTING` to `voices.ts`; `declaresShare` went with `tracks.ts`'s rewrite). Fix any hit to import `RESTING` from `./voices` or `../transition/voices`, then:

```bash
git rm src/transition/sample.ts src/transition/sample.test.ts
grep -rn "keyframes/bracket" src
```

If the second grep prints nothing (phase 4 already took `morph.ts` off it), `git rm src/keyframes/bracket.ts` and its test (`ls src/keyframes`). If it prints `src/wheel/morph.ts`, leave `bracket.ts` for phase 4 and say so in the commit body.

- [ ] **Step 2: Type-check and run the touched tests**

Run: `npx tsc --noEmit && npx vitest run src/transition src/wheel src/clock`
Expected: no type errors; PASS.

- [ ] **Step 3: Record it in the spec**

In `docs/superpowers/specs/2026-10-03-blits-migration-design.md`:

Opening lines: phase 5 moves from "unbuilt" to "built".

In the kit table, the wedges row's channels become:
`weight: sum()` (a delta), `color: hex()`, `label`, `media`, `reveal: last()`, `share`, `opacity`, `scale`, `aperture: mul()`, `offset`, `rotate: sum()`, `offsetAngle: last()` with a numeric lerp

Replace the "Wedge transitions" section body with:

```markdown
`advance` still diffs the roster (arrivals, departures, returns, `ghostArc`)
but no longer samples. Each transition is one `keys` voice on the wedge mix,
writing the presence channels it touches, in `locus: 'presence:<id>'`.
Transitions stay authored as `PresentationKeyframe`s; `stopsOf` turns them into
stops, giving every channel a stop at 0 because blits holds a channel's first
stop before it. The mix carries numbers; `styleOf` builds the CSS strings, and
`paintPresence` writes them onto the wedge from the ticker. React renders when
a wedge arrives, leaves or finishes, or an arc moves.

An interruption probes the wedge, fades the old voice over 0 and cues the new
one with `from: 'current'`, which starts from the last probe (measured) and
carries its speed: a fade-out cut into a fade-in at 40% rises from 0.40 to
0.49 before it falls. A fresh entrance does not use `from: 'current'`, which
would start it at rest. Channels the new transition is silent on go to rest
(entrance) or hold (exit).

Entrances hold `'both'`, so a staggered wedge shows its first frame through its
delay; exits hold `'after'`. A voice holding after never resolves `done` until
faded, so wod retires a transition on the frame its voice reads `held`: an
entrance's voice is faded (its last frame is rest), an exit's is faded, the
wedge dropped and its ghost arc removed. While `held`, every presence voice is
faded over 0. A transition of 0 ms cues no voice.
```

- [ ] **Step 4: Commit**

```bash
npm run check
git add -A src/transition src/keyframes docs/superpowers/specs/2026-10-03-blits-migration-design.md
git commit -F - <<'EOF'
remove the presence sampler and record the transitions as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Delete this plan**

This plan is scaffolding. Once Task 8 lands, `git rm docs/superpowers/plans/2026-10-03-blits-transitions.md` and commit (`drop the finished transitions plan`), and update `docs/HANDOFF.md` to say phase 5 is built.

---

## Spec coverage

| Spec case (Tests → Wedge transitions) | Task |
|---|---|
| Enter matches today (fade, fly, shrink at 0, ½, 1) | 3 ("plays … as today", enter and exit) |
| Staggered enter | 4 ("holds a waiting wedge…"), 6 ("keeps a staggered wedge invisible…") |
| Exit interrupts enter at 40% | 6 ("carries on from where an entrance was…"), 4 (probe ordering) |
| Enter interrupts exit | 4 ("turns a half-closed wedge around…"), 6 ("turns an exit around and ends fully at rest") |
| Exit holds, then drops | 6 ("holds an exit at its last frame…"), 4 (`retire`) |
| `shrink` reflows | 4 ("gives a shrinking wedge less arc and its neighbor more") |
| Spin starts mid-transition | 6 ("rests every wedge the moment a spin takes the wheel…"), 4 (`settle`) |
| No per-frame render | 6 ("renders nothing per frame while an entrance only fades") |
| Reduced motion | 4, 6 |
| `hold` → `share` rename | 1 |
| `drawList` reads `share` from the probe | 4 |
| `styleOf` strings written by a subscriber | 5, 6 |
| `fade({ over: 0 })` while `held` | 4 (`settle`) |
| Removed: `tick` loop, `sampleTrack`/`samplePresence`, `base`, `withoutZeroFrame` | 4, 6, 8 |
