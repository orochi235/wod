# blits tricks: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Unbuilt.** Phase 4 of the blits migration. Blocked on phase 2 (wheel angle and flapper, its own plan) and on blits 0.4.0 (`hold`, `Mix.inert`).

**Goal:** Run trick morphs as blits voices on a wedge mix, so two tricks on one wedge blend (weights add, colors crossfade) instead of the later one winning, and retire `applyMorphs` and the morph `requestAnimationFrame` loop.

**Architecture:** `morphVoices` turns each `Morph` into up to three `keys` voices (weight delta, color, discrete), each holding its end value after it finishes. `useSpin` cues them on a new `wedges` mix and composes `displaySegments` from a ticker subscriber. `landingSegments` and the editor scrub run the same voices on a scratch mix, so the landing, the winner draw and the live spin share one path.

**Tech Stack:** TypeScript, React 19, Vitest + jsdom, Biome, `@msb235/blits` 0.4.0 (pinned exactly by phase 2).

**Spec:** `docs/superpowers/specs/2026-10-03-blits-migration-design.md`, sections "Tricks" and "Tests → Tricks".

## Open questions for Mike

Each was settled toward the current behavior; the plan builds that reading. Each is one line to change if the answer differs.

- **Per-frame renders stay for weight morphs in this phase.** The spec drops the morph's per-frame `setDisplaySegments`, but a weight change moves every arc, divider, panel, peg and clip, and phase 5's `share` moves the same arcs. This plan renders only when the composed frame actually changes, and leaves the arc geometry writer to phase 5 so it is written once for both. Should phase 4 write arcs to the DOM itself?
- **Wedge kit has no presence channels yet.** `transform`, `opacity`, `clip`, `share` are left to phase 5. Presence today is numbers (`scale`, `offset`, `rotate`, `aperture`, `hold`), and a CSS string channel cannot interpolate. Phase 5 should decide numbers or strings, not this plan.
- **No React context for motion.** Nothing under `<Wheel>` reads the wedge mix in this phase; `useSpin` owns the subscriber.
- **Conflict badge wording for discrete properties** names who wins: "overrides another trick on …" on the later trick, "overridden by a later trick on …" on the earlier one. The spec says only "overrides".
- **Morph voices hold `'after'`, not `'both'`.** During an outage prologue a voice is pending and the wedge shows its base. Old code showed the morph's first stop, which differs only for a recolor of a wedge with no color.

## Spec claims found false in the code

- **`src/keyframes/bracket.ts` cannot go in phase 4.** `src/transition/sample.ts` (presence) still calls it; it leaves with `samplePresence` in phase 5.
- **The swap is not "known only after `resolveLate`" in any way that needs a seek.** `useSpin` calls `resolveLate` synchronously before the rotation starts, so late morphs are cued at `startedAt` like the rest. No `seek` and no late-swap test.
- **`parseHex` is not removable**: recolor and takeover validate colors with it. It moves to `src/wheel/hex.ts`.
- **Morph easing is not per segment.** `morphProgress` eases the morph's whole timeline and the stops sit on eased progress; blits eases each segment between stops. "The quadratics pass through exactly" holds only after remapping stop times through each easing's inverse (Task 2). Measured: a blits stop accepts an easing function.

## Measured on blits 0.3.0 (scratch script against `node_modules/@msb235/blits`)

| Behavior relied on | Result |
|---|---|
| Two `last()` voices on one subject | the later-cued voice wins: relabel A at 0.3 then B at 0.8 reads `base` at 0.5 and `B` at 0.8 |
| `last({ lerp: atStop })` steps at the stop | label flips at exactly 800 ms of a 0.8 stop |
| `reveal: null` in a stop | survives the fold: probe returns `reveal: null` from 500 ms |
| Blue and green at weight 1 in one locus | `#00bbe3` |
| A function `ease` on a stop | applies to the segment ending at that stop: `u²` at 500 ms of 0→1 reads 0.25 |
| Two stops at one offset | snaps: `#ff0000` at 499 ms, `#00ff00` at 500 ms |
| Weight deltas from two voices | add: −2 and +3 read 0.5 at the midpoint |
| A subject no voice touches | probe returns `{ weight: 0 }` |
| sRGB vs OKLCH midpoint drift, worst over 19 points | `#e63946→#1d3557` 0.097, `#2a9d8f→#ffd166` 0.033 in OKLab distance |

**Only provable on 0.4.0:** every read at or after a voice's end (`hold: 'after'`). On 0.3.0 a one-pass voice reads base at its end, so `landingSegments` at `durationMs` would return the unmorphed roster.

## Global Constraints

- Phase 2 has landed: `useSpin(segments, config, motion)`, `startedAt` from `motion.ticker.now()`, `Syncable.inert`, `fakeMotion()` in `src/clock/testing.ts` returning `{ motion, step(to), waiting() }`. This plan's test code names the phase 2 harness `fake` (a `fakeMotion()` made in `beforeEach`, passed by `renderSpin`). If phase 2 named it differently, use its names.
- `@msb235/blits` stays pinned at exactly `"0.4.0"`.
- US English. Biome style: single quotes, no semicolons, 2-space indent, 100 columns. Run `npm run check` before each commit.
- Comments only where a reader cannot get it from the code and would be hurt without it; 1–2 lines.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Eased multi-stop morphs.** Vanish, takeover and recolor hold until `startAt`, then ease over the rest. A segment-eased stop list would start the change at the wrong time and curve. Pinned by the golden comparison in Task 6.
- **A trick voice outliving its spin.** Held voices never leave on their own. Landing, cancel and unmount must fade them, or a later wake of the ticker recomposes the old landing over a live roster. Pinned in Task 7.
- **Reduced motion.** The rotation runs 300 ms, the morphs keep their authored timeline scaled by `rate`. Pinned in Task 7.

## Files

| File | Responsibility |
|---|---|
| `src/keyframes/easing.ts` | adds `EASING_INVERSES` beside `EASINGS` |
| `src/wheel/hex.ts` (new) | `parseHex` (moved), `hexNumber`, `hexString` |
| `src/clock/motion.ts` | adds `WedgePose`, `wedgeKit`, the `wedges` mix |
| `src/clock/morphVoices.ts` (new) | `morphVoices(morph, base, startAt, rate)`, `cueMorphs(...)` |
| `src/clock/compose.ts` (new) | `composeSegment`, `composeSegments`, `sameFrame`, `segmentsAt` |
| `src/clock/__fixtures__/morph-golden.json` (new) | old `applyMorphs` output per recipe, captured once |
| `src/wheel/morph.ts` | shrinks to `landingSegments`, delegating to `segmentsAt` |
| `src/wheel/useSpin.ts` | cues morph voices, composes frames from the ticker |
| `src/wheel/outage.ts` | loses `spinTime` |
| `src/editor/Transport.tsx` | scrubs through `segmentsAt` |
| `src/tricks/conflicts.ts`, `src/editor/TrickLibrary.tsx` | badge says blends or overrides |

