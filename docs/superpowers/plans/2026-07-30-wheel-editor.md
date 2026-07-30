# Wheel Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an editor at `#/edit` that edits the wheel's segments and manages a library of parameterized tricks, and convert the hardcoded free-beer gag into data.

**Architecture:** A new `tricks/` module turns saved `Trick` records (a recipe id plus bound params) into `Morph[]` through a two-pass resolver: every enabled trick first contributes weight-0 segments, then every enabled trick resolves morphs against the combined list. Composition is last-write-wins in trick-list order, so `morph.ts` is not modified. A `preset/` module persists segments and tricks to `localStorage`; the show page reads it, the editor writes it.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest, Biome, `@weasel-js/labkit` (self-contained npm build that bundles `@weasel-js/ui` and re-exports it at `@weasel-js/labkit/weasel-ui`).

**Spec:** `docs/superpowers/specs/2026-07-30-wod-editor-design.md`

---

## File Structure

**New — `src/tricks/` (pure, no React):**

| File | Responsibility |
|---|---|
| `types.ts` | `RecipeId`, `TrickParams`, `RecipeContext`, `Recipe`, `Trick`, `Write`, `RecipeField` |
| `params.ts` | Coercion helpers that read `TrickParams` with fallbacks |
| `registry.ts` | `RECIPES: Record<RecipeId, Recipe>`, `getRecipe()` |
| `resolve.ts` | `resolveTricks()` — the two-pass resolver |
| `conflicts.ts` | `findConflicts()` — overlapping `writes()`, editor-facing only |
| `recipes/takeover.ts` | Provides a wedge; relational weight math |
| `recipes/vanish.ts` | Targets existing segments; weight → 0 |
| `recipes/recolor.ts` | Continuous non-weight property |
| `recipes/relabel.ts` | Discrete non-weight property |

**New — `src/preset/`:**

| File | Responsibility |
|---|---|
| `types.ts` | `Preset` |
| `defaults.ts` | The seed preset, including the free-beer takeover trick |
| `storage.ts` | `loadPreset()`, `savePreset()`, `subscribePreset()` |

**New — `src/editor/`:**

| File | Responsibility |
|---|---|
| `Editor.tsx` | `LabShell` + three columns + preset state |
| `SegmentList.tsx` | Left column |
| `TrickLibrary.tsx` | Right column, trick cards |
| `RecipeForm.tsx` | Generated param form from `recipe.fields` |
| `Transport.tsx` | Scrub + play |
| `PresetIo.tsx` | JSON export link and import picker |
| `Editor.css` | All editor styling |

**labkit components used:** `LabShell` (chrome), `PropertyPanel` /
`PropertyList` / `PropertyRow` (containers), `SliderRow`, `NumberRow`,
`ColorRow`, `TextRow`, `SelectRow`, `CheckboxRow` (generated param forms),
`EffectCardList` + `EffectCard` (trick library with drag reorder). `Button`
comes from the `@weasel-js/labkit/weasel-ui` passthrough.

**Modified:**

- `src/wheel/palette.ts` — **new**, extracted from `Wheel.tsx` so recipes can resolve a segment's effective color
- `src/wheel/Wheel.tsx` — imports the extracted palette
- `src/main.tsx` — hash routing
- `src/App.tsx` — reads the preset instead of holding constants
- `package.json` — adds `@weasel-js/labkit`

---

### Task 1: Install labkit and add hash routing

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`
- Create: `src/editor/Editor.tsx` (stub)
- Test: `src/routing.test.ts`

- [ ] **Step 1: Install the dependency**

```bash
npm install @weasel-js/labkit@^0.1.0
```

This package bundles `@weasel-js/ui` and declares only `react`/`react-dom` as peers, so nothing else is needed.

- [ ] **Step 2: Write the failing test**

Create `src/routing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { routeFromHash } from './routing'