---

### Task 1: Capture the old morph output as a golden fixture

The single-trick comparison needs `applyMorphs` as it is today, and Task 8 deletes it. Capture first.

**Files:**
- Create (temporary, not committed): `src/clock/captureGolden.test.ts`
- Create: `src/clock/__fixtures__/morph-golden.json`

- [ ] **Step 1: Write the capture script**

```ts
// src/clock/captureGolden.test.ts — run once, then delete
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { recolor } from '../tricks/recipes/recolor'
import { relabel } from '../tricks/recipes/relabel'
import { swap } from '../tricks/recipes/swap'
import { takeover } from '../tricks/recipes/takeover'
import { vanish } from '../tricks/recipes/vanish'
import type { Recipe, TrickParams } from '../tricks/types'
import { applyMorphs } from '../wheel/morph'
import type { Segment } from '../wheel/types'

const ROSTER: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1, color: '#e63946', reveal: { headline: 'Ana!' } },
  { id: 'ben', label: 'Ben', weight: 2, color: '#457b9d' },
  { id: 'cal', label: 'Cal', weight: 1, color: '#2a9d8f', reveal: { headline: 'Cal!' } },
]
const DURATION_MS = 1000

const CASES: [string, Recipe, TrickParams, string | null][] = [
  [
    'takeover-share',
    takeover,
    { ...takeover.defaults, wedgeMode: 'existing', wedgeSegmentId: 'cal', endShare: 0.5, endColor: '#ffd166' },
    null,
  ],
  ['takeover-all', takeover, { ...takeover.defaults, wedgeMode: 'existing', wedgeSegmentId: 'cal' }, null],
  ['vanish', vanish, { ...vanish.defaults, targets: ['ben'] }, null],
  ['recolor', recolor, { ...recolor.defaults, targets: ['ana'], toColor: '#1d3557' }, null],
  ['relabel', relabel, { ...relabel.defaults, targets: ['ben'], toLabel: 'LOSER' }, null],
  ['swap', swap, { ...swap.defaults, otherWedgeId: 'cal' }, 'ana'],
]

it('captures', () => {
  const out: Record<string, unknown> = {}
  for (const [name, recipe, params, winnerId] of CASES) {
    const morphs = recipe.resolve(params, {
      trickId: 't1',
      segments: ROSTER,
      origins: new Map(),
      durationMs: DURATION_MS,
      roll: 0,
      winnerId,
    })
    out[name] = {
      segments: ROSTER,
      morphs,
      durationMs: DURATION_MS,
      frames: [0, 0.25, 0.5, 0.75, 1].map((at) => ({
        at,
        segments: applyMorphs(ROSTER, morphs, at * DURATION_MS),
      })),
    }
  }
  writeFileSync('src/clock/__fixtures__/morph-golden.json', `${JSON.stringify(out, null, 2)}\n`)
})
```

- [ ] **Step 2: Run it**

Run: `mkdir -p src/clock/__fixtures__ && npx vitest run src/clock/captureGolden.test.ts`
Expected: PASS, and `src/clock/__fixtures__/morph-golden.json` exists with six cases of five frames each.

- [ ] **Step 3: Delete the script and commit the fixture**

```bash
rm src/clock/captureGolden.test.ts
git add src/clock/__fixtures__/morph-golden.json
git commit -m "capture applyMorphs output for 6 recipe cases before it is replaced

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Easing inverses

**Files:**
- Modify: `src/keyframes/easing.ts`
- Test: `src/keyframes/easing.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// src/keyframes/easing.test.ts
import { describe, expect, it } from 'vitest'
import type { EasingName } from '../wheel/types'
import { EASINGS, EASING_INVERSES } from './easing'