describe('routeFromHash', () => {
  it('routes #/edit to the editor', () => {
    expect(routeFromHash('#/edit')).toBe('edit')
  })

  it('routes an empty hash to the show page', () => {
    expect(routeFromHash('')).toBe('show')
  })

  it('routes an unknown hash to the show page', () => {
    expect(routeFromHash('#/nonsense')).toBe('show')
  })

  it('ignores a trailing slash', () => {
    expect(routeFromHash('#/edit/')).toBe('edit')
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- src/routing.test.ts`
Expected: FAIL — `Failed to resolve import "./routing"`

- [ ] **Step 4: Write the implementation**

Create `src/routing.ts`:

```ts
export type Route = 'show' | 'edit'

/**
 * Hash routing, not path routing: a static SPA on GitHub Pages cannot serve
 * `/edit` without a server rewrite.
 */
export function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/$/, '')
  return path === '/edit' ? 'edit' : 'show'
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/routing.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 6: Add the editor stub**

Create `src/editor/Editor.tsx`:

```tsx
export function Editor() {
  return <main className="editor">editor</main>
}
```

- [ ] **Step 7: Wire routing into the entry point**

Replace `src/main.tsx` entirely:

```tsx
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Editor } from './editor/Editor'
import { type Route, routeFromHash } from './routing'
import '@weasel-js/labkit/styles.css'

function Root() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route === 'edit' ? <Editor /> : <App />
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
```

- [ ] **Step 8: Verify the build and the full suite**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/routing.ts src/routing.test.ts src/main.tsx src/editor/Editor.tsx
git commit -m "feat(editor): add labkit and hash routing to #/edit"
```

---

### Task 2: Extract the wheel palette

The `recolor` recipe needs a segment's *effective* color — the one the wheel actually paints, which falls back to a palette entry when `segment.color` is undefined. That palette is currently private to `Wheel.tsx`.

**Files:**
- Create: `src/wheel/palette.ts`
- Create: `src/wheel/palette.test.ts`
- Modify: `src/wheel/Wheel.tsx:7` and `:31`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { effectiveColor } from './palette'
import type { Segment } from './types'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0, color: '#ffd166' },
]

describe('effectiveColor', () => {
  it('returns an explicit color when the segment has one', () => {
    expect(effectiveColor(segments, 'beer')).toBe('#ffd166')
  })

  it('falls back to the palette entry for the segment index', () => {
    expect(effectiveColor(segments, 'ana')).toBe('#f4a261')
  })

  it('returns null for an unknown segment', () => {
    expect(effectiveColor(segments, 'nobody')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/wheel/palette.test.ts`
Expected: FAIL — cannot resolve `./palette`

- [ ] **Step 3: Write the implementation**

Create `src/wheel/palette.ts`:

```ts
import type { Segment } from './types'

export const DEFAULT_PALETTE = ['#f4a261', '#2a9d8f', '#e76f51', '#e9c46a', '#8ab17d', '#5f8dd3']

export function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
}

/** The color the wheel actually paints, resolving the palette fallback. */
export function effectiveColor(segments: Segment[], id: string): string | null {
  const index = segments.findIndex((s) => s.id === id)
  if (index === -1) return null
  return segments[index].color ?? paletteColor(index)
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/wheel/palette.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Point `Wheel.tsx` at the extracted palette**

In `src/wheel/Wheel.tsx`, delete the `DEFAULT_PALETTE` const on line 7 and add to the imports:

```tsx
import { paletteColor } from './palette'
```

Then replace the color line inside the map:

```tsx
const color = segment.color ?? paletteColor(index)
```

- [ ] **Step 6: Verify nothing regressed**

Run: `npm test`
Expected: PASS — all pre-existing wheel tests still green

- [ ] **Step 7: Commit**

```bash
git add src/wheel/palette.ts src/wheel/palette.test.ts src/wheel/Wheel.tsx
git commit -m "refactor(wheel): extract the palette so recipes can resolve colors"
```

---

### Task 3: Trick types and param readers

**Files:**
- Create: `src/tricks/types.ts`
- Create: `src/tricks/params.ts`
- Create: `src/tricks/params.test.ts`

- [ ] **Step 1: Write the types (no test — types only)**

Create `src/tricks/types.ts`:

```ts
import type { EasingName, Morph, Segment } from '../wheel/types'

export type RecipeId = 'takeover' | 'vanish' | 'recolor' | 'relabel'

export type TrickParams = Record<string, unknown>

export type Write = {
  segmentId: string
  property: 'weight' | 'color' | 'label' | 'media'
}

/** Declarative form spec. The editor renders these; recipes never import React. */
export type RecipeField =
  | { key: string; label: string; kind: 'slider'; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'number'; min?: number; max?: number }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'text' }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  /** Multi-select over the current segment list, resolved at render time. */
  | { key: string; label: string; kind: 'segments' }

/** All segments including provided wedges, plus what a recipe needs to resolve. */
export type RecipeContext = {
  trickId: string
  segments: Segment[]
  durationMs: number
}

export type Recipe = {
  id: RecipeId
  /** Structural. "One wedge swallows the wheel", never "free beer". */
  name: string
  description: string
  defaults: TrickParams
  fields: RecipeField[]
  /** Weight-0 segments this recipe contributes. Usually empty. */
  provides(params: TrickParams, trickId: string): Segment[]
  /** Pure. The only thing that affects what actually runs. */
  resolve(params: TrickParams, ctx: RecipeContext): Morph[]
  /** Editor-facing only. Never consulted during resolution. */
  writes(params: TrickParams, ctx: RecipeContext): Write[]
  /** Human-readable reason this trick cannot run, or null when it can. */
  validate(params: TrickParams, segments: Segment[]): string | null
}

export type Trick = {
  id: string
  /** The operator's free text, e.g. 'slow burn'. */
  name: string
  recipe: RecipeId
  params: TrickParams
  enabled: boolean
}

export type { EasingName }
```

- [ ] **Step 2: Write the failing test for param readers**

Create `src/tricks/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readEasing, readNumber, readString, readStringArray } from './params'

describe('readNumber', () => {
  it('reads a finite number', () => {
    expect(readNumber({ x: 0.6 }, 'x', 1)).toBe(0.6)
  })

  it('falls back when missing', () => {
    expect(readNumber({}, 'x', 1)).toBe(1)
  })

  it('falls back on a non-finite value', () => {
    expect(readNumber({ x: Number.NaN }, 'x', 1)).toBe(1)
  })

  it('falls back on a string', () => {
    expect(readNumber({ x: '0.6' }, 'x', 1)).toBe(1)
  })
})

describe('readString', () => {
  it('reads a string', () => {
    expect(readString({ s: 'hi' }, 's', '')).toBe('hi')
  })

  it('falls back on a number', () => {
    expect(readString({ s: 3 }, 's', 'x')).toBe('x')
  })
})

describe('readStringArray', () => {
  it('reads an array of strings', () => {
    expect(readStringArray({ t: ['a', 'b'] }, 't')).toEqual(['a', 'b'])
  })

  it('drops non-string entries', () => {
    expect(readStringArray({ t: ['a', 3, null] }, 't')).toEqual(['a'])
  })

  it('returns empty for a missing key', () => {
    expect(readStringArray({}, 't')).toEqual([])
  })
})

describe('readEasing', () => {
  it('reads a known easing', () => {
    expect(readEasing({ e: 'easeIn' }, 'e')).toBe('easeIn')
  })

  it('falls back to linear on an unknown easing', () => {
    expect(readEasing({ e: 'bouncy' }, 'e')).toBe('linear')
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- src/tricks/params.test.ts`
Expected: FAIL — cannot resolve `./params`

- [ ] **Step 4: Write the implementation**

Create `src/tricks/params.ts`:

```ts
import type { EasingName } from '../wheel/types'
import type { TrickParams } from './types'

const EASING_NAMES: EasingName[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

export function readNumber(params: TrickParams, key: string, fallback: number): number {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readString(params: TrickParams, key: string, fallback: string): string {
  const value = params[key]
  return typeof value === 'string' ? value : fallback
}

export function readOptionalString(params: TrickParams, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function readStringArray(params: TrickParams, key: string): string[] {
  const value = params[key]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function readEasing(params: TrickParams, key: string): EasingName {
  const value = params[key]
  return EASING_NAMES.find((name) => name === value) ?? 'linear'
}

/** Clamps to 0..1, which every timing parameter needs. */
export function readUnit(params: TrickParams, key: string, fallback: number): number {
  return Math.min(1, Math.max(0, readNumber(params, key, fallback)))
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/tricks/params.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 6: Commit**

```bash
git add src/tricks/types.ts src/tricks/params.ts src/tricks/params.test.ts
git commit -m "feat(tricks): add recipe types and param readers"
```

---

### Task 4: The `vanish` recipe

Built before `takeover` because it is the simplest complete recipe and establishes the shape every other recipe follows.

**Files:**
- Create: `src/tricks/recipes/vanish.ts`
- Create: `src/tricks/recipes/vanish.test.ts`

Params: `targets: string[]` (empty means every segment), `startAt: number` (0..1), `easing: EasingName`.

- [ ] **Step 1: Write the failing test**

Create `src/tricks/recipes/vanish.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { vanish } from './vanish'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 3 },
]

const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }

describe('vanish', () => {
  it('provides no segments', () => {
    expect(vanish.provides({ targets: ['ana'] }, 't1')).toEqual([])
  })

  it('emits one morph per named target and touches nothing else', () => {
    const morphs = vanish.resolve({ targets: ['ana'], startAt: 0.5 }, ctx)
    expect(morphs.map((m) => m.segmentId)).toEqual(['ana'])
  })

  it('holds the base weight until startAt, then drops to zero', () => {
    const [morph] = vanish.resolve({ targets: ['ben'], startAt: 0.5 }, ctx)
    expect(morph.keyframes).toEqual([
      { at: 0, weight: 3 },
      { at: 0.5, weight: 3 },
      { at: 1, weight: 0 },
    ])
  })

  it('targets every segment when targets is empty', () => {
    const morphs = vanish.resolve({ targets: [] }, ctx)
    expect(morphs.map((m) => m.segmentId)).toEqual(['ana', 'ben'])
  })

  it('ignores a target that does not exist', () => {
    const morphs = vanish.resolve({ targets: ['ghost'] }, ctx)
    expect(morphs).toEqual([])
  })

  it('carries the spin duration onto each morph', () => {
    const [morph] = vanish.resolve({ targets: ['ana'] }, ctx)
    expect(morph.durationMs).toBe(1000)
  })

  it('declares exactly the weights it writes', () => {
    expect(vanish.writes({ targets: ['ana'] }, ctx)).toEqual([
      { segmentId: 'ana', property: 'weight' },
    ])
  })

  it('rejects a target that no longer exists', () => {
    expect(vanish.validate({ targets: ['ghost'] }, segments)).toMatch(/ghost/)
  })

  it('accepts a valid target', () => {
    expect(vanish.validate({ targets: ['ana'] }, segments)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/tricks/recipes/vanish.test.ts`
Expected: FAIL — cannot resolve `./vanish`

- [ ] **Step 3: Write the implementation**

Create `src/tricks/recipes/vanish.ts`:

```ts
import type { Morph, Segment } from '../../wheel/types'
import { readEasing, readStringArray, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

/** Empty `targets` means every segment. */
function resolveTargets(params: TrickParams, segments: Segment[]): Segment[] {
  const names = readStringArray(params, 'targets')
  if (names.length === 0) return segments
  return segments.filter((segment) => names.includes(segment.id))
}

export const vanish: Recipe = {
  id: 'vanish',
  name: 'Named wedges shrink away',
  description: 'The chosen wedges shrink to nothing, so they cannot win.',
  defaults: { targets: [], startAt: 0.5, easing: 'easeIn' },
  fields: [
    { key: 'targets', label: 'Wedges', kind: 'segments' },
    { key: 'startAt', label: 'Starts at', kind: 'slider', min: 0, max: 1, step: 0.05 },
    {
      key: 'easing',
      label: 'Easing',
      kind: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'easeIn', label: 'Ease in' },
        { value: 'easeOut', label: 'Ease out' },
        { value: 'easeInOut', label: 'Ease in-out' },
      ],
    },
  ],

  provides: () => [],

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const startAt = readUnit(params, 'startAt', 0.5)
    const easing = readEasing(params, 'easing')
    return resolveTargets(params, ctx.segments).map((segment) => ({
      segmentId: segment.id,
      durationMs: ctx.durationMs,
      easing,
      keyframes: [
        { at: 0, weight: segment.weight },
        { at: startAt, weight: segment.weight },
        { at: 1, weight: 0 },
      ],
    }))
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    return resolveTargets(params, ctx.segments).map((segment) => ({
      segmentId: segment.id,
      property: 'weight' as const,
    }))
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    const missing = readStringArray(params, 'targets').filter(
      (id) => !segments.some((segment) => segment.id === id),
    )
    return missing.length === 0 ? null : `unknown wedge: ${missing.join(', ')}`
  },
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/tricks/recipes/vanish.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/tricks/recipes/vanish.ts src/tricks/recipes/vanish.test.ts
git commit -m "feat(tricks): add the vanish recipe"
```

---

### Task 5: The `takeover` recipe

**Files:**
- Create: `src/tricks/recipes/takeover.ts`
- Create: `src/tricks/recipes/takeover.test.ts`

Params: `wedgeMode: 'new' | 'existing'`, `wedgeLabel: string`, `wedgeColor: string`, `wedgeSegmentId: string`, `holdUntil: number`, `endShare: number`, `endColor?: string`, `easing: EasingName`.

The wedge is flattened into scalar params rather than nested, because `RecipeField` renders flat rows.

**The weight math.** Weights are relative and normalized at render. To leave the wedge holding `endShare` of the circle while the other segments keep their weights (total `T`), the wedge needs weight `endShare * T / (1 - endShare)`. At `endShare >= 1` that diverges, which is exactly the case where every other segment must instead go to zero — and a wedge holding all the weight is the parent spec's guaranteed win, enforced by geometry.

- [ ] **Step 1: Write the failing test**

Create `src/tricks/recipes/takeover.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { landingSegments } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { takeover, wedgeIdFor } from './takeover'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const newWedgeParams = {
  wedgeMode: 'new',
  wedgeLabel: 'free beer',
  wedgeColor: '#ffd166',
  holdUntil: 0.6,
  endShare: 1,
  endColor: '#ff8811',
  easing: 'easeIn',
}

describe('takeover.provides', () => {
  it('contributes one weight-zero wedge in new mode', () => {
    expect(takeover.provides(newWedgeParams, 't1')).toEqual([
      { id: 't1:wedge', label: 'free beer', weight: 0, color: '#ffd166' },
    ])
  })

  it('contributes nothing in existing mode', () => {
    expect(takeover.provides({ wedgeMode: 'existing', wedgeSegmentId: 'ana' }, 't1')).toEqual([])
  })

  it('derives the wedge id from the trick id', () => {
    expect(wedgeIdFor('t1')).toBe('t1:wedge')
  })
})

describe('takeover.resolve at full share', () => {
  const segments = [...people, ...takeover.provides(newWedgeParams, 't1')]
  const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }
  const morphs = takeover.resolve(newWedgeParams, ctx)

  it('grows the wedge from zero after the hold', () => {
    const wedge = morphs.find((m) => m.segmentId === 't1:wedge')
    expect(wedge?.keyframes).toEqual([
      { at: 0, weight: 0, color: '#ffd166' },
      { at: 0.6, weight: 0, color: '#ffd166' },
      { at: 1, weight: 1, color: '#ff8811' },
    ])
  })

  it('drives every other segment to zero', () => {
    const others = morphs.filter((m) => m.segmentId !== 't1:wedge')
    expect(others.map((m) => m.segmentId).sort()).toEqual(['ana', 'ben'])
    for (const morph of others) {
      expect(morph.keyframes.at(-1)).toEqual({ at: 1, weight: 0 })
    }
  })

  it('leaves the wedge holding the entire circle at landing', () => {
    const landed = landingSegments(segments, morphs, 1000)
    const nonZero = landed.filter((segment) => segment.weight > 0)
    expect(nonZero.map((segment) => segment.id)).toEqual(['t1:wedge'])
  })
})

describe('takeover.resolve at partial share', () => {
  const params = { ...newWedgeParams, endShare: 0.5 }
  const segments = [...people, ...takeover.provides(params, 't1')]
  const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }
  const morphs = takeover.resolve(params, ctx)

  it('leaves the other segments alone', () => {
    expect(morphs.map((m) => m.segmentId)).toEqual(['t1:wedge'])
  })

  it('gives the wedge the weight that yields the requested share', () => {
    // others total 2, share 0.5 -> 0.5 * 2 / 0.5 = 2
    expect(morphs[0].keyframes.at(-1)?.weight).toBe(2)
  })

  it('renders as the requested share of the circle at landing', () => {
    const landed = landingSegments(segments, morphs, 1000)
    const total = landed.reduce((sum, segment) => sum + segment.weight, 0)
    const wedge = landed.find((segment) => segment.id === 't1:wedge')
    expect((wedge?.weight ?? 0) / total).toBeCloseTo(0.5, 10)
  })
})

describe('takeover in existing mode', () => {
  const params = { wedgeMode: 'existing', wedgeSegmentId: 'ana', holdUntil: 0, endShare: 1 }
  const ctx: RecipeContext = { trickId: 't1', segments: people, durationMs: 1000 }

  it('grows the named segment from its own base weight', () => {
    const morphs = takeover.resolve(params, ctx)
    const wedge = morphs.find((m) => m.segmentId === 'ana')
    expect(wedge?.keyframes[0]).toEqual({ at: 0, weight: 1 })
  })
})

describe('takeover.writes', () => {
  const segments = [...people, ...takeover.provides(newWedgeParams, 't1')]
  const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }

  it('matches the segments and properties resolve actually emits', () => {
    const declared = takeover.writes(newWedgeParams, ctx)
    const emitted = takeover.resolve(newWedgeParams, ctx).flatMap((morph) =>
      [
        morph.keyframes.some((k) => k.weight !== undefined)
          ? { segmentId: morph.segmentId, property: 'weight' as const }
          : null,
        morph.keyframes.some((k) => k.color !== undefined)
          ? { segmentId: morph.segmentId, property: 'color' as const }
          : null,
      ].filter((write) => write !== null),
    )
    expect([...declared].sort(byWrite)).toEqual([...emitted].sort(byWrite))
  })
})

function byWrite(a: { segmentId: string; property: string }, b: typeof a): number {
  return a.segmentId.localeCompare(b.segmentId) || a.property.localeCompare(b.property)
}

describe('takeover.validate', () => {
  it('rejects an existing-mode target that is gone', () => {
    expect(
      takeover.validate({ wedgeMode: 'existing', wedgeSegmentId: 'ghost' }, people),
    ).toMatch(/ghost/)
  })

  it('accepts new mode regardless of the segment list', () => {
    expect(takeover.validate(newWedgeParams, [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/tricks/recipes/takeover.test.ts`
Expected: FAIL — cannot resolve `./takeover`

- [ ] **Step 3: Write the implementation**

Create `src/tricks/recipes/takeover.ts`:

```ts
import type { Morph, MorphKeyframe, Segment } from '../../wheel/types'
import { readEasing, readOptionalString, readString, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

/** Deterministic so `provides` and `resolve` agree on the wedge's identity. */
export function wedgeIdFor(trickId: string): string {
  return `${trickId}:wedge`
}

function isNewMode(params: TrickParams): boolean {
  return readString(params, 'wedgeMode', 'new') === 'new'
}

function wedgeId(params: TrickParams, trickId: string): string {
  return isNewMode(params) ? wedgeIdFor(trickId) : readString(params, 'wedgeSegmentId', '')
}

export const takeover: Recipe = {
  id: 'takeover',
  name: 'One wedge swallows the wheel',
  description:
    'A wedge sits still, then grows to take the chosen share of the circle. At a full share every other wedge shrinks to nothing, which makes the winner certain.',
  defaults: {
    wedgeMode: 'new',
    wedgeLabel: 'free beer',
    wedgeColor: '#ffd166',
    wedgeSegmentId: '',
    holdUntil: 0.6,
    endShare: 1,
    endColor: '',
    easing: 'easeIn',
  },
  fields: [
    {
      key: 'wedgeMode',
      label: 'Wedge',
      kind: 'select',
      options: [
        { value: 'new', label: 'New wedge owned by this trick' },
        { value: 'existing', label: 'An existing wedge' },
      ],
    },
    { key: 'wedgeLabel', label: 'Wedge label', kind: 'text' },
    { key: 'wedgeColor', label: 'Wedge color', kind: 'color' },
    { key: 'wedgeSegmentId', label: 'Existing wedge', kind: 'segments' },
    { key: 'holdUntil', label: 'Holds until', kind: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'endShare', label: 'Final share', kind: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'endColor', label: 'Final color', kind: 'color' },
    {
      key: 'easing',
      label: 'Easing',
      kind: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'easeIn', label: 'Ease in' },
        { value: 'easeOut', label: 'Ease out' },
        { value: 'easeInOut', label: 'Ease in-out' },
      ],
    },
  ],

  provides(params: TrickParams, trickId: string): Segment[] {
    if (!isNewMode(params)) return []
    return [
      {
        id: wedgeIdFor(trickId),
        label: readString(params, 'wedgeLabel', 'free beer'),
        weight: 0,
        color: readString(params, 'wedgeColor', '#ffd166'),
      },
    ]
  },

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const id = wedgeId(params, ctx.trickId)
    const wedge = ctx.segments.find((segment) => segment.id === id)
    if (!wedge) return []

    const holdUntil = readUnit(params, 'holdUntil', 0.6)
    const endShare = readUnit(params, 'endShare', 1)
    const endColor = readOptionalString(params, 'endColor')
    const easing = readEasing(params, 'easing')

    const others = ctx.segments.filter((segment) => segment.id !== id)
    const othersTotal = others.reduce((sum, segment) => sum + segment.weight, 0)

    // At a full share the others must go to zero, so the wedge's own number is
    // arbitrary. Below that, solve w / (w + T) = share for w.
    const takesAll = endShare >= 1
    const endWeight = takesAll ? 1 : (endShare * othersTotal) / (1 - endShare)

    const grow: MorphKeyframe[] = [
      { at: 0, weight: wedge.weight },
      { at: holdUntil, weight: wedge.weight },
      { at: 1, weight: endWeight },
    ]
    if (endColor && wedge.color) {
      grow[0] = { ...grow[0], color: wedge.color }
      grow[1] = { ...grow[1], color: wedge.color }
      grow[2] = { ...grow[2], color: endColor }
    }

    const morphs: Morph[] = [{ segmentId: id, durationMs: ctx.durationMs, easing, keyframes: grow }]
    if (!takesAll) return morphs

    for (const segment of others) {
      morphs.push({
        segmentId: segment.id,
        durationMs: ctx.durationMs,
        easing,
        keyframes: [
          { at: 0, weight: segment.weight },
          { at: holdUntil, weight: segment.weight },
          { at: 1, weight: 0 },
        ],
      })
    }
    return morphs
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    const id = wedgeId(params, ctx.trickId)
    const wedge = ctx.segments.find((segment) => segment.id === id)
    if (!wedge) return []

    const writes: Write[] = [{ segmentId: id, property: 'weight' }]
    if (readOptionalString(params, 'endColor') && wedge.color) {
      writes.push({ segmentId: id, property: 'color' })
    }
    if (readUnit(params, 'endShare', 1) >= 1) {
      for (const segment of ctx.segments) {
        if (segment.id !== id) writes.push({ segmentId: segment.id, property: 'weight' })
      }
    }
    return writes
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    if (isNewMode(params)) return null
    const id = readString(params, 'wedgeSegmentId', '')
    if (id === '') return 'no wedge chosen'
    return segments.some((segment) => segment.id === id) ? null : `unknown wedge: ${id}`
  },
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/tricks/recipes/takeover.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/tricks/recipes/takeover.ts src/tricks/recipes/takeover.test.ts
git commit -m "feat(tricks): add the takeover recipe"
```

---

### Task 6: The `recolor` and `relabel` recipes

Built together because they are the same shape over two different `morph.ts` sampling paths — `color` is interpolated by `lerpColor`, `label` is step-sampled by `sampleStep`.

**Files:**
- Create: `src/tricks/recipes/recolor.ts`
- Create: `src/tricks/recipes/recolor.test.ts`
- Create: `src/tricks/recipes/relabel.ts`
- Create: `src/tricks/recipes/relabel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tricks/recipes/recolor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { recolor } from './recolor'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 1, color: '#ffd166' },
]

const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }

describe('recolor', () => {
  it('provides no segments', () => {
    expect(recolor.provides({}, 't1')).toEqual([])
  })

  it('starts from the palette fallback when a segment has no color', () => {
    const [morph] = recolor.resolve({ targets: ['ana'], toColor: '#888888' }, ctx)
    expect(morph.keyframes[0]).toEqual({ at: 0, color: '#f4a261' })
  })

  it('starts from an explicit color when the segment has one', () => {
    const [morph] = recolor.resolve({ targets: ['beer'], toColor: '#888888' }, ctx)
    expect(morph.keyframes[0]).toEqual({ at: 0, color: '#ffd166' })
  })

  it('holds the base color until startAt, then shifts', () => {
    const [morph] = recolor.resolve(
      { targets: ['beer'], toColor: '#000000', startAt: 0.4 },
      ctx,
    )
    expect(morph.keyframes).toEqual([
      { at: 0, color: '#ffd166' },
      { at: 0.4, color: '#ffd166' },
      { at: 1, color: '#000000' },
    ])
  })

  it('interpolates rather than stepping', () => {
    const morphs = recolor.resolve(
      { targets: ['beer'], toColor: '#000000', startAt: 0, easing: 'linear' },
      ctx,
    )
    const midway = applyMorphs(segments, morphs, 500)
    const beer = midway.find((segment) => segment.id === 'beer')
    expect(beer?.color).not.toBe('#ffd166')
    expect(beer?.color).not.toBe('#000000')
  })

  it('never touches weight', () => {
    const morphs = recolor.resolve({ targets: [], toColor: '#000000' }, ctx)
    for (const morph of morphs) {
      expect(morph.keyframes.every((k) => k.weight === undefined)).toBe(true)
    }
  })

  it('declares exactly the colors it writes', () => {
    expect(recolor.writes({ targets: ['ana'], toColor: '#000000' }, ctx)).toEqual([
      { segmentId: 'ana', property: 'color' },
    ])
  })

  it('rejects a missing target', () => {
    expect(recolor.validate({ targets: ['ghost'] }, segments)).toMatch(/ghost/)
  })
})
```

Create `src/tricks/recipes/relabel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { relabel } from './relabel'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const ctx: RecipeContext = { trickId: 't1', segments, durationMs: 1000 }

describe('relabel', () => {
  it('provides no segments', () => {
    expect(relabel.provides({}, 't1')).toEqual([])
  })

  it('holds the base label until the switch point', () => {
    const [morph] = relabel.resolve({ targets: ['ana'], toLabel: 'LOSER', at: 0.8 }, ctx)
    expect(morph.keyframes).toEqual([
      { at: 0, label: 'Ana' },
      { at: 0.8, label: 'LOSER' },
    ])
  })

  it('steps rather than blending', () => {
    const morphs = relabel.resolve({ targets: ['ana'], toLabel: 'LOSER', at: 0.8 }, ctx)
    const before = applyMorphs(segments, morphs, 799)
    const after = applyMorphs(segments, morphs, 801)
    expect(before.find((s) => s.id === 'ana')?.label).toBe('Ana')
    expect(after.find((s) => s.id === 'ana')?.label).toBe('LOSER')
  })

  it('never touches weight or color', () => {
    const morphs = relabel.resolve({ targets: [], toLabel: 'X' }, ctx)
    for (const morph of morphs) {
      expect(morph.keyframes.every((k) => k.weight === undefined && k.color === undefined)).toBe(
        true,
      )
    }
  })

  it('declares exactly the labels it writes', () => {
    expect(relabel.writes({ targets: ['ben'], toLabel: 'X' }, ctx)).toEqual([
      { segmentId: 'ben', property: 'label' },
    ])
  })

  it('rejects a missing target', () => {
    expect(relabel.validate({ targets: ['ghost'] }, segments)).toMatch(/ghost/)
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- src/tricks/recipes/recolor.test.ts src/tricks/recipes/relabel.test.ts`
Expected: FAIL — cannot resolve `./recolor` or `./relabel`

- [ ] **Step 3: Write `recolor`**

Create `src/tricks/recipes/recolor.ts`:

```ts
import { effectiveColor } from '../../wheel/palette'
import type { Morph, Segment } from '../../wheel/types'
import { readEasing, readString, readStringArray, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeOut', label: 'Ease out' },
  { value: 'easeInOut', label: 'Ease in-out' },
]

function resolveTargets(params: TrickParams, segments: Segment[]): Segment[] {
  const names = readStringArray(params, 'targets')
  if (names.length === 0) return segments
  return segments.filter((segment) => names.includes(segment.id))
}

export const recolor: Recipe = {
  id: 'recolor',
  name: 'Named wedges change color',
  description: 'The chosen wedges fade to a new color. Weights are untouched.',
  defaults: { targets: [], toColor: '#888888', startAt: 0.5, easing: 'easeInOut' },
  fields: [
    { key: 'targets', label: 'Wedges', kind: 'segments' },
    { key: 'toColor', label: 'Final color', kind: 'color' },
    { key: 'startAt', label: 'Starts at', kind: 'slider', min: 0, max: 1, step: 0.05 },
    { key: 'easing', label: 'Easing', kind: 'select', options: EASING_OPTIONS },
  ],

  provides: () => [],

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const toColor = readString(params, 'toColor', '#888888')
    const startAt = readUnit(params, 'startAt', 0.5)
    const easing = readEasing(params, 'easing')

    return resolveTargets(params, ctx.segments).map((segment) => {
      // An explicit at:0 keyframe is required. `morph.ts` only synthesizes an
      // implicit base when the segment already carries the property, and a lone
      // late keyframe would otherwise apply from the first frame.
      const from = effectiveColor(ctx.segments, segment.id) ?? '#888888'
      return {
        segmentId: segment.id,
        durationMs: ctx.durationMs,
        easing,
        keyframes: [
          { at: 0, color: from },
          { at: startAt, color: from },
          { at: 1, color: toColor },
        ],
      }
    })
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    return resolveTargets(params, ctx.segments).map((segment) => ({
      segmentId: segment.id,
      property: 'color' as const,
    }))
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    const missing = readStringArray(params, 'targets').filter(
      (id) => !segments.some((segment) => segment.id === id),
    )
    return missing.length === 0 ? null : `unknown wedge: ${missing.join(', ')}`
  },
}
```

- [ ] **Step 4: Write `relabel`**

Create `src/tricks/recipes/relabel.ts`:

```ts
import type { Morph, Segment } from '../../wheel/types'
import { readString, readStringArray, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

function resolveTargets(params: TrickParams, segments: Segment[]): Segment[] {
  const names = readStringArray(params, 'targets')
  if (names.length === 0) return segments
  return segments.filter((segment) => names.includes(segment.id))
}

export const relabel: Recipe = {
  id: 'relabel',
  name: 'Named wedges change label',
  description: 'The chosen wedges switch to new text at a chosen moment. The change is a cut, not a fade.',
  defaults: { targets: [], toLabel: 'LOSER', at: 0.8 },
  fields: [
    { key: 'targets', label: 'Wedges', kind: 'segments' },
    { key: 'toLabel', label: 'New label', kind: 'text' },
    { key: 'at', label: 'Switches at', kind: 'slider', min: 0, max: 1, step: 0.05 },
  ],

  provides: () => [],

  resolve(params: TrickParams, ctx: RecipeContext): Morph[] {
    const toLabel = readString(params, 'toLabel', 'LOSER')
    const at = readUnit(params, 'at', 0.8)

    // Labels are step-sampled, so two keyframes are enough: the base holds
    // until `at`, then the new text takes over for the rest of the spin.
    return resolveTargets(params, ctx.segments).map((segment) => ({
      segmentId: segment.id,
      durationMs: ctx.durationMs,
      keyframes: [
        { at: 0, label: segment.label },
        { at, label: toLabel },
      ],
    }))
  },

  writes(params: TrickParams, ctx: RecipeContext): Write[] {
    return resolveTargets(params, ctx.segments).map((segment) => ({
      segmentId: segment.id,
      property: 'label' as const,
    }))
  },

  validate(params: TrickParams, segments: Segment[]): string | null {
    const missing = readStringArray(params, 'targets').filter(
      (id) => !segments.some((segment) => segment.id === id),
    )
    return missing.length === 0 ? null : `unknown wedge: ${missing.join(', ')}`
  },
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test -- src/tricks/recipes/recolor.test.ts src/tricks/recipes/relabel.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 6: Commit**

```bash
git add src/tricks/recipes/recolor.ts src/tricks/recipes/recolor.test.ts src/tricks/recipes/relabel.ts src/tricks/recipes/relabel.test.ts
git commit -m "feat(tricks): add the recolor and relabel recipes"
```

---

### Task 7: The registry and `resolveTricks`

**Files:**
- Create: `src/tricks/registry.ts`
- Create: `src/tricks/resolve.ts`
- Create: `src/tricks/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tricks/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { landingSegments } from '../wheel/morph'
import type { Segment } from '../wheel/types'
import { resolveTricks } from './resolve'
import type { Trick } from './types'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const beerTakeover: Trick = {
  id: 'beer',
  name: 'slow burn',
  recipe: 'takeover',
  params: {
    wedgeMode: 'new',
    wedgeLabel: 'free beer',
    wedgeColor: '#ffd166',
    holdUntil: 0.6,
    endShare: 1,
    easing: 'easeIn',
  },
  enabled: true,
}

const grayEveryone: Trick = {
  id: 'gray',
  name: 'everyone goes gray',
  recipe: 'recolor',
  params: { targets: [], toColor: '#888888', startAt: 0 },
  enabled: true,
}

describe('resolveTricks', () => {
  it('returns the original segments when no tricks are enabled', () => {
    const result = resolveTricks(people, [], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('appends a provided wedge at weight zero', () => {
    const result = resolveTricks(people, [beerTakeover], 1000)
    expect(result.segments.map((s) => s.id)).toEqual(['ana', 'ben', 'beer:wedge'])
    expect(result.segments[2].weight).toBe(0)
  })

  it('makes a provided wedge visible to another trick that resolves after it', () => {
    // The two-pass ordering: recolor targets "everything", and everything must
    // include the wedge the takeover contributes, even though recolor is listed first.
    const result = resolveTricks(people, [grayEveryone, beerTakeover], 1000)
    const recolored = result.morphs.filter((morph) =>
      morph.keyframes.some((k) => k.color !== undefined),
    )
    expect(recolored.map((m) => m.segmentId)).toContain('beer:wedge')
  })

  it('contributes nothing for a disabled trick', () => {
    const result = resolveTricks(people, [{ ...beerTakeover, enabled: false }], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('ignores a trick naming an unknown recipe', () => {
    const bogus = { ...beerTakeover, recipe: 'nonsense' } as unknown as Trick
    const result = resolveTricks(people, [bogus], 1000)
    expect(result.segments).toEqual(people)
    expect(result.morphs).toEqual([])
  })

  it('orders morphs by trick list order, so the lower trick wins', () => {
    const vanishAna: Trick = {
      id: 'v',
      name: 'ana goes',
      recipe: 'vanish',
      params: { targets: ['ana'], startAt: 0 },
      enabled: true,
    }
    const takeoverFirst = resolveTricks(people, [beerTakeover, vanishAna], 1000)
    const vanishFirst = resolveTricks(people, [vanishAna, beerTakeover], 1000)
    const ids = (result: { morphs: { segmentId: string }[] }) =>
      result.morphs.map((morph) => morph.segmentId)
    expect(ids(takeoverFirst).at(-1)).toBe('ana')
    expect(ids(vanishFirst).at(0)).toBe('ana')
  })

  it('leaves exactly one candidate at landing for a full-share takeover', () => {
    const result = resolveTricks(people, [beerTakeover], 1000)
    const landed = landingSegments(result.segments, result.morphs, 1000)
    expect(landed.filter((segment) => segment.weight > 0).map((s) => s.id)).toEqual(['beer:wedge'])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/tricks/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`

- [ ] **Step 3: Write the registry**

Create `src/tricks/registry.ts`:

```ts
import { recolor } from './recipes/recolor'
import { relabel } from './recipes/relabel'
import { takeover } from './recipes/takeover'
import { vanish } from './recipes/vanish'
import type { Recipe, RecipeId } from './types'

export const RECIPES: Record<RecipeId, Recipe> = {
  takeover,
  vanish,
  recolor,
  relabel,
}

export const RECIPE_LIST: Recipe[] = [takeover, vanish, recolor, relabel]

/** Returns null rather than throwing, so stored data can never crash a load. */
export function getRecipe(id: string): Recipe | null {
  return RECIPES[id as RecipeId] ?? null
}
```

- [ ] **Step 4: Write the resolver**

Create `src/tricks/resolve.ts`:

```ts
import type { Morph, Segment } from '../wheel/types'
import { getRecipe } from './registry'
import type { Trick } from './types'

export type ResolvedTricks = {
  segments: Segment[]
  morphs: Morph[]
}

/**
 * Two passes, and the order between them is load-bearing: every provided wedge
 * must exist before any recipe resolves, or a recipe targeting "everything"
 * would miss a wedge contributed by a trick listed after it.
 *
 * Composition is last-write-wins in trick-list order. `applyMorphs` walks the
 * morph array in sequence, and a morph carrying an explicit `at: 0` keyframe
 * overwrites whatever an earlier morph accumulated.
 */
export function resolveTricks(
  segments: Segment[],
  tricks: Trick[],
  durationMs: number,
): ResolvedTricks {
  const active = tricks.filter((trick) => trick.enabled && getRecipe(trick.recipe) !== null)

  // Pass 1: provide.
  const provided: Segment[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (recipe) provided.push(...recipe.provides(trick.params, trick.id))
  }
  const all = [...segments, ...provided]

  // Pass 2: resolve.
  const morphs: Morph[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    morphs.push(
      ...recipe.resolve(trick.params, { trickId: trick.id, segments: all, durationMs }),
    )
  }

  return { segments: all, morphs }
}

/** Which trick, if any, owns a given segment. Derived, never stored. */
export function wedgeOwners(tricks: Trick[]): Map<string, Trick> {
  const owners = new Map<string, Trick>()
  for (const trick of tricks) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    for (const segment of recipe.provides(trick.params, trick.id)) {
      owners.set(segment.id, trick)
    }
  }
  return owners
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/tricks/resolve.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/tricks/registry.ts src/tricks/resolve.ts src/tricks/resolve.test.ts
git commit -m "feat(tricks): add the registry and the two-pass resolver"
```

---

### Task 8: Conflict detection

**Files:**
- Create: `src/tricks/conflicts.ts`
- Create: `src/tricks/conflicts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tricks/conflicts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findConflicts } from './conflicts'
import type { Trick } from './types'
import type { Segment } from '../wheel/types'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
]

const takeoverAll: Trick = {
  id: 'beer',
  name: 'slow burn',
  recipe: 'takeover',
  params: { wedgeMode: 'new', wedgeLabel: 'beer', wedgeColor: '#ffd166', endShare: 1 },
  enabled: true,
}

const vanishAna: Trick = {
  id: 'v',
  name: 'ana goes',
  recipe: 'vanish',
  params: { targets: ['ana'] },
  enabled: true,
}

const grayEveryone: Trick = {
  id: 'gray',
  name: 'gray',
  recipe: 'recolor',
  params: { targets: [], toColor: '#888888' },
  enabled: true,
}

describe('findConflicts', () => {
  it('reports nothing for a single trick', () => {
    expect(findConflicts(people, [takeoverAll], 1000)).toEqual([])
  })

  it('reports nothing when two tricks write different properties', () => {
    expect(findConflicts(people, [takeoverAll, grayEveryone], 1000)).toEqual([])
  })

  it('reports a segment two tricks both write the weight of', () => {
    const conflicts = findConflicts(people, [takeoverAll, vanishAna], 1000)
    expect(conflicts).toEqual([
      { segmentId: 'ana', property: 'weight', trickIds: ['beer', 'v'] },
    ])
  })

  it('ignores disabled tricks', () => {
    const conflicts = findConflicts(people, [takeoverAll, { ...vanishAna, enabled: false }], 1000)
    expect(conflicts).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/tricks/conflicts.test.ts`
Expected: FAIL — cannot resolve `./conflicts`

- [ ] **Step 3: Write the implementation**

Create `src/tricks/conflicts.ts`:

```ts
import type { Segment } from '../wheel/types'
import { getRecipe } from './registry'
import { resolveTricks } from './resolve'
import type { Trick, Write } from './types'

export type Conflict = Write & { trickIds: string[] }

/**
 * Editor-facing only. `resolveTricks` never consults this, so a wrong `writes()`
 * can produce a misleading badge but can never change what the wheel does.
 */
export function findConflicts(
  segments: Segment[],
  tricks: Trick[],
  durationMs: number,
): Conflict[] {
  const all = resolveTricks(segments, tricks, durationMs).segments
  // Keyed by segment, then by property. Nesting two maps avoids building a
  // composite string key, which would break on any id containing the separator.
  const claims = new Map<string, Map<Write['property'], string[]>>()

  for (const trick of tricks) {
    if (!trick.enabled) continue
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    const ctx = { trickId: trick.id, segments: all, durationMs }
    for (const write of recipe.writes(trick.params, ctx)) {
      let byProperty = claims.get(write.segmentId)
      if (!byProperty) {
        byProperty = new Map()
        claims.set(write.segmentId, byProperty)
      }
      const owners = byProperty.get(write.property)
      if (owners) owners.push(trick.id)
      else byProperty.set(write.property, [trick.id])
    }
  }

  const conflicts: Conflict[] = []
  for (const [segmentId, byProperty] of claims) {
    for (const [property, trickIds] of byProperty) {
      if (trickIds.length < 2) continue
      conflicts.push({ segmentId, property, trickIds })
    }
  }
  return conflicts
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/tricks/conflicts.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/tricks/conflicts.ts src/tricks/conflicts.test.ts
git commit -m "feat(tricks): detect overlapping writes between enabled tricks"
```

---

### Task 9: Preset types, defaults, and defensive storage

**Files:**
- Create: `src/preset/types.ts`
- Create: `src/preset/defaults.ts`
- Create: `src/preset/storage.ts`
- Create: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the types and defaults**

Create `src/preset/types.ts`:

```ts
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'

export type SpinSettings = {
  durationMs: number
  fullSpins: number
  /** CSS easing string, handed to the Web Animations API. */
  easing: string
}

export type Preset = {
  version: 1
  name: string
  segments: Segment[]
  tricks: Trick[]
  spin: SpinSettings
}
```

Create `src/preset/defaults.ts`:

```ts
import type { Preset } from './types'

/**
 * The free beer wedge is not here. It belongs to the takeover trick, which
 * contributes it at weight 0 — so the wheel shows five names until the trick
 * grows a sixth wedge out of nothing.
 */
export const DEFAULT_PRESET: Preset = {
  version: 1,
  name: 'standup',
  segments: [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
    { id: 'cal', label: 'Cal', weight: 1 },
    { id: 'dee', label: 'Dee', weight: 1 },
    { id: 'eli', label: 'Eli', weight: 1 },
  ],
  tricks: [
    {
      id: 'beer',
      name: 'slow burn',
      recipe: 'takeover',
      params: {
        wedgeMode: 'new',
        wedgeLabel: 'free beer',
        wedgeColor: '#ffd166',
        wedgeSegmentId: '',
        holdUntil: 0.6,
        endShare: 1,
        endColor: '#ff8811',
        easing: 'easeIn',
      },
      enabled: false,
    },
  ],
  spin: {
    durationMs: 4500,
    fullSpins: 6,
    easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
  },
}
```

- [ ] **Step 2: Write the failing storage test**

Create `src/preset/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PRESET } from './defaults'
import { PRESET_KEY, loadPreset, parsePreset, savePreset } from './storage'

describe('parsePreset', () => {
  it('returns the default for null', () => {
    expect(parsePreset(null)).toEqual(DEFAULT_PRESET)
  })

  it('returns the default for malformed JSON', () => {
    expect(parsePreset('{not json')).toEqual(DEFAULT_PRESET)
  })

  it('returns the default for a wrong version', () => {
    expect(parsePreset(JSON.stringify({ version: 99 }))).toEqual(DEFAULT_PRESET)
  })

  it('round-trips a valid preset', () => {
    const parsed = parsePreset(JSON.stringify(DEFAULT_PRESET))
    expect(parsed).toEqual(DEFAULT_PRESET)
  })

  it('disables a trick naming an unknown recipe rather than throwing', () => {
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [{ id: 'x', name: 'x', recipe: 'nonsense', params: {}, enabled: true }],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(false)
  })

  it('disables a trick whose target segment is gone rather than throwing', () => {
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [
        { id: 'v', name: 'v', recipe: 'vanish', params: { targets: ['ghost'] }, enabled: true },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(false)
  })

  it('drops a segment with a non-finite weight to zero', () => {
    const raw = {
      ...DEFAULT_PRESET,
      segments: [{ id: 'a', label: 'A', weight: Number.NaN }],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.segments[0].weight).toBe(0)
  })
})

describe('loadPreset and savePreset', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns the default when storage is empty', () => {
    expect(loadPreset()).toEqual(DEFAULT_PRESET)
  })

  it('round-trips through localStorage', () => {
    const edited = { ...DEFAULT_PRESET, name: 'punishment' }
    savePreset(edited)
    expect(window.localStorage.getItem(PRESET_KEY)).toBeTruthy()
    expect(loadPreset()).toEqual(edited)
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- src/preset/storage.test.ts`
Expected: FAIL — cannot resolve `./storage`

- [ ] **Step 4: Write the implementation**

Create `src/preset/storage.ts`:

```ts
import { getRecipe } from '../tricks/registry'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { DEFAULT_PRESET } from './defaults'
import type { Preset } from './types'

export const PRESET_KEY = 'wod.preset.current'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return []
  const segments: Segment[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string') continue
    const weight = typeof entry.weight === 'number' && Number.isFinite(entry.weight)
      ? Math.max(0, entry.weight)
      : 0
    const segment: Segment = { id: entry.id, label: entry.label, weight }
    if (typeof entry.color === 'string') segment.color = entry.color
    segments.push(segment)
  }
  return segments
}

/**
 * A stored trick that cannot run is disabled, never dropped and never thrown on.
 * The parent spec's rule is that the wheel never breaks the bit, and losing a
 * trick silently would be worse than showing it switched off.
 */
function readTricks(value: unknown, segments: Segment[]): Trick[] {
  if (!Array.isArray(value)) return []
  const tricks: Trick[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== 'string' || typeof entry.recipe !== 'string') continue

    const recipe = getRecipe(entry.recipe)
    const params = isRecord(entry.params) ? entry.params : {}
    const runnable = recipe !== null && recipe.validate(params, segments) === null

    tricks.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : entry.id,
      recipe: entry.recipe as Trick['recipe'],
      params,
      enabled: runnable && entry.enabled === true,
    })
  }
  return tricks
}

export function parsePreset(raw: string | null): Preset {
  if (raw === null) return DEFAULT_PRESET

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PRESET
  }

  if (!isRecord(data) || data.version !== 1) return DEFAULT_PRESET

  const segments = readSegments(data.segments)
  const spin = isRecord(data.spin) ? data.spin : {}

  return {
    version: 1,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    tricks: readTricks(data.tricks, segments),
    spin: {
      durationMs:
        typeof spin.durationMs === 'number' && Number.isFinite(spin.durationMs)
          ? spin.durationMs
          : DEFAULT_PRESET.spin.durationMs,
      fullSpins:
        typeof spin.fullSpins === 'number' && Number.isFinite(spin.fullSpins)
          ? spin.fullSpins
          : DEFAULT_PRESET.spin.fullSpins,
      easing: typeof spin.easing === 'string' ? spin.easing : DEFAULT_PRESET.spin.easing,
    },
  }
}

export function loadPreset(): Preset {
  try {
    return parsePreset(window.localStorage.getItem(PRESET_KEY))
  } catch {
    return DEFAULT_PRESET
  }
}

export function savePreset(preset: Preset): void {
  try {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(preset))
  } catch {
    // Quota or a private-mode restriction. Editing keeps working in memory.
  }
}

/** Fires when another window writes the preset, so an open show page follows along. */
export function subscribePreset(onChange: (preset: Preset) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PRESET_KEY) return
    onChange(parsePreset(event.newValue))
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/preset/storage.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 6: Commit**

```bash
git add src/preset/
git commit -m "feat(preset): persist segments and tricks with defensive loading"
```

---

### Task 10: The show page reads the preset

This is where the free beer wedge reaches zero width, and where the hardcoded `SEGMENTS` and `BEER_TAKEOVER` arrays are deleted.

**Files:**
- Modify: `src/App.tsx` (full rewrite)
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { DEFAULT_PRESET } from './preset/defaults'
import { PRESET_KEY } from './preset/storage'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders one label per preset segment', () => {
    render(<App />)
    for (const segment of DEFAULT_PRESET.segments) {
      expect(screen.getByText(segment.label)).toBeInTheDocument()
    }
  })

  it('does not show the trick-owned wedge while its trick is disabled', () => {
    render(<App />)
    expect(screen.queryByText('free beer')).not.toBeInTheDocument()
  })

  it('shows the wedge at zero width once its trick is enabled', () => {
    const enabled = {
      ...DEFAULT_PRESET,
      tricks: DEFAULT_PRESET.tricks.map((trick) => ({ ...trick, enabled: true })),
    }
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(enabled))
    render(<App />)
    // Present in the segment set but zero-width, so the wheel draws no label.
    expect(screen.queryByText('free beer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — `App` still renders hardcoded segments and has no preset wiring

- [ ] **Step 3: Rewrite `App.tsx`**

Replace `src/App.tsx` entirely:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Preset } from './preset/types'
import { loadPreset, subscribePreset } from './preset/storage'
import { resolveTricks } from './tricks/resolve'
import { Wheel } from './wheel/Wheel'
import type { SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

export function App() {
  const [preset, setPreset] = useState<Preset>(loadPreset)

  // An edit in the /edit window lands here without a reload.
  useEffect(() => subscribePreset(setPreset), [])

  const resolved = useMemo(
    () => resolveTricks(preset.segments, preset.tricks, preset.spin.durationMs),
    [preset],
  )

  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.durationMs,
      fullSpins: preset.spin.fullSpins,
      easing: preset.spin.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, winnerId, spin, rotorRef } = useSpin(
    resolved.segments,
    config,
  )
  const winner = displaySegments.find((segment) => segment.id === winnerId)

  return (
    <main className="app">
      <Wheel segments={displaySegments} rotorRef={rotorRef} />
      <div className="app__controls">
        <button className="app__button" type="button" onClick={() => spin()} disabled={isSpinning}>
          Spin
        </button>
        <a className="app__button" href="#/edit">
          Edit
        </a>
      </div>
      <p className="app__result">{winner ? winner.label : ''}</p>
    </main>
  )
}
```

- [ ] **Step 4: Style the anchor to match the button**

Append to `src/App.css`:

```css
.app__button {
  display: inline-block;
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS — including the pre-existing wheel suite

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/App.css
git commit -m "feat(app): drive the wheel from the stored preset

The free beer wedge is now contributed by the takeover trick at weight 0
instead of sitting on the wheel as a 0.02 sliver, so it does not exist
until the trick grows it."
```

---

### Task 11: Editor shell

**Files:**
- Modify: `src/editor/Editor.tsx`
- Create: `src/editor/Editor.css`
- Create: `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/editor/Editor.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Editor } from './Editor'

describe('Editor', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the three columns', () => {
    render(<Editor />)
    expect(screen.getByRole('heading', { name: /segments/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /tricks/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'wheel' })).toBeInTheDocument()
  })

  it('offers a way back to the show page', () => {
    render(<Editor />)
    expect(screen.getByRole('link', { name: /show/i })).toHaveAttribute('href', '#/')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/editor/Editor.test.tsx`
Expected: FAIL — the stub renders only the text "editor"

- [ ] **Step 3: Write the shell**

Replace `src/editor/Editor.tsx`:

```tsx
import { LabShell } from '@weasel-js/labkit'
import { useMemo, useState } from 'react'
import { loadPreset } from '../preset/storage'
import type { Preset } from '../preset/types'
import { resolveTricks } from '../tricks/resolve'
import { Wheel } from '../wheel/Wheel'
import './Editor.css'

export function Editor() {
  const [preset] = useState<Preset>(loadPreset)

  const resolved = useMemo(
    () => resolveTricks(preset.segments, preset.tricks, preset.spin.durationMs),
    [preset],
  )

  return (
    <LabShell title="wod editor" header={<a href="#/">Show page</a>}>
      <div className="editor">
        <section className="editor__column editor__column--left">
          <h2>Segments</h2>
        </section>
        <section className="editor__column editor__column--center">
          <Wheel segments={resolved.segments} />
        </section>
        <section className="editor__column editor__column--right">
          <h2>Tricks</h2>
        </section>
      </div>
    </LabShell>
  )
}
```

**Important:** `tsconfig.json` sets `noUnusedLocals: true`, so `npm run build`
fails on any declared-but-unused binding. Do **not** pre-declare state here for
later tasks — each of Tasks 12, 13, 14, and 16 adds exactly the state it uses.

- [ ] **Step 4: Write the stylesheet**

Create `src/editor/Editor.css`:

```css
.editor {
  display: grid;
  grid-template-columns: minmax(14rem, 20rem) 1fr minmax(16rem, 24rem);
  gap: 1rem;
  align-items: start;
  padding: 1rem;
}

.editor__column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.editor__column--center {
  align-items: center;
}

@media (max-width: 60rem) {
  .editor {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/editor/Editor.test.tsx`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add src/editor/
git commit -m "feat(editor): add the three-column LabShell scaffold"
```

---

### Task 12: Segment list

**Files:**
- Create: `src/editor/SegmentList.tsx`
- Create: `src/editor/SegmentList.test.tsx`
- Modify: `src/editor/Editor.tsx`
- Modify: `src/editor/Editor.css`

- [ ] **Step 1: Write the failing test**

Create `src/editor/SegmentList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { SegmentList } from './SegmentList'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 2 },
]

const beerTrick: Trick = {
  id: 'beer',
  name: 'slow burn',
  recipe: 'takeover',
  params: { wedgeMode: 'new', wedgeLabel: 'free beer', wedgeColor: '#ffd166' },
  enabled: true,
}

describe('SegmentList', () => {
  it('renders a row per editable segment', () => {
    render(<SegmentList segments={segments} tricks={[]} selectedTrickId={null} onChange={vi.fn()} onSelectTrick={vi.fn()} />)
    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Ben')).toBeInTheDocument()
  })

  it('adds a segment', async () => {
    const onChange = vi.fn()
    render(<SegmentList segments={segments} tricks={[]} selectedTrickId={null} onChange={onChange} onSelectTrick={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add segment/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: 'New' })]),
    )
    expect(onChange.mock.calls[0][0]).toHaveLength(3)
  })

  it('deletes a segment', async () => {
    const onChange = vi.fn()
    render(<SegmentList segments={segments} tricks={[]} selectedTrickId={null} onChange={onChange} onSelectTrick={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /delete ana/i }))
    expect(onChange).toHaveBeenCalledWith([segments[1]])
  })

  it('renames a segment', async () => {
    const onChange = vi.fn()
    render(<SegmentList segments={segments} tricks={[]} selectedTrickId={null} onChange={onChange} onSelectTrick={vi.fn()} />)
    const input = screen.getByDisplayValue('Ana')
    await userEvent.clear(input)
    await userEvent.type(input, 'Z')
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)?.[0] as Segment[]
    expect(last[0].label).toBe('Z')
  })

  it('changes a weight', async () => {
    const onChange = vi.fn()
    render(<SegmentList segments={segments} tricks={[]} selectedTrickId={null} onChange={onChange} onSelectTrick={vi.fn()} />)
    const slider = screen.getByLabelText(/weight of ana/i)
    await userEvent.clear(slider)
    await userEvent.type(slider, '5')
    const last = onChange.mock.calls.at(-1)?.[0] as Segment[]
    expect(last[0].weight).toBe(5)
  })

  it('shows a trick-owned wedge as a non-deletable ghost row', () => {
    render(
      <SegmentList
        segments={segments}
        tricks={[beerTrick]}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(screen.getByText('free beer')).toBeInTheDocument()
    expect(screen.getByText(/slow burn/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete free beer/i })).not.toBeInTheDocument()
  })

  it('marks the ghost row of the trick under edit', () => {
    const { container } = render(
      <SegmentList
        segments={segments}
        tricks={[beerTrick]}
        selectedTrickId="beer"
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(container.querySelector('.segment-list__row--active')).not.toBeNull()
  })

  it('selects the owning trick when a ghost row is clicked', async () => {
    const onSelectTrick = vi.fn()
    render(
      <SegmentList
        segments={segments}
        tricks={[beerTrick]}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={onSelectTrick}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /owned by slow burn/i }))
    expect(onSelectTrick).toHaveBeenCalledWith('beer')
  })
})
```

- [ ] **Step 2: Install the interaction library and run the test**

```bash
npm install --save-dev @testing-library/user-event@^14.5.2
```

Run: `npm test -- src/editor/SegmentList.test.tsx`
Expected: FAIL — cannot resolve `./SegmentList`

- [ ] **Step 3: Write the implementation**

Uses labkit's `PropertyPanel` as the container. The dense per-segment row is
hand-rolled: labkit's `*Row` components render one labeled control per row,
which is right for a param form and wrong for a four-column grid of twenty
people. `Button` comes from the weasel-ui passthrough.

Create `src/editor/SegmentList.tsx`:

```tsx
import { Button } from '@weasel-js/labkit/weasel-ui'
import { PropertyPanel } from '@weasel-js/labkit'
import { wedgeOwners } from '../tricks/resolve'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'

export type SegmentListProps = {
  segments: Segment[]
  tricks: Trick[]
  /** Highlights the ghost row belonging to the trick under edit. */
  selectedTrickId: string | null
  onChange: (segments: Segment[]) => void
  onSelectTrick: (trickId: string) => void
}

function nextId(segments: Segment[]): string {
  let n = segments.length + 1
  while (segments.some((segment) => segment.id === `seg${n}`)) n += 1
  return `seg${n}`
}

export function SegmentList({
  segments,
  tricks,
  selectedTrickId,
  onChange,
  onSelectTrick,
}: SegmentListProps) {
  const owners = wedgeOwners(tricks.filter((trick) => trick.enabled))

  const replace = (index: number, patch: Partial<Segment>) => {
    onChange(segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)))
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= segments.length) return
    const next = [...segments]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <PropertyPanel title="Segments" className="segment-list">
      <ul className="segment-list__rows">
        {segments.map((segment, index) => (
          <li className="segment-list__row" key={segment.id}>
            <input
              className="segment-list__label"
              aria-label={`Label of ${segment.label}`}
              value={segment.label}
              onChange={(event) => replace(index, { label: event.target.value })}
            />
            <input
              className="segment-list__weight"
              type="number"
              min={0}
              step={0.1}
              aria-label={`Weight of ${segment.label}`}
              value={segment.weight}
              onChange={(event) => {
                const weight = Number.parseFloat(event.target.value)
                replace(index, { weight: Number.isFinite(weight) ? Math.max(0, weight) : 0 })
              }}
            />
            <input
              className="segment-list__color"
              type="color"
              aria-label={`Color of ${segment.label}`}
              value={segment.color ?? '#888888'}
              onChange={(event) => replace(index, { color: event.target.value })}
            />
            <button
              type="button"
              aria-label={`Move ${segment.label} down`}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              className="segment-list__delete"
              type="button"
              aria-label={`Delete ${segment.label}`}
              onClick={() => onChange(segments.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}

        {[...owners.entries()].map(([segmentId, trick]) => (
          <li
            className={`segment-list__row segment-list__row--ghost${
              trick.id === selectedTrickId ? ' segment-list__row--active' : ''
            }`}
            key={segmentId}
          >
            <button
              className="segment-list__ghost-button"
              type="button"
              aria-label={`Owned by ${trick.name}`}
              onClick={() => onSelectTrick(trick.id)}
            >
              <span className="segment-list__label-text">
                {String(trick.params.wedgeLabel ?? segmentId)}
              </span>
              <span className="segment-list__owner">↳ {trick.name}</span>
            </button>
            <span className="segment-list__weight-readout">0</span>
          </li>
        ))}
      </ul>

      <Button
        onPress={() => onChange([...segments, { id: nextId(segments), label: 'New', weight: 1 }])}
      >
        + Add segment
      </Button>
    </PropertyPanel>
  )
}
```

**Note on `Button`:** weasel-ui builds on `react-aria-components`, so its click
handler is `onPress`, not `onClick`. If the button does not fire in tests, that
is the reason.

- [ ] **Step 4: Add the styles**

Append to `src/editor/Editor.css`:

```css
.segment-list__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.segment-list__row {
  display: grid;
  grid-template-columns: 1fr 4.5rem 2rem 1.75rem;
  gap: 0.35rem;
  align-items: center;
}

.segment-list__row--ghost {
  grid-template-columns: 1fr 4.5rem;
  opacity: 0.55;
}

.segment-list__ghost-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  background: none;
  border: 0;
  padding: 0.2rem 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.segment-list__owner {
  font-size: 0.8em;
  opacity: 0.8;
}

.segment-list__weight-readout {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.segment-list__row--active {
  opacity: 1;
  outline: 2px solid currentColor;
  border-radius: 0.3rem;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/editor/SegmentList.test.tsx`
Expected: PASS, 8 tests

- [ ] **Step 6: Wire it into the shell**

In `src/editor/Editor.tsx`, add the imports:

```tsx
import { useCallback } from 'react'
import { savePreset } from '../preset/storage'
import { SegmentList } from './SegmentList'
```

Give the preset a setter and add the persisting updater plus the trick
selection state, replacing the `const [preset] = useState(...)` line:

```tsx
  const [preset, setPreset] = useState<Preset>(loadPreset)
  const [selectedTrickId, setSelectedTrickId] = useState<string | null>(null)

  // Every edit persists immediately; an open show window picks it up through
  // the storage event, so there is nothing to "apply".
  const update = useCallback((next: Preset) => {
    setPreset(next)
    savePreset(next)
  }, [])
```

and replace the left column's contents. Drop the `<h2>` from Task 11 —
`PropertyPanel` renders its own `<h2>` from the `title` prop, so keeping both
would produce two headings:

```tsx
<section className="editor__column editor__column--left">
  <SegmentList
    segments={preset.segments}
    tricks={preset.tricks}
    selectedTrickId={selectedTrickId}
    onChange={(segments) => update({ ...preset, segments })}
    onSelectTrick={setSelectedTrickId}
  />
</section>
```

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/editor/ package.json package-lock.json
git commit -m "feat(editor): add the segment list with trick-owned ghost rows"
```

---

### Task 13: Trick library and generated param forms

**Files:**
- Create: `src/editor/RecipeForm.tsx`
- Create: `src/editor/RecipeForm.test.tsx`
- Create: `src/editor/TrickLibrary.tsx`
- Create: `src/editor/TrickLibrary.test.tsx`
- Modify: `src/editor/Editor.tsx`

- [ ] **Step 1: Write the failing form test**

Create `src/editor/RecipeForm.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { takeover } from '../tricks/recipes/takeover'
import type { Segment } from '../wheel/types'
import { RecipeForm } from './RecipeForm'

const segments: Segment[] = [{ id: 'ana', label: 'Ana', weight: 1 }]

describe('RecipeForm', () => {
  it('renders a control per recipe field', () => {
    render(
      <RecipeForm
        recipe={takeover}
        params={takeover.defaults}
        segments={segments}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Wedge label')).toBeInTheDocument()
    expect(screen.getByLabelText('Holds until')).toBeInTheDocument()
    expect(screen.getByLabelText('Final share')).toBeInTheDocument()
  })

  it('reports a text change', async () => {
    const onChange = vi.fn()
    render(
      <RecipeForm
        recipe={takeover}
        params={takeover.defaults}
        segments={segments}
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('Wedge label')
    await userEvent.clear(input)
    await userEvent.type(input, 'X')
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ wedgeLabel: 'X' })
  })

  it('reports a slider change as a number', () => {
    const onChange = vi.fn()
    render(
      <RecipeForm
        recipe={takeover}
        params={takeover.defaults}
        segments={segments}
        onChange={onChange}
      />,
    )
    // A range input cannot be typed into; set the value and fire the change.
    fireEvent.change(screen.getByLabelText('Final share'), { target: { value: '0.5' } })
    expect(onChange.mock.calls.at(-1)?.[0].endShare).toBe(0.5)
  })

  it('lists the current segments in a segments field', () => {
    render(
      <RecipeForm
        recipe={takeover}
        params={takeover.defaults}
        segments={segments}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/editor/RecipeForm.test.tsx`
Expected: FAIL — cannot resolve `./RecipeForm`

- [ ] **Step 3: Write the form**

This is where `RecipeField` pays off: each variant maps to one labkit row.
Only `segments` has no labkit equivalent, so it renders a native multi-select
inside a `PropertyRow` to keep the label wiring and styling consistent.

Create `src/editor/RecipeForm.tsx`:

```tsx
import {
  CheckboxRow,
  ColorRow,
  NumberRow,
  PropertyList,
  PropertyRow,
  SelectRow,
  SliderRow,
  TextRow,
} from '@weasel-js/labkit'
import type { Recipe, RecipeField, TrickParams } from '../tricks/types'
import type { Segment } from '../wheel/types'

export type RecipeFormProps = {
  recipe: Recipe
  params: TrickParams
  segments: Segment[]
  onChange: (params: TrickParams) => void
}

export function RecipeForm({ recipe, params, segments, onChange }: RecipeFormProps) {
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value })

  const row = (field: RecipeField) => {
    const value = params[field.key]

    switch (field.kind) {
      case 'slider':
        return (
          <SliderRow
            key={field.key}
            label={field.label}
            min={field.min}
            max={field.max}
            step={field.step}
            value={typeof value === 'number' ? value : field.min}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'number':
        return (
          <NumberRow
            key={field.key}
            label={field.label}
            min={field.min}
            max={field.max}
            value={typeof value === 'number' ? value : 0}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'color':
        return (
          <ColorRow
            key={field.key}
            label={field.label}
            value={typeof value === 'string' && value !== '' ? value : '#888888'}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'text':
        return (
          <TextRow
            key={field.key}
            label={field.label}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'toggle':
        return (
          <CheckboxRow
            key={field.key}
            label={field.label}
            value={value === true}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'select':
        return (
          <SelectRow
            key={field.key}
            label={field.label}
            options={field.options}
            value={typeof value === 'string' ? value : (field.options[0]?.value ?? '')}
            onChange={(next) => set(field.key, next)}
          />
        )
      case 'segments':
        // No labkit multi-select exists. PropertyRow still provides the label
        // association and the panel's row styling.
        return (
          <PropertyRow key={field.key} label={field.label}>
            <select
              multiple
              value={Array.isArray(value) ? (value as string[]) : []}
              onChange={(event) =>
                set(
                  field.key,
                  [...event.target.selectedOptions].map((option) => option.value),
                )
              }
            >
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.label}
                </option>
              ))}
            </select>
          </PropertyRow>
        )
    }
  }

  return <PropertyList pack="pairs">{recipe.fields.map(row)}</PropertyList>
}
```

**Note:** labkit's rows wrap their control in a `<label>`, so
`screen.getByLabelText('Wedge label')` resolves without any `htmlFor` wiring.
`SliderRow` renders an `<input type="range">`, so a test that types `'0.5'` into
it must set `.value` directly rather than using `userEvent.type`.

- [ ] **Step 4: Run the form test and verify it passes**

Run: `npm test -- src/editor/RecipeForm.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Write the failing library test**

Create `src/editor/TrickLibrary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Conflict } from '../tricks/conflicts'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { TrickLibrary, reorder } from './TrickLibrary'

const segments: Segment[] = [{ id: 'ana', label: 'Ana', weight: 1 }]

const tricks: Trick[] = [
  {
    id: 'beer',
    name: 'slow burn',
    recipe: 'takeover',
    params: { wedgeMode: 'new', wedgeLabel: 'free beer', endShare: 1 },
    enabled: true,
  },
  { id: 'v', name: 'ana goes', recipe: 'vanish', params: { targets: ['ana'] }, enabled: false },
]

function renderLibrary(overrides: Partial<Parameters<typeof TrickLibrary>[0]> = {}) {
  const props = {
    tricks,
    segments,
    conflicts: [] as Conflict[],
    selectedId: 'beer',
    onChange: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  }
  render(<TrickLibrary {...props} />)
  return props
}

describe('TrickLibrary', () => {
  it('lists every trick by its operator name', () => {
    renderLibrary()
    expect(screen.getByText('slow burn')).toBeInTheDocument()
    expect(screen.getByText('ana goes')).toBeInTheDocument()
  })

  it('shows the structural recipe name alongside it', () => {
    renderLibrary()
    expect(screen.getByText(/One wedge swallows the wheel/)).toBeInTheDocument()
  })

  it('toggles a trick', async () => {
    const props = renderLibrary()
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
    expect(props.onChange).toHaveBeenCalledWith([
      { ...tricks[0], enabled: false },
      tricks[1],
    ])
  })

  it('adds a trick from the recipe catalog', async () => {
    const props = renderLibrary()
    await userEvent.selectOptions(screen.getByLabelText(/add a trick/i), 'relabel')
    const next = props.onChange.mock.calls.at(-1)?.[0] as Trick[]
    expect(next).toHaveLength(3)
    expect(next[2].recipe).toBe('relabel')
  })

  it('deletes a trick', async () => {
    const props = renderLibrary()
    // EffectCard labels every remove button "Remove"; the first card is beer.
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(props.onChange).toHaveBeenCalledWith([tricks[1]])
  })

  it('renders the param form only for the expanded trick', () => {
    // EffectCard renders its body only when expanded, and defaultExpandedIds
    // comes from selectedId — so the unselected trick's fields stay unmounted.
    renderLibrary({ selectedId: 'beer' })
    expect(screen.getByLabelText('Wedge label')).toBeInTheDocument()
    expect(screen.queryByLabelText('New label')).not.toBeInTheDocument()
  })

  it('badges a trick that shares a write with another', () => {
    renderLibrary({
      conflicts: [{ segmentId: 'ana', property: 'weight', trickIds: ['beer', 'v'] }],
    })
    expect(screen.getByRole('status', { name: /slow burn conflicts/i })).toHaveTextContent('ana')
  })
})

describe('reorder', () => {
  it('moves a trick after another', () => {
    expect(reorder(tricks, 'beer', 'v', 'after').map((trick) => trick.id)).toEqual(['v', 'beer'])
  })

  it('moves a trick before another', () => {
    expect(reorder(tricks, 'v', 'beer', 'before').map((trick) => trick.id)).toEqual(['v', 'beer'])
  })

  it('leaves the list alone when the source is unknown', () => {
    expect(reorder(tricks, 'ghost', 'v', 'after')).toEqual(tricks)
  })
})
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `npm test -- src/editor/TrickLibrary.test.tsx`
Expected: FAIL — cannot resolve `./TrickLibrary`

- [ ] **Step 7: Write the library**

Built on labkit's `EffectCardList` + `EffectCard`, which supply drag reorder,
expand/collapse, and remove. `EffectCardList` owns drag state and hands each
card a `cardProps` bundle — spread it, do not reconstruct it. Reordering
arrives as `(sourceId, targetId, position)`, which matters because trick order
*is* the conflict resolution mechanism.

Create `src/editor/TrickLibrary.tsx`:

```tsx
import { EffectCard, EffectCardList, PropertyPanel } from '@weasel-js/labkit'
import type { Conflict } from '../tricks/conflicts'
import { RECIPE_LIST, getRecipe } from '../tricks/registry'
import type { RecipeId, Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { RecipeForm } from './RecipeForm'

export type TrickLibraryProps = {
  tricks: Trick[]
  segments: Segment[]
  conflicts: Conflict[]
  selectedId: string | null
  onChange: (tricks: Trick[]) => void
  onSelect: (trickId: string) => void
}

function newTrickId(tricks: Trick[], recipe: RecipeId): string {
  let n = 1
  while (tricks.some((trick) => trick.id === `${recipe}${n}`)) n += 1
  return `${recipe}${n}`
}

/** Order is the conflict resolution mechanism, so reordering is a real edit. */
export function reorder(
  tricks: Trick[],
  sourceId: string | number,
  targetId: string | number,
  position: 'before' | 'after',
): Trick[] {
  const from = tricks.findIndex((trick) => trick.id === sourceId)
  const moved = tricks[from]
  if (!moved) return tricks
  const without = tricks.filter((_, i) => i !== from)
  const at = without.findIndex((trick) => trick.id === targetId)
  if (at === -1) return tricks
  const insertAt = position === 'before' ? at : at + 1
  return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)]
}

export function TrickLibrary({
  tricks,
  segments,
  conflicts,
  selectedId,
  onChange,
  onSelect,
}: TrickLibraryProps) {
  const replace = (id: string, patch: Partial<Trick>) =>
    onChange(tricks.map((trick) => (trick.id === id ? { ...trick, ...patch } : trick)))

  return (
    <PropertyPanel title="Tricks" className="trick-library">
      <EffectCardList
        items={tricks}
        defaultExpandedIds={selectedId ? [selectedId] : []}
        empty={<p>No tricks yet.</p>}
        onReorder={(sourceId, targetId, position) =>
          onChange(reorder(tricks, sourceId, targetId, position))
        }
        renderItem={(trick, { cardProps }) => {
          const recipe = getRecipe(trick.recipe)
          const own = conflicts.filter((conflict) => conflict.trickIds.includes(trick.id))

          return (
            <EffectCard
              {...cardProps}
              accent={own.length > 0 ? '#e76f51' : undefined}
              onRemove={() => onChange(tricks.filter((other) => other.id !== trick.id))}
              title={
                <button
                  className="trick-card__title"
                  type="button"
                  onClick={() => onSelect(trick.id)}
                >
                  <span className="trick-card__name">{trick.name}</span>
                  <span className="trick-card__recipe">{recipe?.name ?? trick.recipe}</span>
                </button>
              }
              primary={
                <label className="trick-card__enable">
                  <input
                    type="checkbox"
                    aria-label={`Enable ${trick.name}`}
                    checked={trick.enabled}
                    onChange={(event) => replace(trick.id, { enabled: event.target.checked })}
                  />
                </label>
              }
            >
              {own.length > 0 && (
                <p
                  className="trick-card__conflict"
                  role="status"
                  aria-label={`${trick.name} conflicts`}
                >
                  ⚠ also written by another trick: {own.map((c) => c.segmentId).join(', ')}
                </p>
              )}
              {recipe && (
                <>
                  <label className="trick-card__rename">
                    <span>Name</span>
                    <input
                      aria-label={`Rename ${trick.name}`}
                      value={trick.name}
                      onChange={(event) => replace(trick.id, { name: event.target.value })}
                    />
                  </label>
                  <RecipeForm
                    recipe={recipe}
                    params={trick.params}
                    segments={segments}
                    onChange={(params) => replace(trick.id, { params })}
                  />
                </>
              )}
            </EffectCard>
          )
        }}
      />

      <label className="trick-library__add">
        <span>Add a trick</span>
        <select
          value=""
          onChange={(event) => {
            const recipe = getRecipe(event.target.value)
            if (!recipe) return
            const id = newTrickId(tricks, recipe.id)
            onChange([
              ...tricks,
              {
                id,
                name: recipe.name,
                recipe: recipe.id,
                params: { ...recipe.defaults },
                enabled: false,
              },
            ])
            onSelect(id)
          }}
        >
          <option value="">Choose a recipe…</option>
          {RECIPE_LIST.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name}
            </option>
          ))}
        </select>
      </label>
    </PropertyPanel>
  )
}
```

**Two things about `EffectCard` that will otherwise cost time:**

- Its body renders **only when expanded**, so an unselected trick's param
  fields are not in the DOM at all. `defaultExpandedIds` is what puts the
  selected trick's form on screen.
- Its remove button is labeled `"Remove"` for every card, not per item. Tests
  must use `getAllByRole('button', { name: 'Remove' })[n]`.

- [ ] **Step 8: Add the styles**

Append to `src/editor/Editor.css`:

```css
.trick-library__cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.trick-card {
  border: 1px solid currentColor;
  border-radius: 0.4rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.trick-card--selected {
  outline: 2px solid currentColor;
}

.trick-card__head {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 0.35rem;
  align-items: center;
}

.trick-card__title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.trick-card__recipe {
  font-size: 0.8em;
  opacity: 0.75;
}

.trick-card__conflict {
  margin: 0;
  font-size: 0.85em;
}

.recipe-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.recipe-form__row {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: 0.4rem;
  align-items: center;
}
```

- [ ] **Step 9: Run the test and verify it passes**

Run: `npm test -- src/editor/TrickLibrary.test.tsx`
Expected: PASS, 8 tests

- [ ] **Step 10: Wire it into the shell**

In `src/editor/Editor.tsx`, add the import:

```tsx
import { TrickLibrary } from './TrickLibrary'
```

and replace the right column's contents, dropping the Task 11 `<h2>` for the
same reason as the left column:

```tsx
<section className="editor__column editor__column--right">
  <TrickLibrary
    tricks={preset.tricks}
    segments={resolved.segments}
    conflicts={conflicts}
    selectedId={selectedTrickId}
    onChange={(tricks) => update({ ...preset, tricks })}
    onSelect={setSelectedTrickId}
  />
</section>
```

- [ ] **Step 11: Run the full suite**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds

- [ ] **Step 12: Commit**

```bash
git add src/editor/
git commit -m "feat(editor): add the trick library and generated param forms"
```

---

### Task 14: Scrub and play transport

**Files:**
- Create: `src/editor/Transport.tsx`
- Create: `src/editor/Transport.test.tsx`
- Modify: `src/editor/Editor.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/editor/Transport.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { applyMorphs } from '../wheel/morph'
import type { Morph, Segment } from '../wheel/types'
import { Transport } from './Transport'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0 },
]

const morphs: Morph[] = [
  {
    segmentId: 'beer',
    durationMs: 1000,
    keyframes: [
      { at: 0, weight: 0 },
      { at: 1, weight: 4 },
    ],
  },
]

describe('Transport', () => {
  it('starts parked at zero', () => {
    render(
      <Transport segments={segments} morphs={morphs} durationMs={1000} onSpin={vi.fn()} isSpinning={false} />,
    )
    expect(screen.getByLabelText(/scrub/i)).toHaveValue('0')
  })

  it('reports the scrubbed segments to its child', () => {
    const scrubbed: Segment[][] = []
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        isSpinning={false}
        onScrub={(next) => scrubbed.push(next)}
      />,
    )
    // A range input cannot be typed into; set the value and fire the change.
    fireEvent.change(screen.getByLabelText(/scrub/i), { target: { value: '0.5' } })
    expect(scrubbed.at(-1)).toEqual(applyMorphs(segments, morphs, 500))
  })

  it('maps t to applyMorphs at t times the duration', () => {
    // The invariant the scrubber exists to preserve: preview geometry is the
    // same function a real spin uses, sampled at a fixed instant.
    expect(applyMorphs(segments, morphs, 0.25 * 1000).find((s) => s.id === 'beer')?.weight).toBe(1)
  })

  it('triggers a spin', async () => {
    const onSpin = vi.fn()
    render(
      <Transport segments={segments} morphs={morphs} durationMs={1000} onSpin={onSpin} isSpinning={false} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /spin/i }))
    expect(onSpin).toHaveBeenCalled()
  })

  it('disables the scrubber while a spin is running', () => {
    render(
      <Transport segments={segments} morphs={morphs} durationMs={1000} onSpin={vi.fn()} isSpinning />,
    )
    expect(screen.getByLabelText(/scrub/i)).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/editor/Transport.test.tsx`
Expected: FAIL — cannot resolve `./Transport`

- [ ] **Step 3: Write the implementation**

Create `src/editor/Transport.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { applyMorphs } from '../wheel/morph'
import type { Morph, Segment } from '../wheel/types'

export type TransportProps = {
  segments: Segment[]
  morphs: Morph[]
  durationMs: number
  isSpinning: boolean
  onSpin: () => void
  /** Receives the geometry at the scrubbed instant. */
  onScrub?: (segments: Segment[]) => void
}

export function Transport({
  segments,
  morphs,
  durationMs,
  isSpinning,
  onSpin,
  onScrub,
}: TransportProps) {
  const [t, setT] = useState(0)

  // `applyMorphs` is already pure, so scrubbing needs no animation machinery —
  // it samples exactly the function a real spin runs, at a fixed instant.
  useEffect(() => {
    onScrub?.(applyMorphs(segments, morphs, t * durationMs))
  }, [t, segments, morphs, durationMs, onScrub])

  return (
    <div className="transport">
      <label className="transport__scrub">
        <span>Scrub</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={t}
          disabled={isSpinning}
          onChange={(event) => setT(Number.parseFloat(event.target.value))}
        />
        <output>{t.toFixed(2)}</output>
      </label>
      <button type="button" onClick={onSpin} disabled={isSpinning}>
        Spin with these tricks
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/editor/Transport.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 5: Add the styles**

Append to `src/editor/Editor.css`:

```css
.transport {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: stretch;
  width: 100%;
  max-width: 26rem;
}

.transport__scrub {
  display: grid;
  grid-template-columns: 4rem 1fr 3rem;
  gap: 0.5rem;
  align-items: center;
}

.transport__scrub output {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
```

- [ ] **Step 6: Wire the center column**

In `src/editor/Editor.tsx`, add the imports:

```tsx
import { useSpin } from '../wheel/useSpin'
import { Transport } from './Transport'
```

Add spin wiring after the `conflicts` memo:

```tsx
  const spinConfig = useMemo(
    () => ({
      durationMs: preset.spin.durationMs,
      fullSpins: preset.spin.fullSpins,
      easing: preset.spin.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )

  const { displaySegments, isSpinning, spin, rotorRef } = useSpin(resolved.segments, spinConfig)
  const [scrubbed, setScrubbed] = useState<Segment[] | null>(null)

  // A running spin owns the geometry; otherwise the scrubber does.
  const shown = isSpinning ? displaySegments : (scrubbed ?? resolved.segments)
```

Add the `Segment` type import:

```tsx
import type { Segment } from '../wheel/types'
```

and replace the center column's contents:

```tsx
<section className="editor__column editor__column--center">
  <Wheel segments={shown} rotorRef={rotorRef} />
  <Transport
    segments={resolved.segments}
    morphs={resolved.morphs}
    durationMs={preset.spin.durationMs}
    isSpinning={isSpinning}
    onSpin={() => spin()}
    onScrub={setScrubbed}
  />
</section>
```

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/editor/
git commit -m "feat(editor): add the scrub and play transport"
```

---

### Task 15: End-to-end editor test and cleanup

**Files:**
- Modify: `src/editor/Editor.test.tsx`

- [ ] **Step 1: Add the integration tests**

Append to `src/editor/Editor.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event'
import { PRESET_KEY, parsePreset } from '../preset/storage'

describe('Editor integration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persists a segment edit to localStorage', async () => {
    render(<Editor />)
    const input = screen.getByDisplayValue('Ana')
    await userEvent.clear(input)
    await userEvent.type(input, 'Zoe')
    const stored = parsePreset(window.localStorage.getItem(PRESET_KEY))
    expect(stored.segments[0].label).toBe('Zoe')
  })

  it('shows the takeover wedge as a ghost row once enabled', async () => {
    render(<Editor />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
    expect(screen.getByRole('button', { name: /owned by slow burn/i })).toBeInTheDocument()
  })

  it('badges a conflict when two enabled tricks write the same weight', async () => {
    render(<Editor />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
    await userEvent.selectOptions(screen.getByLabelText(/add a trick/i), 'vanish')
    // The new vanish trick defaults to every segment, which the full-share
    // takeover also drives to zero.
    await userEvent.click(screen.getByRole('checkbox', { name: /Enable Named wedges shrink away/i }))
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm test -- src/editor/Editor.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 3: Run Biome and fix anything it flags**

Run: `npm run check`
Expected: no remaining errors

- [ ] **Step 4: Full verification**

Run: `npm test && npm run build`
Expected: every test passes; build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/editor/Editor.test.tsx
git commit -m "test(editor): cover persistence, ghost rows, and conflict badges end to end"
```

---

### Task 16: Preset export and import

**Files:**
- Create: `src/editor/PresetIo.tsx`
- Create: `src/editor/PresetIo.test.tsx`
- Modify: `src/editor/Editor.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/editor/PresetIo.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESET } from '../preset/defaults'
import { PresetIo } from './PresetIo'

describe('PresetIo', () => {
  it('offers a download link carrying the preset as JSON', () => {
    render(<PresetIo preset={DEFAULT_PRESET} onImport={vi.fn()} />)
    const link = screen.getByRole('link', { name: /export/i })
    expect(link).toHaveAttribute('download', 'wod-standup.json')
    expect(link.getAttribute('href')).toContain('application/json')
  })

  it('imports a valid file through the defensive parser', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} />)
    const file = new File([JSON.stringify({ ...DEFAULT_PRESET, name: 'beer' })], 'p.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText(/import/i), file)
    await waitFor(() => expect(onImport).toHaveBeenCalled())
    expect(onImport.mock.calls[0][0].name).toBe('beer')
  })

  it('falls back to the default rather than throwing on a malformed file', async () => {
    const onImport = vi.fn()
    render(<PresetIo preset={DEFAULT_PRESET} onImport={onImport} />)
    const file = new File(['{not json'], 'p.json', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText(/import/i), file)
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(DEFAULT_PRESET))
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/editor/PresetIo.test.tsx`
Expected: FAIL — cannot resolve `./PresetIo`

- [ ] **Step 3: Write the implementation**

Create `src/editor/PresetIo.tsx`:

```tsx
import { parsePreset } from '../preset/storage'
import type { Preset } from '../preset/types'

export type PresetIoProps = {
  preset: Preset
  onImport: (preset: Preset) => void
}

export function PresetIo({ preset, onImport }: PresetIoProps) {
  const json = JSON.stringify(preset, null, 2)
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`

  return (
    <div className="preset-io">
      <a href={href} download={`wod-${preset.name}.json`}>
        Export
      </a>
      <label className="preset-io__import">
        <span>Import</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            // Same defensive parser as load, so a hand-edited or stale file
            // degrades instead of throwing.
            onImport(parsePreset(await file.text()))
            event.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/editor/PresetIo.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Wire it into the shell header**

In `src/editor/Editor.tsx`, add the import:

```tsx
import { PresetIo } from './PresetIo'
```

and replace the `LabShell` header prop:

```tsx
header={
  <>
    <a href="#/">Show page</a>
    <PresetIo preset={preset} onImport={update} />
  </>
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/editor/
git commit -m "feat(editor): export and import presets as JSON"
```

---

### Task 17: Manual verification

Not automatable — the parent spec says animation quality is verified by eye.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Check the show page at `http://localhost:5173/`**

Expected: five equal wedges, no free-beer sliver anywhere.

- [ ] **Step 3: Open `http://localhost:5173/#/edit`**

Expected: three columns; segments on the left, wheel and scrubber in the middle, the `slow burn` trick on the right, switched off.

- [ ] **Step 4: Enable `slow burn` and scrub**

Expected: at t=0 the wheel still shows five wedges; past 0.6 a sixth grows out of nothing; at t=1 free beer fills the circle and no other wedge is visible. No `NaN` in the DOM, no console errors.

- [ ] **Step 5: Press "Spin with these tricks"**

Expected: the wheel accelerates, the wedge swells during the spin, and it lands on free beer.

- [ ] **Step 6: Cross-window sync**

Open the show page in a second tab, edit a segment label in the editor tab, and switch back.

Expected: the show page updates without a reload.

- [ ] **Step 7: Export, then reimport**

Export the preset, delete a segment, then reimport the file.

Expected: the deleted segment returns and the wheel redraws.

- [ ] **Step 8: Commit anything found**

Only if the manual pass turned up a fix.

---

## Notes for the implementer

- **Do not modify `src/wheel/morph.ts`.** Last-write-wins composition is a deliberate choice recorded in the spec, not an oversight. If two tricks fight over a weight, the fix is the conflict badge and trick ordering.
- **`writes()` must stay in sync with `resolve()`.** Task 5's final test asserts this for `takeover`; hold the same standard when adding a recipe.
- **Recipes never import React.** They emit `RecipeField` descriptors and the editor renders them. This is what keeps `tricks/` testable as pure data.
- **A recipe that cannot run is disabled, never dropped.** Silently losing a trick is worse than showing it switched off.