describe('EASING_INVERSES', () => {
  for (const name of Object.keys(EASINGS) as EasingName[]) {
    it(`undoes ${name}`, () => {
      for (const t of [0, 0.1, 0.25, 0.5, 0.6, 0.75, 0.9, 1]) {
        expect(EASING_INVERSES[name](EASINGS[name](t))).toBeCloseTo(t, 9)
      }
    })
  }
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/keyframes/easing.test.ts`
Expected: FAIL, `EASING_INVERSES` is not exported.

- [ ] **Step 3: Implement**

Append to `src/keyframes/easing.ts`:

```ts
/** When each easing reaches a given progress: a morph's stops sit on progress, blits' on time. */
export const EASING_INVERSES: Record<EasingName, (y: number) => number> = {
  linear: (y) => y,
  easeIn: (y) => Math.sqrt(y),
  easeOut: (y) => 1 - Math.sqrt(1 - y),
  easeInOut: (y) => (y < 0.5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2)),
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/keyframes/easing.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/keyframes/easing.ts src/keyframes/easing.test.ts
git commit -m "add the inverse of each of the 4 morph easings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Hex helpers

**Files:**
- Create: `src/wheel/hex.ts`, `src/wheel/hex.test.ts`
- Modify: `src/wheel/morph.ts` (drop `parseHex`), `src/wheel/morph.test.ts` (drop its `parseHex` block), `src/tricks/recipes/recolor.ts`, `src/tricks/recipes/takeover.ts` (imports)

- [ ] **Step 1: Write the failing test**

```ts
// src/wheel/hex.test.ts
import { describe, expect, it } from 'vitest'
import { hexNumber, hexString, parseHex } from './hex'

describe('parseHex', () => {
  it('expands shorthand hex', () => {
    expect(parseHex('#f00')).toEqual([255, 0, 0])
  })

  it('reads six-digit hex', () => {
    expect(parseHex('#00ff80')).toEqual([0, 255, 128])
  })

  it('refuses a named color', () => {
    expect(parseHex('rebeccapurple')).toBeNull()
  })
})

describe('hexNumber and hexString', () => {
  it('round-trip a color through the number blits blends', () => {
    expect(hexNumber('#FFD166')).toBe(0xffd166)
    expect(hexString(0xffd166)).toBe('#ffd166')
    expect(hexString(0x0000ff)).toBe('#0000ff')
  })

  it('has no number for a color it cannot read', () => {
    expect(hexNumber('red')).toBeUndefined()
    expect(hexNumber(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/wheel/hex.test.ts`
Expected: FAIL, cannot resolve `./hex`.

- [ ] **Step 3: Implement**

```ts
// src/wheel/hex.ts
export function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

/** `0xrrggbb`, the form blits' `hex` channel blends. */
export function hexNumber(color: string | undefined): number | undefined {
  const rgb = color === undefined ? null : parseHex(color)
  return rgb ? (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] : undefined
}

export const hexString = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`
```

Delete `parseHex` from `src/wheel/morph.ts` and the `describe('parseHex', …)` block (and `parseHex` from the import) in `src/wheel/morph.test.ts`. `lerpColor` keeps working on its own copy of the parse until Task 8 deletes it, so in `src/wheel/morph.ts` add `import { parseHex } from './hex'` at the top.

In `src/tricks/recipes/recolor.ts` and `src/tricks/recipes/takeover.ts`, replace `import { parseHex } from '../../wheel/morph'` with `import { parseHex } from '../../wheel/hex'`. In both files, reword the validate comment that names `lerpColor`: `// The color channel reads hex only; a named color would hold its start color all spin.`

- [ ] **Step 4: Run the touched tests**

Run: `npx vitest run src/wheel/hex.test.ts src/wheel/morph.test.ts src/tricks/recipes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/wheel/hex.ts src/wheel/hex.test.ts src/wheel/morph.ts src/wheel/morph.test.ts src/tricks/recipes/recolor.ts src/tricks/recipes/takeover.ts
git commit -m "move parseHex to its own module, with the number form blits blends

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The wedge mix

**Files:**
- Modify: `src/clock/motion.ts`
- Test: `src/clock/motion.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/clock/motion.test.ts` (add `wedgeKit` to the `./motion` import, and `mix` to the blits import):

```ts
describe('the wedge mix', () => {
  it('adds weight deltas from two voices', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    for (const delta of [-2, 3]) {
      wedges.cue({
        patch: keys<string, WedgePose>(1000, [
          { at: 0, delta: { weight: 0 } },
          { at: 1, delta: { weight: delta } },
        ]),
        subjects: ['x'],
        start: 0,
        loop: false,
        hold: 'after',
      })
    }
    wedges.sync(500)
    expect(wedges.probe('x').weight).toBeCloseTo(0.5, 9)
    wedges.sync(6000)
    expect(wedges.probe('x').weight).toBeCloseTo(1, 9)
  })

  it('steps a label at its stop, the later voice winning', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    for (const [at, label] of [[0.3, 'A'], [0.8, 'B']] as const) {
      wedges.cue({
        patch: keys<string, WedgePose>(1000, [
          { at: 0, delta: { label: 'base' } },
          { at, delta: { label } },
        ]),
        subjects: ['x'],
        start: 0,
        loop: false,
        hold: 'after',
      })
    }
    const read = (t: number) => {
      wedges.sync(t)
      return wedges.probe('x').label
    }
    expect([read(500), read(799), read(800)]).toEqual(['base', 'base', 'B'])
  })

  it('is synced by the ticker with the wheel', () => {
    const { motion, step } = fakeMotion()
    motion.wedges.cue({
      patch: keys<string, WedgePose>(100, [{ at: 0, delta: { weight: 2 } }]),
      subjects: ['x'],
      start: 0,
      loop: false,
    })
    motion.ticker.wake()
    step(50)
    expect(motion.wedges.probe('x').weight).toBe(2)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/clock/motion.test.ts`
Expected: FAIL, `wedgeKit` is not exported and `motion.wedges` is undefined.

- [ ] **Step 3: Implement**

In `src/clock/motion.ts`, add `hex` and `sum` to the blits import (keep phase 2's additions), import `Media` and `Reveal` as types from `'../wheel/types'`, and add after `wheelKit`:

```ts
/** A wedge's change from its roster entry. `weight` is a delta; `color` is `0xrrggbb`. */
export type WedgePose = {
  weight?: number
  color?: number
  label?: string
  media?: Media
  /** `null` clears the wedge's reveal, as a swap does to a wedge that had none. */
  reveal?: Reveal | null
}

export const wedgeKit: Kit<WedgePose> = kit<WedgePose>({
  // No bounds: a bound on the delta would clamp a vanish. The floor at 0 is wod's, in compose.
  weight: sum(),
  color: hex(),
  label: last<string>({ lerp: atStop }),
  media: last<Media>({ lerp: atStop }),
  reveal: last<Reveal>({ lerp: atStop }),
})
```

Change `Motion` and `createMotion` (phase 2's other fields stay as they are):

```ts
export type Motion = {
  ticker: Ticker
  wheel: Mix<string, WheelPose>
  wedges: Mix<string, WedgePose>
}

export function createMotion(timing?: TickerTiming): Motion {
  const wheel = mix<string, WheelPose>(wheelKit)
  const wedges = mix<string, WedgePose>(wedgeKit)
  return { ticker: createTicker([wheel, wedges], timing), wheel, wedges }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/clock`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/clock/motion.ts src/clock/motion.test.ts
git commit -m "add a wedge mix whose weights add and whose labels step at their stop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Morph voices and the composed frame

**Files:**
- Create: `src/clock/morphVoices.ts`, `src/clock/compose.ts`
- Test: `src/clock/morphVoices.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/clock/morphVoices.test.ts
import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { EASINGS } from '../keyframes/easing'
import type { Morph, Segment } from '../wheel/types'
import { composeSegments, segmentsAt } from './compose'
import { cueMorphs, morphVoices } from './morphVoices'
import { type WedgePose, wedgeKit } from './motion'

const D = 1000
const red: Segment = { id: 'x', label: 'X', weight: 3, color: '#ff0000', reveal: { headline: 'yes' } }
const of = (segments: Segment[], id: string) => segments.find((s) => s.id === id) as Segment
const morph = (keyframes: Morph['keyframes'], extra: Partial<Morph> = {}): Morph => ({
  segmentId: 'x',
  durationMs: D,
  keyframes,
  ...extra,
})
const at = (segments: Segment[], morphs: Morph[], ms: number) => of(segmentsAt(segments, morphs, ms), 'x')

describe('morphVoices', () => {
  it('turns weights into deltas from the base', () => {
    const [voice] = morphVoices(morph([{ at: 0, weight: 3 }, { at: 1, weight: 0 }]), red, 0)
    expect(voice.patch.keys?.map((stop) => stop.delta.weight)).toEqual([0, -3])
  })

  it('emits a voice only for channels the morph touches', () => {
    expect(morphVoices(morph([{ at: 0, weight: 3 }, { at: 1, weight: 1 }]), red, 0)).toHaveLength(1)
  })

  it('starts a lone late color stop from the base color', () => {
    const blue = [morph([{ at: 1, color: '#0000ff' }])]
    expect(at([red], blue, 0).color).toBe('#ff0000')
    expect(at([red], blue, D).color).toBe('#0000ff')
  })

  it('passes the morph easing through', () => {
    const eased = [morph([{ at: 0, weight: 3 }, { at: 1, weight: 4 }], { easing: 'easeIn' })]
    expect(at([red], eased, D / 2).weight).toBeCloseTo(3 + EASINGS.easeIn(0.5), 9)
  })

  it('eases the whole morph, not each segment between its stops', () => {
    const vanish = [
      morph(
        [
          { at: 0, weight: 3 },
          { at: 0.5, weight: 3 },
          { at: 1, weight: 0 },
        ],
        { easing: 'easeIn' },
      ),
    ]
    // easeIn reaches progress 0.5 at time √0.5: the hold lasts until then, not until half time.
    expect(at([red], vanish, 700).weight).toBe(3)
    expect(at([red], vanish, 720).weight).toBeLessThan(3)
    expect(at([red], vanish, 850).weight).toBeCloseTo(3 - 3 * ((EASINGS.easeIn(0.85) - 0.5) / 0.5), 9)
  })

  it('clears a reveal at its stop', () => {
    const cleared = [morph([{ at: 0.5, reveal: null }])]
    expect(at([red], cleared, 490).reveal).toEqual({ headline: 'yes' })
    expect(at([red], cleared, 500).reveal).toBeUndefined()
  })

  it('holds the end value long after the morph ends', () => {
    const grow = [morph([{ at: 0, weight: 3 }, { at: 1, weight: 5 }])]
    expect(at([red], grow, D + 5000).weight).toBe(5)
  })

  it('does not wrap back to the start past its end', () => {
    const grow = [morph([{ at: 0, weight: 3 }, { at: 1, weight: 5 }])]
    expect(at([red], grow, D).weight).toBe(5)
    expect(at([red], grow, D + 1).weight).toBe(5)
  })

  it('composes an untouched wedge to its base, the same object', () => {
    const other: Segment = { id: 'o', label: 'O', weight: 1 }
    const grow = [morph([{ at: 0, weight: 3 }, { at: 1, weight: 5 }])]
    expect(of(segmentsAt([red, other], grow, D / 2), 'o')).toBe(other)
  })

  it('waits out an outage prologue', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    const grow = [morph([{ at: 0, weight: 3 }, { at: 1, weight: 5 }])]
    cueMorphs(wedges, [red], grow, 12000)
    wedges.sync(11999)
    expect(wedges.probe('x').weight).toBe(0)
    wedges.sync(12000 + D / 2)
    expect(of(composeSegments([red], wedges), 'x').weight).toBe(at([red], grow, D / 2).weight)
  })

  it('plays faster under a rate, for a shortened spin', () => {
    const wedges = mix<string, WedgePose>(wedgeKit)
    const grow = [morph([{ at: 0, weight: 3 }, { at: 1, weight: 5 }])]
    cueMorphs(wedges, [red], grow, 0, 10)
    wedges.sync(50)
    expect(of(composeSegments([red], wedges), 'x').weight).toBe(4)
  })
})

describe('two tricks on one wedge', () => {
  const two: Segment = { id: 'x', label: 'X', weight: 2, color: '#ff0000' }

  it('add their weight changes', () => {
    const vanish = morph([{ at: 0, weight: 2 }, { at: 1, weight: 0 }])
    const takeover = morph([{ at: 0, weight: 2 }, { at: 1, weight: 5 }])
    expect(at([two], [vanish, takeover], D).weight).toBe(3)
  })

  it('never take a weight below zero', () => {
    const vanish = morph([{ at: 0, weight: 2 }, { at: 1, weight: 0 }])
    expect(at([two], [vanish, vanish], D).weight).toBe(0)
  })

  it('crossfade their colors', () => {
    const blue = morph([{ at: 0, color: '#0000ff' }])
    const green = morph([{ at: 0, color: '#00ff00' }])
    expect(at([two], [blue, green], D).color).toBe('#00bbe3')
  })

  it('let the later relabel win', () => {
    const a = morph([{ at: 0, label: 'A' }])
    const b = morph([{ at: 0, label: 'B' }])
    expect(at([two], [a, b], D).label).toBe('B')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/clock/morphVoices.test.ts`
Expected: FAIL, cannot resolve `./compose` and `./morphVoices`.

- [ ] **Step 3: Implement `morphVoices.ts`**

```ts
// src/clock/morphVoices.ts
import { type Handle, type Keyframe, type Mix, type VoiceSpec, keys } from '@msb235/blits'
import { EASINGS, EASING_INVERSES } from '../keyframes/easing'
import { hexNumber } from '../wheel/hex'
import type { Morph, MorphKeyframe, Segment } from '../wheel/types'
import type { WedgePose } from './motion'

type Stop = Keyframe<WedgePose>
type Spec = VoiceSpec<string, WedgePose>

/**
 * A morph's stops, for one channel, on blits' time axis. A morph eases its whole timeline and its
 * stops sit on eased progress; blits eases each segment, so each stop moves to the time the morph
 * reaches it, and each segment takes the slice of the morph's curve that falls inside it.
 */
function stopsFor(
  morph: Morph,
  pick: (frame: MorphKeyframe) => Partial<WedgePose> | undefined,
  implicit: Partial<WedgePose> | undefined,
): Stop[] {
  const name = morph.easing ?? 'linear'
  const ease = EASINGS[name]
  const time = (p: number) => EASING_INVERSES[name](Math.min(1, Math.max(0, p)))

  const points = [...morph.keyframes]
    .sort((a, b) => a.at - b.at)
    .flatMap((frame) => {
      const delta = pick(frame)
      return delta ? [{ p: frame.at, delta }] : []
    })
  if (points.length === 0) return []
  // A missing 0% stop starts from the wedge's base, as Web Animations does.
  if (points[0].p > 0 && implicit) points.unshift({ p: 0, delta: implicit })

  return points.map(({ p, delta }, i) => {
    const prev = points[i - 1]?.p
    if (prev === undefined || name === 'linear' || p === prev) return { at: time(p), delta }
    const t0 = time(prev)
    const t1 = time(p)
    return {
      at: t1,
      delta,
      ease: (u: number) => (ease(t0 + u * (t1 - t0)) - prev) / (p - prev),
    }
  })
}

/** One morph as up to three voices, each only for the channels it touches. */
export function morphVoices(morph: Morph, base: Segment, startAt: number, rate = 1): Spec[] {
  const period = Math.max(1, morph.durationMs)
  const voice = (stops: Stop[], locus?: string): Spec => ({
    patch: keys<string, WedgePose>(period, stops),
    subjects: [morph.segmentId],
    // A zero-length morph is over the moment it starts.
    start: morph.durationMs > 0 ? startAt : startAt - period,
    rate,
    loop: false,
    hold: 'after',
    ...(locus ? { locus } : {}),
  })

  const weight = stopsFor(
    morph,
    (k) => (k.weight === undefined ? undefined : { weight: k.weight - base.weight }),
    { weight: 0 },
  )
  const baseColor = hexNumber(base.color)
  const color = stopsFor(
    morph,
    (k) => {
      const rgb = hexNumber(k.color)
      return rgb === undefined ? undefined : { color: rgb }
    },
    baseColor === undefined ? undefined : { color: baseColor },
  )
  // Steps, so easing is moot: only where each stop falls matters.
  const discrete = [
    ...stopsFor(morph, (k) => (k.label === undefined ? undefined : { label: k.label }), {
      label: base.label,
    }),
    ...stopsFor(
      morph,
      (k) => (k.media === undefined ? undefined : { media: k.media }),
      base.media ? { media: base.media } : undefined,
    ),
    ...stopsFor(morph, (k) => (k.reveal === undefined ? undefined : { reveal: k.reveal }), {
      reveal: base.reveal ?? null,
    }),
  ].map(({ at, delta }) => ({ at, delta }))

  const voices: Spec[] = []
  if (weight.length > 0) voices.push(voice(weight))
  if (color.length > 0) voices.push(voice(color, `color:${morph.segmentId}`))
  if (discrete.length > 0) voices.push(voice(discrete))
  return voices
}

/** Cues every morph whose wedge is in `segments`; a morph naming any other wedge is ignored. */
export function cueMorphs(
  wedges: Mix<string, WedgePose>,
  segments: Segment[],
  morphs: Morph[],
  startAt: number,
  rate = 1,
): Handle<string>[] {
  const byId = new Map(segments.map((segment) => [segment.id, segment]))
  return morphs.flatMap((morph) => {
    const base = byId.get(morph.segmentId)
    return base ? morphVoices(morph, base, startAt, rate).map((spec) => wedges.cue(spec)) : []
  })
}
```

- [ ] **Step 4: Implement `compose.ts`**

```ts
// src/clock/compose.ts
import { type Mix, mix } from '@msb235/blits'
import { hexString } from '../wheel/hex'
import type { Morph, Segment } from '../wheel/types'
import { cueMorphs } from './morphVoices'
import { type WedgePose, wedgeKit } from './motion'

/** A roster entry with its pose applied. Returns `base` itself when the pose changes nothing. */
export function composeSegment(base: Segment, pose: WedgePose): Segment {
  const weight = Math.max(0, base.weight + (pose.weight ?? 0))
  const color = pose.color === undefined ? base.color : hexString(pose.color)
  const label = pose.label ?? base.label
  const media = pose.media ?? base.media
  const reveal = pose.reveal === undefined ? base.reveal : (pose.reveal ?? undefined)
  if (
    weight === base.weight &&
    color === base.color &&
    label === base.label &&
    media === base.media &&
    reveal === base.reveal
  ) {
    return base
  }
  return { ...base, weight, color, label, media, reveal }
}

export function composeSegments(segments: Segment[], wedges: Mix<string, WedgePose>): Segment[] {
  return segments.map((segment) => composeSegment(segment, wedges.probe(segment.id)))
}

/** Whether two frames draw the same wheel, so a frame that changed nothing skips a render. */
export function sameFrame(a: Segment[], b: Segment[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => {
      const o = b[i]
      return (
        s === o ||
        (s.id === o.id &&
          s.weight === o.weight &&
          s.color === o.color &&
          s.label === o.label &&
          s.media === o.media &&
          s.reveal === o.reveal)
      )
    })
  )
}

/** The wheel `ms` into a spin, from the same voices a live spin cues, on a mix of its own. */
export function segmentsAt(segments: Segment[], morphs: Morph[], ms: number): Segment[] {
  if (morphs.length === 0) return segments
  const scratch = mix<string, WedgePose>(wedgeKit)
  cueMorphs(scratch, segments, morphs, 0)
  scratch.sync(ms)
  return composeSegments(segments, scratch)
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/clock`
Expected: PASS. If "turns weights into deltas" fails because `patch.keys` is not on the patch type, read the stops with `(voice.patch as { keys?: Stop[] }).keys` — blits' `keys()` sets `keys` on the patch object (`git -C ~/src/blits show main:src/patch.ts`, `function keys`).

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/clock/morphVoices.ts src/clock/compose.ts src/clock/morphVoices.test.ts
git commit -m "turn each morph into up to 3 blits voices and compose wedges from their poses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: A single trick matches the old output

**Files:**
- Test: `src/clock/golden.test.ts` (new)

- [ ] **Step 1: Write the test**

```ts
// src/clock/golden.test.ts
import { describe, expect, it } from 'vitest'
import { hexNumber } from '../wheel/hex'
import type { Morph, Segment } from '../wheel/types'
import golden from './__fixtures__/morph-golden.json'
import { segmentsAt } from './compose'

type Case = {
  segments: Segment[]
  morphs: Morph[]
  durationMs: number
  frames: { at: number; segments: Segment[] }[]
}

const linear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Björn Ottosson's OKLab, to measure how far the new OKLCH blend sits from the old sRGB one. */
function oklab(color: string): [number, number, number] {
  const n = hexNumber(color) as number
  const [r, g, b] = [linear((n >> 16) & 255), linear((n >> 8) & 255), linear(n & 255)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

// Measured worst case over these fixtures' colors: 0.097, red to navy.
const OKLAB_TOLERANCE = 0.12

describe('a single trick, against the old applyMorphs', () => {
  for (const [name, c] of Object.entries(golden as Record<string, Case>)) {
    for (const frame of c.frames) {
      it(`${name} at ${frame.at}`, () => {
        const now = segmentsAt(c.segments, c.morphs, frame.at * c.durationMs)
        frame.segments.forEach((old, i) => {
          const next = now[i]
          expect(next.id).toBe(old.id)
          expect(next.weight).toBeCloseTo(old.weight, 9)
          expect(next.label).toBe(old.label)
          expect(next.media).toEqual(old.media)
          expect(next.reveal).toEqual(old.reveal)
          if (old.color === undefined || next.color === undefined) {
            expect(next.color).toBe(old.color)
          } else if (frame.at === 0 || frame.at === 1) {
            expect(next.color).toBe(old.color)
          } else {
            const [a, b] = [oklab(next.color), oklab(old.color)]
            expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(OKLAB_TOLERANCE)
          }
        })
      })
    }
  }
})
```

`tsconfig.json` must allow the JSON import. If `npx tsc --noEmit` reports `resolveJsonModule`, add `"resolveJsonModule": true` to `compilerOptions`; vitest imports JSON either way.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/clock/golden.test.ts`
Expected: PASS, 30 tests. A failure on a weight or a label is a bug in `stopsFor`'s time remap, not in the fixture: compare the failing frame's time against `EASING_INVERSES`.

- [ ] **Step 3: Commit**

```bash
npm run check
git add src/clock/golden.test.ts tsconfig.json
git commit -m "check each recipe's voices against the captured applyMorphs output

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Drop `tsconfig.json` from `git add` if Step 1 did not change it.)

### Task 7: useSpin plays morphs on the wedge mix

**Files:**
- Modify: `src/wheel/useSpin.ts`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Update the tests to the new clock**

In `src/wheel/useSpin.test.ts`:

1. Replace `import { applyMorphs, landingSegments } from './morph'` with:

```ts
import { segmentsAt } from '../clock/compose'
import { landingSegments } from './morph'
```

2. Every assertion on `harness.rafStarts` or `harness.rafCancels` was a proxy for "a morph loop runs". Replace each with the wedge mix's cue count. Add at the top of `describe('useSpin')`, after phase 2's `fake` setup:

```ts
  /** Voices MORPHS makes: beer's weight and color, then ana's and ben's weight. */
  const MORPH_VOICES = 4
```

and in `beforeEach`, after `fake` is made:

```ts
    cues = vi.spyOn(fake.motion.wedges, 'cue')
```

with `let cues: ReturnType<typeof vi.spyOn>` declared beside `harness`. Then:

| Test | Old line | New line |
|---|---|---|
| keeps the landed distribution under reduced motion | `expect(harness.rafStarts).toBe(1)` | `expect(cues).toHaveBeenCalledTimes(MORPH_VOICES)` |
| same | `expect(harness.rafCancels).toBeGreaterThan(0)` | `expect(fake.motion.wedges.inert).toBe(false)` before the finish, and after the `flushFrames` block below: `expect(fake.motion.wedges.inert).toBe(true)` |
| same | `harness.flushFrames(1000 + REDUCED_MOTION_MS + 100)` and `harness.flushFrames(1000 + DURATION_MS / 2)` | `fake.step(1000 + REDUCED_MOTION_MS + 100)` and `fake.step(1000 + DURATION_MS / 2)` |
| refuses a second spin started in the same tick as the first | `expect(harness.rafStarts).toBe(1)` | `expect(cues).toHaveBeenCalledTimes(MORPH_VOICES)` |
| takes duration, easing, … from the override config | `expect(harness.rafStarts).toBe(1)` | `expect(cues).toHaveBeenCalledTimes(MORPH_VOICES)` |
| runs the late morphs on the animation clock | `expect(harness.rafStarts).toBe(1)` | `expect(cues).toHaveBeenCalledTimes(1)` |
| same | `harness.flushFrames(1000 + DURATION_MS * 0.6)` | `fake.step(1000 + DURATION_MS * 0.6)` |

Where a test calls `harness.setNow(1000)` before `spin()`, also call `act(() => fake.step(1000))` there, so `startedAt` is 1000 on the motion clock.

3. Replace the body of `'morphs the override segments on the override clock'` from its `act(() => { harness.flushFrames(1000 + 240) })` onward:

```ts
    act(() => fake.step(1000 + 240))

    // 240ms into a 300ms rotation is 80% of the way through, which on the
    // override's 4500ms morph lands inside the steep final stretch.
    const elapsedFraction = 240 / 300
    expect(result.current.displaySegments).toEqual(
      segmentsAt(SEGMENTS, MORPHS, elapsedFraction * DURATION_MS),
    )
    expect(result.current.displaySegments).not.toEqual(
      segmentsAt(SEGMENTS, MORPHS, elapsedFraction * 900),
    )

    await act(async () => {
      harness.animateCalls[0].finish()
    })
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
```

4. Replace `'holds the morphs at their start until the prologue is over'`:

```ts
  it('shows the roster untouched until the prologue is over', () => {
    act(() => fake.step(1000))
    const { result } = renderSpin(SHORTING)
    act(() => result.current.spin())
    const run = result.current.outage
    act(() => fake.step(1000 + (run?.plan.lightsAtMs ?? 0)))
    expect(result.current.displaySegments).toEqual(SEGMENTS)
  })
```

5. Add these tests at the end of `describe('useSpin')`:

```ts
  it('reaches the landing frame through the live mix', () => {
    act(() => fake.step(1000))
    const { result } = renderSpin(MORPHING)
    act(() => result.current.spin())
    act(() => fake.step(1000 + DURATION_MS))
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
  })

  it('stops drawing the morphs once the wheel lands', async () => {
    act(() => fake.step(1000))
    const { result } = renderSpin(MORPHING)
    act(() => result.current.spin())
    await act(async () => harness.animateCalls[0].finish())
    act(() => result.current.reset())
    // Something else waking the clock must not repaint the old landing over the roster.
    act(() => {
      fake.motion.ticker.wake()
      fake.step(1000 + DURATION_MS + 50)
    })
    expect(result.current.displaySegments).toEqual(SEGMENTS)
    expect(fake.motion.wedges.inert).toBe(true)
  })

  it('drops the morphs of a spin that is canceled', () => {
    act(() => fake.step(1000))
    const { result, unmount } = renderSpin(MORPHING)
    act(() => result.current.spin())
    unmount()
    act(() => fake.step(1100))
    expect(fake.motion.wedges.inert).toBe(true)
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL on the cue counts (`cue` never called) and on the new tests.

- [ ] **Step 3: Implement in `src/wheel/useSpin.ts`**

Imports: drop `applyMorphs` from `./morph` and `spinTime` from `./outage`; add

```ts
import type { Handle } from '@msb235/blits'
import { composeSegments, sameFrame } from '../clock/compose'
import { cueMorphs } from '../clock/morphVoices'
```

Replace `const frameRef = useRef<number | null>(null)` with:

```ts
  const morphVoicesRef = useRef<Handle<string>[]>([])
  const offMorphsRef = useRef<(() => void) | null>(null)
```

Add, before `stopTracks`:

```ts
  // A trick voice holds its last frame until faded, so whatever ends a spin fades them.
  const stopMorphs = useCallback(() => {
    offMorphsRef.current?.()
    offMorphsRef.current = null
    for (const voice of morphVoicesRef.current) voice.fade({ over: 0 })
    morphVoicesRef.current = []
  }, [])
```

In `stopTracks`, replace the `frameRef` block with `stopMorphs()` and add `stopMorphs` to its dependency list.

Replace the whole `// Track 2: geometry.` block with:

```ts
      // Track 2: geometry, on the wedge mix. Morphs are authored against the spin's own
      // durationMs, so a shortened spin plays them faster rather than cutting them off.
      if (morphs.length > 0 && durationMs > 0) {
        const { ticker, wedges } = motion
        morphVoicesRef.current = cueMorphs(
          wedges,
          spinSegments,
          morphs,
          startedAt + (outagePlan?.resumedAtMs ?? 0),
          spinConfig.durationMs / durationMs,
        )
        let shown = spinSegments
        offMorphsRef.current = ticker.subscribe(() => {
          const next = composeSegments(spinSegments, wedges)
          if (sameFrame(next, shown)) return
          shown = next
          setDisplaySegments(next)
        })
        ticker.wake()
      }
```

In `animation.finished.then`, replace the `frameRef` block with `stopMorphs()`. In `.catch`, add `stopMorphs()` after the guard. Add `stopMorphs` to the `spin` dependency list (`motion` is already there from phase 2).

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts
git commit -m "play spin morphs as voices on the wedge mix instead of a frame loop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: One landing path; retire applyMorphs

**Files:**
- Modify: `src/wheel/morph.ts`, `src/wheel/morph.test.ts`, `src/wheel/outage.ts`, `src/wheel/outage.test.ts`, `src/editor/Transport.tsx`, `src/editor/Transport.test.tsx`, `src/tricks/recipes/{invariants,recolor,relabel,swap}.test.ts`, `src/tricks/resolve.ts`, `src/spin/resolve.ts`, `src/tricks/recipes/swap.ts`

- [ ] **Step 1: Write the failing landing tests**

Replace all of `src/wheel/morph.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { segmentsAt } from '../clock/compose'
import { landingSegments } from './morph'
import { weightedRandom } from './selection'
import { planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

const D = 1000
const roster: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1 },
  { id: 'b', label: 'Ben', weight: 1 },
  { id: 'x', label: 'Xan', weight: 1 },
]
const grow: Morph = {
  segmentId: 'x',
  durationMs: D,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 3 },
  ],
}
const vanish: Morph = {
  segmentId: 'x',
  durationMs: D,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 0 },
  ],
}

describe('landingSegments', () => {
  it('is the live frame at the end of the spin', () => {
    expect(landingSegments(roster, [grow, vanish], D)).toEqual(segmentsAt(roster, [grow, vanish], D))
  })

  it('returns the roster itself when nothing morphs', () => {
    expect(landingSegments(roster, [], D)).toBe(roster)
  })

  it('lets a winner come from the blend', () => {
    // Later-wins would vanish x; blended, it grows by 2 and shrinks by 1.
    const landed = landingSegments(roster, [grow, vanish], D)
    expect(landed.find((s) => s.id === 'x')?.weight).toBe(2)

    const config: SpinConfig = {
      durationMs: D,
      fullSpins: 3,
      direction: 'cw',
      easing: [0, 0, 1, 1],
      morphs: [grow, vanish],
    }
    // Shares a 0.25, b 0.25, x 0.5: a roll of 0.9 falls in x.
    expect(planSpin(roster, config, weightedRandom, () => 0.9)?.winnerId).toBe('x')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/wheel/morph.test.ts`
Expected: FAIL on "lets a winner come from the blend": the old later-wins path lands x at 0.

- [ ] **Step 3: Shrink `src/wheel/morph.ts`**

Replace the whole file with:

```ts
import { segmentsAt } from '../clock/compose'
import type { Morph, Segment } from './types'

/**
 * The weight distribution the pointer will meet when the wheel stops. Selection
 * samples this, never the launch distribution.
 */
export function landingSegments(
  segments: Segment[],
  morphs: Morph[],
  spinDurationMs: number,
): Segment[] {
  return segmentsAt(segments, morphs, spinDurationMs)
}
```

- [ ] **Step 4: Move every other `applyMorphs` caller to `segmentsAt`**

```bash
for f in src/editor/Transport.tsx src/editor/Transport.test.tsx \
  src/tricks/recipes/invariants.test.ts src/tricks/recipes/recolor.test.ts \
  src/tricks/recipes/relabel.test.ts src/tricks/recipes/swap.test.ts; do
  sed -i '' 's/applyMorphs/segmentsAt/g' "$f"
done
```

Then fix each file's import by hand:

| File | Import becomes |
|---|---|
| `src/editor/Transport.tsx`, `src/editor/Transport.test.tsx` | `import { segmentsAt } from '../clock/compose'` |
| `src/tricks/recipes/recolor.test.ts`, `relabel.test.ts`, `swap.test.ts` | `import { segmentsAt } from '../../clock/compose'` |
| `src/tricks/recipes/invariants.test.ts` | `import { segmentsAt } from '../../clock/compose'` plus `import { landingSegments } from '../../wheel/morph'` |

Reword the comments the rename left wrong:

- `src/editor/Transport.tsx`: `// \`segmentsAt\` is pure, so scrubbing needs no animation machinery — it plays the voices a real spin cues, at a fixed instant.`
- `src/editor/Transport.test.tsx`: `// through the component, since asserting on segmentsAt alone would pass`
- `src/tricks/recipes/swap.test.ts`, in "snaps the color rather than fading it": `// Both keyframes share one offset, so the color jumps at it. A fade would telegraph the switch to the audience.`
- `src/tricks/recipes/swap.ts`: `// itself, the second is what it becomes. Two stops at one offset snap rather than fade — a fade would show`
- `src/tricks/recipes/invariants.test.ts`, the comment near line 83 that says "how morph.ts brackets keyframes": `// today, but only because of where the morph voices put each stop — these lock the`
- `src/tricks/resolve.ts`, the paragraph beginning "Morphs are last-write-wins": `Two morphs on one wedge blend: weight changes add, colors crossfade, and for a label, media or reveal the later trick in list order wins.`
- `src/spin/resolve.ts`: `— the morph voices rewrite a wedge's weight, never the membership of the list —`

- [ ] **Step 5: Delete `spinTime`**

Delete `spinTime` and its doc comment from `src/wheel/outage.ts`, and the `describe('spinTime', …)` block and its import from `src/wheel/outage.test.ts`.

- [ ] **Step 6: Confirm nothing still names the removed functions**

Run: `grep -rnE "applyMorphs|morphProgress|lerpColor|spinTime|sampleWeight|sampleColor|sampleStep|sampleReveal" src`
Expected: no output.

Run: `grep -rn "keyframes/bracket" src`
Expected: only `src/transition/sample.ts` and `src/keyframes/bracket.test.ts`; `bracket` leaves with phase 5.

- [ ] **Step 7: Run every touched test**

Run: `npx vitest run src/wheel src/editor/Transport.test.tsx src/tricks src/spin src/clock`
Expected: PASS. A recipe test asserting an exact midpoint color is reading sRGB arithmetic; none does today ("interpolates rather than stepping" asserts only that it is neither end).

- [ ] **Step 8: Commit**

```bash
npm run check
git add -A src
git commit -m "land, draw and scrub morphs through one voice path, and delete applyMorphs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Conflict badges say blends or overrides

**Files:**
- Modify: `src/tricks/conflicts.ts`, `src/editor/TrickLibrary.tsx`
- Test: `src/tricks/conflicts.test.ts`, `src/editor/TrickLibrary.test.tsx`, `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/tricks/conflicts.test.ts`, change the expectation in "reports a segment two tricks both write the weight of" to:

```ts
    expect(conflicts).toEqual([
      { segmentId: 'ana', property: 'weight', trickIds: ['beer', 'v'], blends: true },
    ])
```

and append (add `conflictText` to the `./conflicts` import):

```ts
const relabelAna = (id: string): Trick => ({
  id,
  name: id,
  recipe: 'relabel',
  params: { targets: ['ana'], toLabel: id },
  enabled: true,
})

describe('conflictText', () => {
  it('says two color tricks blend', () => {
    const conflicts = findConflicts(base, [grayEveryone, { ...grayEveryone, id: 'gray2' }], 1000)
    expect(conflictText('gray', conflicts)).toBe('blends with another trick on ana, ben')
  })

  it('says the later of two relabels overrides the earlier', () => {
    const conflicts = findConflicts(base, [relabelAna('first'), relabelAna('second')], 1000)
    expect(conflicts[0].blends).toBe(false)
    expect(conflictText('second', conflicts)).toBe('overrides another trick on ana')
    expect(conflictText('first', conflicts)).toBe('overridden by a later trick on ana')
  })
})
```

In `src/editor/Editor.test.tsx`, change `/also written by another trick/i` to `/blends with another trick/i`.

In `src/editor/TrickLibrary.test.tsx`, add `blends: true` to the conflict object at line 127.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/tricks/conflicts.test.ts src/editor/TrickLibrary.test.tsx src/editor/Editor.test.tsx`
Expected: FAIL: no `blends` field, no `conflictText`, old badge text.

- [ ] **Step 3: Implement**

In `src/tricks/conflicts.ts`:

```ts
/** Properties two tricks blend on; on the rest the later trick in list order wins. */
const BLENDS: ReadonlySet<Write['property']> = new Set(['weight', 'color'])

export type Conflict = Write & { trickIds: string[]; blends: boolean }
```

and in the loop that builds `conflicts`:

```ts
      conflicts.push({ segmentId, property, trickIds, blends: BLENDS.has(property) })
```

Append:

```ts
/** What a trick's badge says about the conflicts it is in. `own` holds only those. */
export function conflictText(trickId: string, own: Conflict[]): string {
  const on = (list: Conflict[]) => [...new Set(list.map((c) => c.segmentId))].join(', ')
  const blends = own.filter((c) => c.blends)
  const wins = own.filter((c) => !c.blends && c.trickIds.at(-1) === trickId)
  const loses = own.filter((c) => !c.blends && c.trickIds.at(-1) !== trickId)
  return [
    blends.length > 0 ? `blends with another trick on ${on(blends)}` : '',
    wins.length > 0 ? `overrides another trick on ${on(wins)}` : '',
    loses.length > 0 ? `overridden by a later trick on ${on(loses)}` : '',
  ]
    .filter((part) => part !== '')
    .join('; ')
}
```

In `src/editor/TrickLibrary.tsx`, import `conflictText` beside `Conflict` (make it `import { type Conflict, conflictText } from '../tricks/conflicts'`) and change the badge line to:

```tsx
                  ⚠ {conflictText(trick.id, own)}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/tricks src/editor/TrickLibrary.test.tsx src/editor/Editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/tricks/conflicts.ts src/tricks/conflicts.test.ts src/editor/TrickLibrary.tsx src/editor/TrickLibrary.test.tsx src/editor/Editor.test.tsx
git commit -m "say whether two tricks on a wedge blend or one overrides the other

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Record the build in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-blits-migration-design.md`, `docs/HANDOFF.md`

- [ ] **Step 1: Update the spec**

- Opening status line: phase 4 built.
- "Tricks": stops move to the time the morph's easing reaches them, and each segment takes that slice of the curve (one sentence). `landingSegments` and the editor scrub share `segmentsAt`.
- "Removed": `applyMorphs`, its samplers, `lerpColor`, `morphProgress`, `spinTime` are gone; `bracket.ts` waits for phase 5 (presence still reads it).
- "Wedge transitions" or "Structure": the per-frame wedge render stays until phase 5 writes arc geometry to the DOM for weight and `share` together.
- Drop the "Late swap" row from the Tricks test table: the swap is cued at the spin's start.

- [ ] **Step 2: Update the handoff**

In `docs/HANDOFF.md`, move phase 4 from next to done and carry this plan's open questions that Mike has not answered.

- [ ] **Step 3: Delete this plan**

Per the repo's rule that finished plans are deleted once their content lives in the spec: `git rm docs/superpowers/plans/2026-10-03-blits-tricks.md`.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "record the built trick voices in the blits design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| wedge kit: `weight: sum()`, `color: hex()`, `label`/`media`/`reveal: last()` | 4 (presence channels: phase 5, see open questions) |
| `morphVoices(morph, base, startAt)`, `hold: 'after'`, weight 1, subject `segmentId` | 5 |
| weight deltas, implicit 0% stop, color locus `color:<id>`, discrete later wins, null reveal | 4, 5 |
| only touched channels emit a voice | 5 |
| start at `startedAt + prologueMs` replaces `spinTime` | 5, 7, 8 |
| `landingSegments` via a scratch mix; one landing path; winner from the blend | 5, 8 |
| `findConflicts` badges "blends with" / "overrides" | 9 |
| Removed: morph loop, `applyMorphs`, samplers, `lerpColor` | 7, 8 (`bracket.ts`: phase 5) |
| Tests: weight deltas, implicit stop, easing, reveal, touched channels, single trick, adds, floor, crossfade, later wins, holds, no wrap, untouched, prologue, one path, winner, badges | 5, 6, 8, 9 |
| Test: late swap | dropped, see "Spec claims found false" |
