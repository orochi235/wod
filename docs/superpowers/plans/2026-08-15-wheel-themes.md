# Wheel Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wheel is a fixed list of parts a stored theme dresses, and the first theme dresses it as the Wheel of Fortune wheel — gold rim, chrome pegs, lit panels, and a flapper that ticks over the pegs as it turns.

**Architecture:** Structure is rigid, materials are loose. A `Theme` names which parts are on, the handful of numbers the renderer does arithmetic with (`metrics`), a bag of CSS custom properties (`tokens`), where the pegs go, and how far the flapper goes. `Wheel.tsx` renders every part in a fixed order and reads the theme to decide which appear; `Wheel.css` decides what each custom property drives. The flapper reads the wheel's angle off the composited transform once per frame, which works for any motion whatever.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, Biome. WebAudio for the click.

**Spec:** `docs/superpowers/specs/2026-08-15-wheel-themes-design.md`. Read it before Task 9 — the flapper's angle source and the rule about planned catches are argued there and this plan implements them without restating the reasoning.

**Scope:** The parts, the theme record, storage, the WoF look, and the flapper in all three modes. Out of scope: a tilted camera, any studio set beyond the wheel's own ground, and motion programs (a spin that accelerates and decelerates in a loop), which are their own spec and do not block anything here.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/wheel/theme.ts` | *new* — `Theme`, `WheelPart`, `PegMode`, `FlapperMode`, `Metrics`, the flat default, and `partOn`. |
| `src/wheel/themes/flat.ts` | *new* — today's look, expressed as a theme. Every part off. |
| `src/wheel/themes/wof.ts` | *new* — the Wheel of Fortune look. |
| `src/wheel/themes/registry.ts` | *new* — `THEMES`, `THEME_LIST`, `getTheme`, on the precedent `src/transition/registry.ts` sets. |
| `src/wheel/pegs.ts` | *new* — the peg mode and live arcs to a list of peg angles. Pure. |
| `src/wheel/themeStyle.ts` | *new* — a theme's tokens to a style object. Pure. |
| `src/wheel/geometry.ts` | exports `pointAt`, which it already computes privately. |
| `src/wheel/Wheel.tsx` | renders the part list and the `defs` block; gates each part on the theme. |
| `src/wheel/Wheel.css` | what each token drives. Gains the WoF rules. |
| `src/wheel/useWheelAngle.ts` | *new* — the rotor's angle and speed, sampled per frame off the composited transform. |
| `src/wheel/flapper.ts` | *new* — deflection as a pure function of angle, pegs, and geometry. |
| `src/wheel/flapperAudio.ts` | *new* — one click per peg crossing, gated on a user gesture. |
| `src/wheel/spin.ts` | folds a planned catch into the resting angle. |
| `src/preset/types.ts` | `Preset` version 5, optional `theme`. |
| `src/preset/storage.ts` | `readTheme`, and the version gate accepting 1–5. |
| `src/editor/ThemePanel.tsx` | *new* — picks a theme, so the look is reachable without editing JSON. |

---

### Task 1: Peg angles

Where the pegs sit is the one geometric question the peg mode answers. It is a
pure function so the renderer, the flapper, and the click all agree without any
of them knowing which mode produced the list.

**Files:**
- Create: `src/wheel/pegs.ts`
- Create: `src/wheel/pegs.test.ts`
- Modify: `src/wheel/geometry.ts`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/pegs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Arc } from './geometry'
import { pegAngles } from './pegs'

const arcs: Arc[] = [
  { id: 'ana', start: 0, end: 0.5 },
  { id: 'ben', start: 0.5, end: 0.75 },
  { id: 'cy', start: 0.75, end: 1 },
]

describe('pegAngles', () => {
  it('puts one peg on each wedge boundary', () => {
    expect(pegAngles({ kind: 'bounds' }, arcs)).toEqual([0, 0.5, 0.75])
  })

  it('spaces a fixed count evenly, whatever the roster is', () => {
    expect(pegAngles({ kind: 'fixed', count: 4 }, arcs)).toEqual([0, 0.25, 0.5, 0.75])
    expect(pegAngles({ kind: 'fixed', count: 4 }, [])).toEqual([0, 0.25, 0.5, 0.75])
  })

  it('has no pegs at a count of zero', () => {
    expect(pegAngles({ kind: 'fixed', count: 0 }, arcs)).toEqual([])
  })

  it('refuses a count that is not a whole positive number', () => {
    expect(pegAngles({ kind: 'fixed', count: -3 }, arcs)).toEqual([])
    expect(pegAngles({ kind: 'fixed', count: 2.5 }, arcs)).toEqual([0, 0.5])
    expect(pegAngles({ kind: 'fixed', count: Number.NaN }, arcs)).toEqual([])
  })

  it('drops a zero-width wedge rather than stacking two pegs on one angle', () => {
    const withEmpty: Arc[] = [
      { id: 'ana', start: 0, end: 0.5 },
      { id: 'gone', start: 0.5, end: 0.5 },
      { id: 'ben', start: 0.5, end: 1 },
    ]
    expect(pegAngles({ kind: 'bounds' }, withEmpty)).toEqual([0, 0.5])
  })

  it('has no pegs with no wedges', () => {
    expect(pegAngles({ kind: 'bounds' }, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/pegs.test.ts`
Expected: FAIL — "Failed to resolve import './pegs'".

- [ ] **Step 3: Write the implementation**

Create `src/wheel/pegs.ts`:

```ts
import type { Arc } from './geometry'

/** Where the pegs go: on the wedge boundaries, or evenly spaced regardless of them. */
export type PegMode = { kind: 'bounds' } | { kind: 'fixed'; count: number }

/**
 * Peg positions as turns, 0 at 12 o'clock. A `bounds` peg sits on the line
 * between two wedges; a `fixed` one ignores the roster entirely.
 */
export function pegAngles(mode: PegMode, arcs: Arc[]): number[] {
  if (mode.kind === 'fixed') {
    const count = Math.floor(mode.count)
    if (!Number.isFinite(count) || count <= 0) return []
    return Array.from({ length: count }, (_, i) => i / count)
  }
  // A zero-width wedge shares both its boundaries with a neighbor, and two pegs
  // on one angle is one peg the flapper strikes twice.
  return arcs.filter((arc) => arc.end > arc.start).map((arc) => arc.start)
}
```

- [ ] **Step 4: Export a point helper from geometry**

`src/wheel/geometry.ts` computes points on the circle privately, and the renderer
now needs the same arithmetic for pegs. Rename the private `pointOnCircle` to an
exported `pointAt` and update its two callers inside the file:

```ts
/** Turn 0 is 12 o'clock; turns increase clockwise. SVG y grows downward. */
export function pointAt(turn: number, radius: number): [number, number] {
  const angle = turn * TAU
  return [round(radius * Math.sin(angle)), round(-radius * Math.cos(angle))]
}
```

In `arcPath`, the two call sites become:

```ts
  const [x0, y0] = pointAt(start, radius)
  const [x1, y1] = pointAt(end, radius)
```

- [ ] **Step 5: Pin the export**

Append to `src/wheel/geometry.test.ts`:

```ts
describe('pointAt', () => {
  it('puts turn 0 at the top and a quarter turn to the right', () => {
    expect(pointAt(0, 100)).toEqual([0, -100])
    expect(pointAt(0.25, 100)).toEqual([100, 0])
  })
})
```

Add `pointAt` to the existing import from `./geometry` at the top of that file.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/wheel/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): put pegs on a boundary or on an even spacing"
```

---

### Task 2: The theme record and the two looks

The type the rest of the plan is written against, plus the flat look that has to
reproduce today exactly and the WoF look that is the point of the exercise.

**Files:**
- Create: `src/wheel/theme.ts`
- Create: `src/wheel/theme.test.ts`
- Create: `src/wheel/themes/flat.ts`
- Create: `src/wheel/themes/wof.ts`
- Create: `src/wheel/themes/registry.ts`
- Create: `src/wheel/themes/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FLAT_METRICS, partOn } from './theme'
import type { Theme } from './theme'
import { flat } from './themes/flat'
import { wof } from './themes/wof'

const bare: Theme = {
  id: 'bare',
  name: 'Bare',
  parts: {},
  metrics: FLAT_METRICS,
  tokens: {},
  pegs: { kind: 'bounds' },
  flapper: 'silent',
}

describe('partOn', () => {
  it('leaves a part a theme does not name off', () => {
    expect(partOn(bare, 'rim')).toBe(false)
    expect(partOn(bare, 'peg')).toBe(false)
  })

  it('turns on what a theme asks for', () => {
    expect(partOn({ ...bare, parts: { rim: true } }, 'rim')).toBe(true)
  })

  it('lets a theme turn a part back off explicitly', () => {
    expect(partOn({ ...bare, parts: { rim: false } }, 'rim')).toBe(false)
  })
})

describe('the flat look', () => {
  // Absent means flat, and flat has to be indistinguishable from no theme at
  // all: every part it could add is one the wheel does not draw today.
  it('adds no part', () => {
    expect(Object.values(flat.parts).every((on) => on === false)).toBe(true)
  })

  it('asks for no pegs and a silent flapper', () => {
    expect(flat.pegs).toEqual({ kind: 'fixed', count: 0 })
    expect(flat.flapper).toBe('silent')
  })
})

describe('the wof look', () => {
  it('turns on the machinery that makes it read as a wheel', () => {
    for (const part of ['rim', 'peg', 'flapper', 'hub', 'panel'] as const) {
      expect(partOn(wof, part)).toBe(true)
    }
  })

  it('puts its pegs on the wedge boundaries', () => {
    expect(wof.pegs).toEqual({ kind: 'bounds' })
  })

  it('keeps its panel inside the face', () => {
    const [inner, outer] = wof.metrics.panel
    expect(inner).toBeGreaterThan(0)
    expect(outer).toBeLessThan(1)
    expect(inner).toBeLessThan(outer)
  })

  it('names only tokens the wheel scopes', () => {
    for (const key of Object.keys(wof.tokens)) {
      expect(key.startsWith('--wheel-') || key.startsWith('--wedge-')).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/theme.test.ts`
Expected: FAIL — "Failed to resolve import './theme'".

- [ ] **Step 3: Write the type**

Create `src/wheel/theme.ts`:

```ts
import type { PegMode } from './pegs'

/**
 * Every part a theme may switch. `wedge`, `label`, and `pointer` are missing on
 * purpose: a wheel without them is not a wheel.
 */
export type WheelPart =
  | 'stage'
  | 'shadow'
  | 'rim'
  | 'face'
  | 'divider'
  | 'panel'
  | 'inner-shadow'
  | 'sheen'
  | 'peg'
  | 'hub'
  | 'flapper'

export type FlapperMode = 'silent' | 'click' | 'catch'

/** Wheel units against a face radius of 200. The renderer does arithmetic on these. */
export type Metrics = {
  rimWidth: number
  pegRadius: number
  hubRadius: number
  /** The panel's inner and outer edge, as fractions of the face radius. */
  panel: [number, number]
}

export type Theme = {
  id: string
  name: string
  /** Absent means off. A look adds parts rather than subtracting them. */
  parts: Partial<Record<WheelPart, boolean>>
  metrics: Metrics
  /** CSS custom properties, `--wheel-*` and `--wedge-*`. Values only, never rules. */
  tokens: Record<string, string>
  pegs: PegMode
  flapper: FlapperMode
}

export const FLAT_METRICS: Metrics = {
  rimWidth: 0,
  pegRadius: 0,
  hubRadius: 0,
  panel: [0, 0],
}

export function partOn(theme: Theme, part: WheelPart): boolean {
  return theme.parts[part] === true
}
```

- [ ] **Step 4: Write the flat look**

Create `src/wheel/themes/flat.ts`:

```ts
import { FLAT_METRICS } from '../theme'
import type { Theme } from '../theme'

/** Today's wheel. Nothing is added, so a preset with no theme renders unchanged. */
export const flat: Theme = {
  id: 'flat',
  name: 'Flat',
  parts: {
    stage: false,
    shadow: false,
    rim: false,
    face: false,
    divider: false,
    panel: false,
    'inner-shadow': false,
    sheen: false,
    peg: false,
    hub: false,
    flapper: false,
  },
  metrics: FLAT_METRICS,
  tokens: {},
  pegs: { kind: 'fixed', count: 0 },
  flapper: 'silent',
}
```

- [ ] **Step 5: Write the WoF look**

Create `src/wheel/themes/wof.ts`:

```ts
import type { Theme } from '../theme'

/**
 * The named paints are `url(#…)` references into the `defs` block `Wheel.tsx`
 * renders. A gradient cannot be written as a custom property, so the token
 * chooses among them instead of describing one.
 */
export const wof: Theme = {
  id: 'wof',
  name: 'Wheel of Fortune',
  parts: {
    stage: true,
    shadow: true,
    rim: true,
    face: true,
    divider: true,
    panel: true,
    'inner-shadow': true,
    sheen: true,
    peg: true,
    hub: true,
    flapper: true,
  },
  metrics: {
    rimWidth: 18,
    pegRadius: 4.4,
    hubRadius: 30,
    panel: [0.33, 0.87],
  },
  tokens: {
    '--wheel-stage-fill': '#0b0f1c',
    '--wheel-shadow': 'drop-shadow(0 14px 16px rgb(0 0 0 / 0.6))',
    '--wheel-rim-fill': 'url(#wheel-gold)',
    '--wheel-face-fill': '#14181f',
    '--wheel-inner-shadow-fill': 'url(#wheel-inner)',
    '--wheel-sheen-fill': 'url(#wheel-sheen)',
    '--wheel-peg-fill': 'url(#wheel-chrome)',
    '--wheel-peg-stroke': '#39414d',
    '--wheel-hub-fill': 'url(#wheel-hub)',
    '--wheel-hub-stroke': '#1c2128',
    '--wheel-flapper-fill': 'url(#wheel-chrome)',
    '--wheel-flapper-stroke': '#39414d',
    '--wedge-panel-fill': 'url(#wheel-gloss)',
    '--wedge-panel-stroke': 'rgb(255 255 255 / 0.65)',
    '--wedge-divider-stroke': '#0d1017',
    '--wheel-label-color': '#12151b',
    '--wheel-segment-stroke': 'transparent',
  },
  pegs: { kind: 'bounds' },
  flapper: 'click',
}
```

- [ ] **Step 6: Write the registry**

Create `src/wheel/themes/registry.ts`:

```ts
import type { Theme } from '../theme'
import { flat } from './flat'
import { wof } from './wof'

export type ThemeId = 'flat' | 'wof'

export const THEMES: Record<ThemeId, Theme> = { flat, wof }

export const THEME_LIST: Theme[] = [flat, wof]

/**
 * Returns null rather than throwing, matching getTransition: ids come out of
 * localStorage, and a stored id of 'constructor' resolves through the prototype
 * chain to something that is not a theme.
 */
export function getTheme(id: string): Theme | null {
  return Object.hasOwn(THEMES, id) ? THEMES[id as ThemeId] : null
}
```

Create `src/wheel/themes/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { THEMES, THEME_LIST, getTheme } from './registry'

describe('getTheme', () => {
  it('finds a theme by id', () => {
    expect(getTheme('wof')?.id).toBe('wof')
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(getTheme('nope')).toBeNull()
  })

  it('returns null for a prototype key', () => {
    expect(getTheme('constructor')).toBeNull()
    expect(getTheme('__proto__')).toBeNull()
  })

  // The editor builds its menu from the list alone, so one missing from it is
  // unreachable while every other test still resolves it through THEMES.
  it('lists every theme it holds', () => {
    expect(THEME_LIST.map((theme) => theme.id)).toEqual(Object.keys(THEMES))
  })
})
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/wheel/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): describe a look as parts, metrics, and tokens"
```

---

### Task 3: Tokens to a style object

A theme's tokens reach the DOM as custom properties on the wheel root. This is
the one place a stored string becomes something the browser parses, so it is
also where a malformed value gets dropped.

**Files:**
- Create: `src/wheel/themeStyle.ts`
- Create: `src/wheel/themeStyle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/themeStyle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FLAT_METRICS } from './theme'
import type { Theme } from './theme'
import { styleOfTheme } from './themeStyle'

const theme = (tokens: Record<string, string>): Theme => ({
  id: 't',
  name: 'T',
  parts: {},
  metrics: FLAT_METRICS,
  tokens,
  pegs: { kind: 'bounds' },
  flapper: 'silent',
})

describe('styleOfTheme', () => {
  it('passes a token through as a custom property', () => {
    expect(styleOfTheme(theme({ '--wheel-rim-fill': 'gold' }))).toEqual({
      '--wheel-rim-fill': 'gold',
    })
  })

  it('keeps a token it has never heard of', () => {
    expect(styleOfTheme(theme({ '--wheel-future-thing': '3px' }))).toEqual({
      '--wheel-future-thing': '3px',
    })
  })

  it('drops a name outside the wheel scope', () => {
    // A stored theme could otherwise set --anything on the wheel root and reach
    // whatever else in the app inherits from it.
    expect(styleOfTheme(theme({ color: 'red', '--app-bg': 'red' }))).toEqual({})
  })

  it('drops a value that would close the declaration', () => {
    expect(styleOfTheme(theme({ '--wheel-rim-fill': 'gold; position: fixed' }))).toEqual({})
  })

  it('drops an empty value rather than emitting an empty property', () => {
    expect(styleOfTheme(theme({ '--wheel-rim-fill': '   ' }))).toEqual({})
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/themeStyle.test.ts`
Expected: FAIL — "Failed to resolve import './themeStyle'".

- [ ] **Step 3: Write the implementation**

Create `src/wheel/themeStyle.ts`:

```ts
import type { CSSProperties } from 'react'
import type { Theme } from './theme'

/** Only the two scopes the stylesheet reads. A stored theme does not get to set anything else. */
const SCOPES = ['--wheel-', '--wedge-']

export function styleOfTheme(theme: Theme): CSSProperties {
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(theme.tokens)) {
    if (!SCOPES.some((scope) => name.startsWith(scope))) continue
    const trimmed = value.trim()
    if (trimmed === '') continue
    // React writes the value verbatim, so a semicolon would end this
    // declaration and start one the theme was not entitled to.
    if (trimmed.includes(';')) continue
    style[name] = trimmed
  }
  return style as CSSProperties
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/wheel/themeStyle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): emit a theme's tokens as scoped custom properties"
```

---

### Task 4: Store a theme on the preset

**Files:**
- Modify: `src/preset/types.ts`
- Modify: `src/preset/storage.ts`
- Modify: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/preset/storage.test.ts`:

```ts
describe('theme', () => {
  it('reads a stored theme by id', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: 'wof' })
    expect(parsePreset(raw).theme).toBe('wof')
  })

  it('leaves the theme absent when a v4 preset has none', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 4 })
    expect(parsePreset(raw).theme).toBeUndefined()
  })

  it('drops an id no theme answers to', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: 'nope' })
    expect(parsePreset(raw).theme).toBeUndefined()
  })

  it('drops a prototype key rather than resolving it', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: '__proto__' })
    expect(parsePreset(raw).theme).toBeUndefined()
  })

  it('reads a v5 preset back out at version 5', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: 'wof' })
    expect(parsePreset(raw).version).toBe(5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — a v5 preset is rejected by the version gate and comes back as
`DEFAULT_PRESET`, so `theme` is undefined and `version` is 4.

- [ ] **Step 3: Widen the type**

In `src/preset/types.ts`, change `Preset`:

```ts
export type Preset = {
  version: 5
  name: string
  /** Statics. Feed items and trick wedges join these at compose time. */
  segments: Segment[]
  feeds: FeedConfig[]
  /** Keyed by FeedItem.id, not by wedge id: an override outlives its feed. */
  overrides: Record<string, ItemOverride>
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
  /** Absent means no transition at that moment, which is the behavior that predates them. */
  transitions?: Transitions
  /** Absent means the flat look, which is what the wheel drew before themes. */
  theme?: string
}
```

- [ ] **Step 4: Read it**

In `src/preset/storage.ts`, import the registry beside the existing imports:

```ts
import { getTheme } from '../wheel/themes/registry'
```

Add the reader beside `readTransitions`:

```ts
function readTheme(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // Resolved rather than trusted: the id indexes a record, and a stored
  // 'constructor' would otherwise come back as a function.
  return getTheme(value)?.id
}
```

Widen the version gate and the returned version in `parsePreset`:

```ts
  if (
    data.version !== 1 &&
    data.version !== 2 &&
    data.version !== 3 &&
    data.version !== 4 &&
    data.version !== 5
  ) {
    return DEFAULT_PRESET
  }
```

```ts
  return {
    version: 5,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    feeds,
    overrides: readOverrides(data.overrides),
    tricks: readTricks(data.tricks, segments, feeds),
    spin,
    branches: readBranches(data.branches),
    transitions: readTransitions(data.transitions),
    theme: readTheme(data.theme),
  }
```

- [ ] **Step 5: Update the default preset**

In `src/preset/defaults.ts`, change `version: 4` to `version: 5`. Leave `theme`
absent — the default show is the flat look.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/preset/`
Expected: PASS. Any existing test asserting `version: 4` needs updating to 5;
run the file to see which.

- [ ] **Step 7: Commit**

```bash
git add src/preset/
git commit -m "feat(preset): store which look a show wears"
```

---

### Task 5: Render the parts that hold still

The rim, face, sheen, inner shadow, hub, and stage. All are circles at the wheel
scale, none of them move, and each is gated on the theme.

**Files:**
- Modify: `src/wheel/Wheel.tsx`
- Modify: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/wheel/Wheel.test.tsx`:

```ts
import { flat } from './themes/flat'
import { wof } from './themes/wof'

describe('parts', () => {
  const segments = [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
  ]

  it('draws no new part under the flat look', () => {
    const { container } = render(<Wheel segments={segments} theme={flat} />)
    expect(container.querySelector('.wheel__rim')).toBeNull()
    expect(container.querySelector('.wheel__hub')).toBeNull()
    expect(container.querySelector('.wheel__sheen')).toBeNull()
  })

  it('casts a shadow only for a look that asks for one', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelector('.wheel__body--shadow')).not.toBeNull()

    const flatWheel = render(<Wheel segments={segments} theme={flat} />)
    expect(flatWheel.container.querySelector('.wheel__body--shadow')).toBeNull()
  })

  it('draws the machinery under a look that asks for it', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelector('.wheel__rim')).not.toBeNull()
    expect(container.querySelector('.wheel__face')).not.toBeNull()
    expect(container.querySelector('.wheel__hub')).not.toBeNull()
    expect(container.querySelector('.wheel__sheen')).not.toBeNull()
  })

  it('puts the rim outside the face by the look's own metric', () => {
    const { container } = render(<Wheel segments={segments} radius={200} theme={wof} />)
    const rim = container.querySelector('.wheel__rim')
    expect(rim?.getAttribute('r')).toBe(String(200 + wof.metrics.rimWidth))
  })

  it('sets the look's tokens on the wheel root', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    const svg = container.querySelector('.wheel') as SVGElement
    expect(svg.style.getPropertyValue('--wheel-rim-fill')).toBe('url(#wheel-gold)')
  })

  it('defaults to the flat look with no theme at all', () => {
    const { container } = render(<Wheel segments={segments} />)
    expect(container.querySelector('.wheel__rim')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — `Wheel` has no `theme` prop and renders no `.wheel__rim`.

- [ ] **Step 3: Write the implementation**

In `src/wheel/Wheel.tsx`, add the imports:

```ts
import { partOn } from './theme'
import type { Theme } from './theme'
import { flat } from './themes/flat'
import { styleOfTheme } from './themeStyle'
```

Add the prop to `WheelProps`:

```ts
  /** Which look to wear. Absent is the flat look, which is what the wheel drew before themes. */
  theme?: Theme
```

Take it in the signature, defaulting to `flat`:

```ts
export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  held = false,
  theme = flat,
}: WheelProps) {
```

The viewBox has to make room for the rim, which sits outside the face:

```ts
  const drawn = usePresence(segments, transitions, held)
  const rim = partOn(theme, 'rim') ? theme.metrics.rimWidth : 0
  const half = radius + rim + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`
```

Set the tokens on the root and render the still parts around the existing rotor.
The full return, replacing the current one:

```tsx
  return (
    <svg
      className="wheel"
      viewBox={viewBox}
      role="img"
      aria-label="wheel"
      style={styleOfTheme(theme)}
    >
      <WheelPaints />
      {partOn(theme, 'stage') && <rect className="wheel__stage-ground" x={-half} y={-half} width={half * 2} height={half * 2} />}
      <g className={partOn(theme, 'shadow') ? 'wheel__body wheel__body--shadow' : 'wheel__body'}>
        {partOn(theme, 'rim') && <circle className="wheel__rim" r={radius + theme.metrics.rimWidth} />}
        {partOn(theme, 'face') && <circle className="wheel__face" r={radius} />}
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
        {partOn(theme, 'inner-shadow') && <circle className="wheel__inner-shadow" r={radius} />}
        {partOn(theme, 'sheen') && <circle className="wheel__sheen" r={radius + theme.metrics.rimWidth} />}
        {partOn(theme, 'hub') && <circle className="wheel__hub" r={theme.metrics.hubRadius} />}
      </g>
      {/* Apex inward: the tip is the thing that names a winner, so it points at
          the wedge rather than away from it, dipping just past the rim. */}
      <polygon
        className="wheel__pointer"
        points={`0,${-radius + POINTER_BITE} ${-POINTER_HALF_WIDTH},${-radius - POINTER_BASE} ${POINTER_HALF_WIDTH},${-radius - POINTER_BASE}`}
      />
    </svg>
  )
```

- [ ] **Step 4: Write the paints**

The gradients a look references by `url(#…)`. Create them as a component at the
bottom of `src/wheel/Wheel.tsx`, so every look draws from one set:

```tsx
/**
 * The named paints a theme's tokens select with `url(#…)`. A gradient cannot be
 * written as a custom property, so the theme chooses among these rather than
 * describing one. Ids are fixed: the app renders one wheel.
 */
function WheelPaints() {
  return (
    <defs>
      <radialGradient id="wheel-gold" cx="42%" cy="16%" r="88%">
        <stop offset="0%" stopColor="#fff6cf" />
        <stop offset="30%" stopColor="#f0c651" />
        <stop offset="58%" stopColor="#b8871f" />
        <stop offset="82%" stopColor="#7d570f" />
        <stop offset="100%" stopColor="#4b330a" />
      </radialGradient>
      <linearGradient id="wheel-chrome" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="30%" stopColor="#d5dde7" />
        <stop offset="52%" stopColor="#5e6874" />
        <stop offset="72%" stopColor="#aab4c1" />
        <stop offset="100%" stopColor="#f2f6fa" />
      </linearGradient>
      <radialGradient id="wheel-hub" cx="36%" cy="28%" r="82%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="26%" stopColor="#dbe2ea" />
        <stop offset="58%" stopColor="#767f8c" />
        <stop offset="100%" stopColor="#242931" />
      </radialGradient>
      <linearGradient id="wheel-gloss" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#f4efe2" />
        <stop offset="100%" stopColor="#cfc8b8" />
      </linearGradient>
      <linearGradient id="wheel-sheen" x1="0.1" y1="0" x2="0.75" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
        <stop offset="34%" stopColor="#ffffff" stopOpacity="0.09" />
        <stop offset="58%" stopColor="#000000" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.34" />
      </linearGradient>
      <radialGradient id="wheel-inner" cx="50%" cy="50%" r="50%">
        <stop offset="76%" stopColor="#000000" stopOpacity="0" />
        <stop offset="93%" stopColor="#000000" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.62" />
      </radialGradient>
    </defs>
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): render the parts a look adds around the wedges"
```

---

### Task 6: Render the pegs

Pegs sit on the rim, outside the rotor's wedges but turning with the wheel, so
they belong to the rotor group rather than to a wedge.

**Files:**
- Modify: `src/wheel/Wheel.tsx`
- Modify: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `parts` describe in `src/wheel/Wheel.test.tsx`:

```ts
it('puts one peg on each wedge boundary', () => {
  const { container } = render(<Wheel segments={segments} theme={wof} />)
  expect(container.querySelectorAll('.wheel__peg')).toHaveLength(2)
})

it('follows the roster as it grows', () => {
  const three = [...segments, { id: 'cy', label: 'Cy', weight: 1 }]
  const { container } = render(<Wheel segments={three} theme={wof} />)
  expect(container.querySelectorAll('.wheel__peg')).toHaveLength(3)
})

it('spaces a fixed count evenly instead, when a look asks for that', () => {
  const fixed = { ...wof, pegs: { kind: 'fixed' as const, count: 8 } }
  const { container } = render(<Wheel segments={segments} theme={fixed} />)
  expect(container.querySelectorAll('.wheel__peg')).toHaveLength(8)
})

it('turns the pegs with the wheel, not with a wedge', () => {
  // A peg belongs to the rim. A wedge flying in from off-screen must not drag
  // one across the screen with it.
  const { container } = render(<Wheel segments={segments} theme={wof} />)
  const peg = container.querySelector('.wheel__peg')
  expect(peg?.closest('.wheel__wedge')).toBeNull()
  expect(peg?.closest('.wheel__rotor')).not.toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — no `.wheel__peg` is rendered.

- [ ] **Step 3: Write the implementation**

In `src/wheel/Wheel.tsx`, add the imports:

```ts
import { arcPath, pointAt } from './geometry'
import { pegAngles } from './pegs'
```

`usePresence` returns the drawn list; the arcs the pegs stand on are the drawn
arcs. Compute them beside `drawn`:

```ts
  const pegs = partOn(theme, 'peg') ? pegAngles(theme.pegs, drawn.map((item) => item.arc)) : []
```

Render them inside `.wheel__rotor`, after the wedge map and before its closing
tag:

```tsx
            {pegs.map((turn) => {
              const [cx, cy] = pointAt(turn, radius + theme.metrics.rimWidth / 2)
              return (
                <circle
                  key={turn}
                  className="wheel__peg"
                  cx={cx}
                  cy={cy}
                  r={theme.metrics.pegRadius}
                />
              )
            })}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): stand a peg on the rim for every boundary"
```

---

### Task 7: The panel and the divider

Both live inside the wedge group, so both inherit its presence and animate with
it. Neither may carry a filter: the group's transform, opacity, and clip are
rewritten every frame.

**Files:**
- Create: `src/wheel/panel.ts`
- Create: `src/wheel/panel.test.ts`
- Modify: `src/wheel/Wheel.tsx`
- Modify: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/panel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { panelPath } from './panel'

describe('panelPath', () => {
  it('draws a slab between the two radii', () => {
    const d = panelPath(0, 0.25, 200, [0.5, 0.9], 0)
    expect(d).toContain('M ')
    expect(d).toContain('A ')
  })

  it('insets from both edges of the arc', () => {
    const wide = panelPath(0, 0.5, 200, [0.5, 0.9], 0)
    const inset = panelPath(0, 0.5, 200, [0.5, 0.9], 0.05)
    expect(inset).not.toBe(wide)
  })

  it('draws nothing once the inset has eaten the arc', () => {
    expect(panelPath(0, 0.02, 200, [0.5, 0.9], 0.05)).toBe('')
  })

  it('draws nothing for an arc with no width', () => {
    expect(panelPath(0.5, 0.5, 200, [0.5, 0.9], 0)).toBe('')
  })

  it('draws nothing when the radii are inside out', () => {
    expect(panelPath(0, 0.25, 200, [0.9, 0.5], 0)).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/panel.test.ts`
Expected: FAIL — "Failed to resolve import './panel'".

- [ ] **Step 3: Write the implementation**

Create `src/wheel/panel.ts`:

```ts
import { pointAt } from './geometry'

/**
 * The slab a label sits on: an arc band inset from both radial edges of the
 * wedge, between the two radii the look names.
 */
export function panelPath(
  start: number,
  end: number,
  radius: number,
  [inner, outer]: [number, number],
  padTurn: number,
): string {
  if (!(end > start)) return ''
  if (!(outer > inner)) return ''

  const from = start + padTurn
  const to = end - padTurn
  if (!(to > from)) return ''

  const rIn = radius * inner
  const rOut = radius * outer
  const [ax, ay] = pointAt(from, rIn)
  const [bx, by] = pointAt(from, rOut)
  const [cx, cy] = pointAt(to, rOut)
  const [dx, dy] = pointAt(to, rIn)
  const large = to - from > 0.5 ? 1 : 0
  return `M ${ax} ${ay} L ${bx} ${by} A ${rOut} ${rOut} 0 ${large} 1 ${cx} ${cy} L ${dx} ${dy} A ${rIn} ${rIn} 0 ${large} 0 ${ax} ${ay} Z`
}
```

- [ ] **Step 4: Write the failing render test**

Append to the `parts` describe in `src/wheel/Wheel.test.tsx`:

```ts
it('draws a panel and a divider inside each wedge', () => {
  const { container } = render(<Wheel segments={segments} theme={wof} />)
  const wedge = container.querySelector('.wheel__wedge')
  expect(wedge?.querySelector('.wheel__panel')).not.toBeNull()
  expect(wedge?.querySelector('.wheel__divider')).not.toBeNull()
})

it('draws neither under the flat look', () => {
  const { container } = render(<Wheel segments={segments} theme={flat} />)
  expect(container.querySelector('.wheel__panel')).toBeNull()
  expect(container.querySelector('.wheel__divider')).toBeNull()
})

it('keeps every filter off the wedge, which is rewritten every frame', () => {
  const { container } = render(<Wheel segments={segments} theme={wof} />)
  for (const node of container.querySelectorAll('.wheel__wedge *')) {
    expect(node.getAttribute('filter')).toBeNull()
  }
})
```

- [ ] **Step 5: Write the render implementation**

In `src/wheel/Wheel.tsx`, import the path builder:

```ts
import { panelPath } from './panel'
```

Inside the wedge map, after the `<path className="wheel__segment" …/>` line and
before the label, add the divider and the panel. The pad is a fraction of the
wedge, capped so a wide wedge does not inset absurdly:

```tsx
                  {partOn(theme, 'divider') && (
                    <line
                      className="wheel__divider"
                      x1={0}
                      y1={0}
                      x2={pointAt(arc.start, radius)[0]}
                      y2={pointAt(arc.start, radius)[1]}
                    />
                  )}
                  {partOn(theme, 'panel') &&
                    (() => {
                      const d = panelPath(
                        arc.start,
                        arc.end,
                        radius,
                        theme.metrics.panel,
                        Math.min(0.011, width * 0.13),
                      )
                      return d === '' ? null : <path className="wheel__panel" d={d} />
                    })()}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/wheel/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): give a wedge a lit panel and an edge"
```

---

### Task 8: What each token drives

jsdom applies no stylesheet, so nothing so far has connected a token name to a
paint. This is the task that does, and the task that guards the connection.

**Files:**
- Modify: `src/wheel/Wheel.css`
- Create: `src/wheel/Wheel.css.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/Wheel.css.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import css from './Wheel.css?raw'
import { wof } from './themes/wof'

describe('Wheel.css', () => {
  // jsdom applies no stylesheet, so renaming a token on both the emitting side
  // and its test would leave the suite green and the wheel unpainted.
  it('consumes every token the wof look emits', () => {
    for (const name of Object.keys(wof.tokens)) {
      expect(css).toContain(`var(${name}`)
    }
  })

  it('binds each part class to a rule', () => {
    for (const part of ['rim', 'face', 'peg', 'hub', 'sheen', 'panel', 'divider']) {
      expect(css).toContain(`.wheel__${part}`)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/Wheel.css.test.ts`
Expected: FAIL — `Wheel.css` has no rule for any of these.

Note: the vitest config already narrows its CSS stub so a `?raw` import returns
the file (`css: { include: [/\.css\?raw$/] }`). No config change is needed.

- [ ] **Step 3: Write the rules**

Append to `src/wheel/Wheel.css`:

```css
.wheel__stage-ground {
  fill: var(--wheel-stage-fill, transparent);
}

/* On the body rather than the wheel root: the root also holds the pointer and
   the flapper, which are not on the wheel and cast no shadow with it. */
.wheel__body--shadow {
  filter: var(--wheel-shadow, none);
}

.wheel__rim {
  fill: var(--wheel-rim-fill, none);
}

.wheel__face {
  fill: var(--wheel-face-fill, none);
}

.wheel__inner-shadow,
.wheel__sheen {
  pointer-events: none;
}

.wheel__inner-shadow {
  fill: var(--wheel-inner-shadow-fill, none);
}

.wheel__sheen {
  fill: var(--wheel-sheen-fill, none);
}

.wheel__peg {
  fill: var(--wheel-peg-fill, none);
  stroke: var(--wheel-peg-stroke, none);
  stroke-width: 0.7;
}

.wheel__hub {
  fill: var(--wheel-hub-fill, none);
  stroke: var(--wheel-hub-stroke, none);
  stroke-width: 1.6;
}

.wheel__panel {
  fill: var(--wedge-panel-fill, none);
  stroke: var(--wedge-panel-stroke, none);
  stroke-width: 0.8;
}

.wheel__divider {
  stroke: var(--wedge-divider-stroke, none);
  stroke-width: 2.2;
}

.wheel__flapper {
  fill: var(--wheel-flapper-fill, none);
  stroke: var(--wheel-flapper-stroke, none);
  stroke-width: 1;
}
```

The existing `.wheel__segment` and `.wheel__label` rules already read
`--wheel-segment-stroke` and `--wheel-label-color`, which is why the wof look
sets both.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/wheel/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): bind each look token to what it paints"
```

---

### Task 9: The wheel's angle, per frame

Read the spec's flapper section before this task. The angle comes off the
composited transform rather than out of the animation's timing, because the eye
sees what the compositor drew — and because it then holds for any motion at all,
including one that speeds up and slows down repeatedly.

**Files:**
- Create: `src/wheel/useWheelAngle.ts`
- Create: `src/wheel/useWheelAngle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/useWheelAngle.test.tsx`:

```tsx
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { angleOfMatrix, useWheelAngle } from './useWheelAngle'

describe('angleOfMatrix', () => {
  it('reads a rotation out of a matrix', () => {
    expect(angleOfMatrix('matrix(1, 0, 0, 1, 0, 0)')).toBeCloseTo(0)
    expect(angleOfMatrix('matrix(0, 1, -1, 0, 0, 0)')).toBeCloseTo(90)
  })

  it('reports a full turn rather than a negative angle', () => {
    expect(angleOfMatrix('matrix(0, -1, 1, 0, 0, 0)')).toBeCloseTo(270)
  })

  it('gives up on anything that is not a matrix', () => {
    expect(angleOfMatrix('none')).toBeNull()
    expect(angleOfMatrix('')).toBeNull()
    expect(angleOfMatrix('matrix(1, 0, 0)')).toBeNull()
  })
})

describe('useWheelAngle', () => {
  let frames: FrameRequestCallback[] = []

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const pump = (now: number) => {
    const due = frames
    frames = []
    act(() => {
      for (const frame of due) frame(now)
    })
  }

  function Probe({ onSample }: { onSample: (angle: number, speed: number) => void }) {
    const ref = useRef<SVGGElement>(null)
    useWheelAngle(ref, true, onSample)
    return (
      <svg>
        <g ref={ref} />
      </svg>
    )
  }

  it('reports the angle and the speed it is turning at', () => {
    const seen: Array<[number, number]> = []
    let angle = 0
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: `rotate(${angle}deg)` }) as CSSStyleDeclaration,
    )
    // jsdom hands back whatever transform it was given, so drive degrees
    // directly rather than through a matrix here.
    render(<Probe onSample={(a, s) => seen.push([a, s])} />)

    angle = 10
    pump(16)
    angle = 40
    pump(32)

    expect(seen.at(-1)?.[0]).toBeCloseTo(40)
    // 30 degrees over 16ms.
    expect(seen.at(-1)?.[1]).toBeCloseTo(30 / 16, 2)
  })

  it('reports no speed on its first frame, having nothing to compare against', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: 'rotate(5deg)' }) as CSSStyleDeclaration,
    )
    const seen: Array<[number, number]> = []
    render(<Probe onSample={(a, s) => seen.push([a, s])} />)
    pump(16)
    expect(seen[0][1]).toBe(0)
  })

  it('stops sampling once it is not running', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: 'rotate(0deg)' }) as CSSStyleDeclaration,
    )
    const onSample = vi.fn()
    const { rerender } = render(<Probe onSample={onSample} />)
    pump(16)
    const before = onSample.mock.calls.length
    rerender(<></>)
    pump(32)
    expect(onSample.mock.calls.length).toBe(before)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/useWheelAngle.test.tsx`
Expected: FAIL — "Failed to resolve import './useWheelAngle'".

- [ ] **Step 3: Write the implementation**

Create `src/wheel/useWheelAngle.ts`:

```ts
import { type RefObject, useEffect, useRef } from 'react'

const MATRIX = /^matrix\(([^)]*)\)$/
const DEGREES = /^rotate\(([-\d.]+)deg\)$/

/** Degrees clockwise, 0…360, out of whatever `getComputedStyle` reports. */
export function angleOfMatrix(transform: string): number | null {
  const degrees = DEGREES.exec(transform)
  if (degrees) return ((Number.parseFloat(degrees[1]) % 360) + 360) % 360

  const match = MATRIX.exec(transform)
  if (!match) return null
  const parts = match[1].split(',').map((n) => Number.parseFloat(n))
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [a, b] = parts
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/**
 * The wheel's angle and how fast it is turning, once per frame, read off what
 * the compositor actually drew. Speed is degrees per millisecond, unsigned by
 * the caller's reckoning — it is the raw difference, so a wheel crossing 360
 * reports the small step rather than a full turn backwards.
 */
export function useWheelAngle(
  ref: RefObject<SVGGElement | null>,
  running: boolean,
  onSample: (angleDeg: number, speedDegPerMs: number) => void,
): void {
  const sampleRef = useRef(onSample)
  sampleRef.current = onSample

  useEffect(() => {
    if (!running) return
    const node = ref.current
    if (!node) return

    let frame = 0
    let lastAngle: number | null = null
    let lastNow = 0

    const tick = (now: number) => {
      const angle = angleOfMatrix(window.getComputedStyle(node).transform ?? '')
      if (angle !== null) {
        let speed = 0
        if (lastAngle !== null && now > lastNow) {
          // Shortest way round: a wheel passing 12 o'clock steps a few degrees,
          // not 359 of them backwards.
          let delta = angle - lastAngle
          if (delta > 180) delta -= 360
          if (delta < -180) delta += 360
          speed = Math.abs(delta) / (now - lastNow)
        }
        lastAngle = angle
        lastNow = now
        sampleRef.current(angle, speed)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ref, running])
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/wheel/useWheelAngle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): sample the angle the compositor actually drew"
```

---

### Task 10: What the flapper does about a peg

Pure, so the arm's behavior is testable without a browser and without a spin.

**Files:**
- Create: `src/wheel/flapper.ts`
- Create: `src/wheel/flapper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/flapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_DEFLECTION_DEG, deflectionDeg, pegCrossings } from './flapper'

// Four pegs, at 12, 3, 6 and 9 o'clock in wheel-local turns.
const pegs = [0, 0.25, 0.5, 0.75]

describe('deflectionDeg', () => {
  it('rests at zero with a peg nowhere near the hinge', () => {
    // The wheel has turned 45 degrees, so the nearest peg is half a gap away.
    expect(deflectionDeg(45, pegs)).toBeCloseTo(0)
  })

  it('is pushed hardest just as a peg reaches the hinge', () => {
    expect(deflectionDeg(0, pegs)).toBeCloseTo(MAX_DEFLECTION_DEG)
  })

  it('falls off as the peg leaves', () => {
    const atPeg = deflectionDeg(0, pegs)
    const leaving = deflectionDeg(8, pegs)
    expect(leaving).toBeLessThan(atPeg)
    expect(leaving).toBeGreaterThan(0)
  })

  it('rests at zero with no pegs at all', () => {
    expect(deflectionDeg(45, [])).toBe(0)
  })

  it('treats the wheel as circular', () => {
    expect(deflectionDeg(360, pegs)).toBeCloseTo(deflectionDeg(0, pegs))
  })
})

describe('pegCrossings', () => {
  it('counts nothing when the wheel has not moved', () => {
    expect(pegCrossings(10, 10, pegs)).toBe(0)
  })

  it('counts one peg passing the hinge', () => {
    // 80 to 95 degrees crosses the peg at 90.
    expect(pegCrossings(80, 95, pegs)).toBe(1)
  })

  it('counts every peg a long step passed', () => {
    expect(pegCrossings(0, 200, pegs)).toBe(2)
  })

  it('counts across the top of the wheel', () => {
    expect(pegCrossings(350, 10, pegs)).toBe(1)
  })

  it('counts nothing with no pegs', () => {
    expect(pegCrossings(0, 200, [])).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/flapper.test.ts`
Expected: FAIL — "Failed to resolve import './flapper'".

- [ ] **Step 3: Write the implementation**

Create `src/wheel/flapper.ts`:

```ts
/** How far the arm is pushed by a peg directly under it. */
export const MAX_DEFLECTION_DEG = 22

/** How far past the hinge a peg still holds the arm up, in degrees of wheel rotation. */
const REACH_DEG = 12

const wrapDeg = (deg: number): number => ((deg % 360) + 360) % 360

/** Where each peg is on screen, given how far the wheel has turned. */
function screenAngles(rotationDeg: number, pegs: number[]): number[] {
  return pegs.map((turn) => wrapDeg(turn * 360 + rotationDeg))
}

/**
 * How far the arm is pushed aside. A peg lifts it as it arrives and lets it fall
 * as it leaves, so the arm is at rest between pegs and hardest over one.
 */
export function deflectionDeg(rotationDeg: number, pegs: number[]): number {
  let closest = Number.POSITIVE_INFINITY
  for (const angle of screenAngles(rotationDeg, pegs)) {
    // Distance from the hinge at 12 o'clock, whichever side it is on.
    const from = Math.min(angle, 360 - angle)
    if (from < closest) closest = from
  }
  if (!Number.isFinite(closest) || closest >= REACH_DEG) return 0
  return MAX_DEFLECTION_DEG * (1 - closest / REACH_DEG)
}

/** How many pegs went under the hinge between two angles. */
export function pegCrossings(fromDeg: number, toDeg: number, pegs: number[]): number {
  if (pegs.length === 0) return 0
  let swept = wrapDeg(toDeg - fromDeg)
  if (swept === 0) return 0
  // A step longer than a full turn passed every peg at least once.
  const turns = Math.floor(swept / 360)
  swept -= turns * 360

  let count = turns * pegs.length
  for (const turn of pegs) {
    const at = wrapDeg(turn * 360)
    // Where this peg sat relative to the hinge when the step began.
    const before = wrapDeg(at + fromDeg)
    const distance = wrapDeg(360 - before)
    if (distance > 0 && distance <= swept) count += 1
  }
  return count
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/wheel/flapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): work out where a peg leaves the flapper"
```

---

### Task 11: Draw the flapper and let it move

**Files:**
- Modify: `src/wheel/Wheel.tsx`
- Modify: `src/wheel/Wheel.test.tsx`
- Modify: `src/wheel/Wheel.css`

- [ ] **Step 1: Write the failing test**

Append to the `parts` describe in `src/wheel/Wheel.test.tsx`:

```ts
it('hangs a flapper above the rim when a look asks for one', () => {
  const { container } = render(<Wheel segments={segments} theme={wof} />)
  expect(container.querySelector('.wheel__flapper')).not.toBeNull()
})

it('leaves it off under the flat look', () => {
  const { container } = render(<Wheel segments={segments} theme={flat} />)
  expect(container.querySelector('.wheel__flapper')).toBeNull()
})

it('keeps the flapper outside the rotor, which turns underneath it', () => {
  const { container } = render(<Wheel segments={segments} theme={wof} />)
  const flapper = container.querySelector('.wheel__flapper')
  expect(flapper?.closest('.wheel__rotor')).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — no `.wheel__flapper` is rendered.

- [ ] **Step 3: Write the implementation**

In `src/wheel/Wheel.tsx`, add the imports:

```ts
import { useState } from 'react'
import { deflectionDeg } from './flapper'
import { useWheelAngle } from './useWheelAngle'
```

The rotor ref is a prop today, so the hook needs a node of its own to read. Add
an internal ref and hand it to the same group, keeping the caller's ref working:

```ts
  const ownRotorRef = useRef<SVGGElement>(null)
  const [deflection, setDeflection] = useState(0)
  const hasFlapper = partOn(theme, 'flapper')

  useWheelAngle(ownRotorRef, hasFlapper, (angle) => {
    setDeflection(deflectionDeg(angle, pegs))
  })
```

Attach both refs to the rotor group by replacing `ref={rotorRef}` with a
callback that feeds each:

```tsx
          <g
            className="wheel__rotor"
            transform={`rotate(${rotationDeg})`}
            ref={(node) => {
              ownRotorRef.current = node
              if (typeof rotorRef === 'function') rotorRef(node)
              else if (rotorRef) rotorRef.current = node
            }}
          >
```

Render the arm after the pointer, hinged above the rim:

```tsx
      {hasFlapper && (
        <g
          className="wheel__flapper"
          transform={`translate(0 ${-(radius + theme.metrics.rimWidth + 20)}) rotate(${deflection})`}
        >
          <rect x={-6} y={-10} width={12} height={11} rx={2.5} />
          <path
            d={`M -6.5 -1 L 6.5 -1 L 2.6 ${theme.metrics.rimWidth + 26} L -2.6 ${theme.metrics.rimWidth + 26} Z`}
          />
        </g>
      )}
```

Add `useRef` to the existing React import.

- [ ] **Step 4: Give it a spring**

In `src/wheel/Wheel.css`, the flapper's own rule already exists from Task 8. Add
the transition that makes it snap back rather than glide:

```css
.wheel__flapper {
  transform-box: view-box;
  transform-origin: 0 0;
  transition: transform 60ms ease-out;
}
```

Merge this into the existing `.wheel__flapper` rule rather than writing a second
one — the `fill` and `stroke` declarations from Task 8 stay.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/wheel/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/
git commit -m "feat(wheel): hang a flapper over the pegs and let them push it"
```

---

### Task 12: The click

**Files:**
- Create: `src/wheel/flapperAudio.ts`
- Create: `src/wheel/flapperAudio.test.ts`
- Modify: `src/wheel/Wheel.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/wheel/flapperAudio.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClicker } from './flapperAudio'

function stubAudio() {
  const gain = { gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  const osc = {
    frequency: { value: 0, setValueAtTime: vi.fn() },
    type: '',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => osc),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ctx),
  )
  return { ctx, osc, gain }
}

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
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/flapperAudio.test.ts`
Expected: FAIL — "Failed to resolve import './flapperAudio'".

- [ ] **Step 3: Write the implementation**

Create `src/wheel/flapperAudio.ts`:

```ts
/** A frame that passed more pegs than this was a stall, not a spin. */
const MAX_PER_FRAME = 8

export type Clicker = {
  /** Browsers refuse audio until a gesture; call this from one. */
  unlock(): void
  setMuted(muted: boolean): void
  /** `count` pegs went by, at `speed` degrees per millisecond. */
  click(count: number, speed: number): void
  close(): void
}

export function createClicker(): Clicker {
  let ctx: AudioContext | null = null
  let unlocked = false
  let muted = false

  const context = (): AudioContext | null => {
    if (ctx) return ctx
    const Ctor = typeof AudioContext === 'function' ? AudioContext : null
    if (!Ctor) return null
    ctx = new Ctor()
    return ctx
  }

  const tick = (at: number, speed: number) => {
    const audio = context()
    if (!audio) return
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    // A fast wheel rings higher and louder, the way a struck peg does.
    osc.frequency.setValueAtTime(900 + Math.min(speed, 3) * 400, at)
    gain.gain.setValueAtTime(0.06 + Math.min(speed, 3) * 0.02, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(at)
    osc.stop(at + 0.04)
  }

  return {
    unlock() {
      unlocked = true
      context()?.resume()
    },
    setMuted(next: boolean) {
      muted = next
    },
    click(count: number, speed: number) {
      if (!unlocked || muted || count <= 0) return
      const audio = context()
      if (!audio) return
      const fires = Math.min(count, MAX_PER_FRAME)
      // Spread them across the frame rather than stacking them on one instant,
      // which would read as one loud click instead of several.
      for (let i = 0; i < fires; i++) tick(audio.currentTime + i * 0.012, speed)
    },
    close() {
      ctx?.close()
      ctx = null
    },
  }
}
```

- [ ] **Step 4: Wire it to the wheel**

In `src/wheel/Wheel.tsx`, add the imports:

```ts
import { deflectionDeg, pegCrossings } from './flapper'
import { createClicker } from './flapperAudio'
```

Hold one clicker for the wheel's lifetime and feed it from the same sampler:

```ts
  const clickerRef = useRef<ReturnType<typeof createClicker> | null>(null)
  if (clickerRef.current === null) clickerRef.current = createClicker()

  const lastAngleRef = useRef<number | null>(null)

  useWheelAngle(ownRotorRef, hasFlapper, (angle, speed) => {
    setDeflection(deflectionDeg(angle, pegs))
    const previous = lastAngleRef.current
    lastAngleRef.current = angle
    if (previous === null || theme.flapper === 'silent') return
    clickerRef.current?.click(pegCrossings(previous, angle, pegs), speed)
  })

  useEffect(() => {
    const clicker = clickerRef.current
    const unlock = () => clicker?.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      clicker?.close()
      clickerRef.current = null
    }
  }, [])
```

Add `useEffect` to the React import.

- [ ] **Step 5: Write the failing test for the control**

A look that clicks needs a way to stop it that is not "edit the show". Append to
`src/wheel/Wheel.test.tsx`:

```ts
it('takes a mute it can be told about', () => {
  // The clicker is silent under a mute regardless of what the look asks for.
  const { container } = render(<Wheel segments={segments} theme={wof} muted />)
  expect(container.querySelector('.wheel')).not.toBeNull()
})
```

Append to `src/App.test.tsx`:

```ts
it('offers a mute once the look can make noise', async () => {
  renderApp({ ...DEFAULT_PRESET, theme: 'wof' })
  expect(await screen.findByRole('button', { name: /mute/i })).toBeInTheDocument()
})

it('offers no mute under a silent look', () => {
  renderApp({ ...DEFAULT_PRESET, theme: 'flat' })
  expect(screen.queryByRole('button', { name: /mute/i })).toBeNull()
})
```

`renderApp` is the helper `src/App.test.tsx` already uses to render with a
preset; match its existing call shape.

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no button matches /mute/.

- [ ] **Step 7: Add the prop and the control**

In `src/wheel/Wheel.tsx`, add to `WheelProps`:

```ts
  /** Silences the flapper without changing the look. */
  muted?: boolean
```

Take it in the signature with `muted = false`, and keep the clicker in step with
it:

```ts
  useEffect(() => {
    clickerRef.current?.setMuted(muted)
  }, [muted])
```

In `src/App.tsx`, hold the mute and render the toggle beside the existing
controls, only where the look can make noise:

```tsx
  const [muted, setMuted] = useState(false)
```

```tsx
        {theme.flapper !== 'silent' && (
          <button
            type="button"
            className="app__button"
            onClick={() => setMuted((on) => !on)}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
        )}
```

and pass `muted={muted}` to `Wheel`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/wheel/ src/App.tsx
git commit -m "feat(wheel): click once for each peg that goes by"
```

---

### Task 13: A catch that was planned

Read the spec's `catch` paragraph first. The deflection is folded into the
resting angle **before** the animation starts, so the pointer's answer is decided
when it always was. A catch resolved after the fact would contradict the
announced winner and break forced targets.

**Files:**
- Modify: `src/wheel/spin.ts`
- Modify: `src/wheel/spin.test.ts`

`planSpin` already picks a winner and *then* jitters a landing turn inside that
winner's arc, keeping `EDGE_INSET` clear of both edges. The catch goes in the
same place and is clamped to the same arc, so the winner cannot change — the
guard holds by construction rather than by care.

- [ ] **Step 1: Write the failing test**

Append to `src/wheel/spin.test.ts`:

```ts
import { CATCH_REACH, caughtLandingTurn } from './spin'

describe('caughtLandingTurn', () => {
  // Four pegs, at the quarters.
  const pegs = [0, 0.25, 0.5, 0.75]

  it('leaves a landing nowhere near a peg alone', () => {
    expect(caughtLandingTurn(0.375, pegs, 0.26, 0.49)).toBe(0.375)
  })

  it('pulls a landing that died against a peg off it', () => {
    const caught = caughtLandingTurn(0.2505, pegs, 0.1, 0.4)
    expect(Math.abs(caught - 0.25)).toBeCloseTo(CATCH_REACH)
  })

  it('never comes to rest on a peg, where the winner is a rounding question', () => {
    for (const peg of pegs) {
      const caught = caughtLandingTurn(peg, pegs, peg - 0.1, peg + 0.1)
      expect(Math.abs(caught - peg)).toBeCloseTo(CATCH_REACH)
    }
  })

  it('stays inside the arc it was given, so the winner cannot change', () => {
    // Only the forward side is inside the arc, so that is the side it takes.
    const caught = caughtLandingTurn(0.2505, pegs, 0.25, 0.45)
    expect(caught).toBeGreaterThanOrEqual(0.25)
    expect(caught).toBeLessThanOrEqual(0.45)
  })

  it('gives up on a wedge narrower than the arm', () => {
    // Neither side fits, so the landing stands rather than leaving the arc.
    expect(caughtLandingTurn(0.2505, pegs, 0.2504, 0.2506)).toBe(0.2505)
  })

  it('leaves everything alone with no pegs', () => {
    expect(caughtLandingTurn(0.2505, [], 0.1, 0.4)).toBe(0.2505)
  })

  it('catches a peg across the top of the wheel', () => {
    // The peg at turn 0 is also the peg at turn 1.
    const caught = caughtLandingTurn(0.999, pegs, 0.9, 0.999)
    expect(caught).toBeLessThan(0.999)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/spin.test.ts`
Expected: FAIL — "caughtLandingTurn is not a function".

- [ ] **Step 3: Write the implementation**

Append to `src/wheel/spin.ts`:

```ts
/** How far off a peg the arm holds the wheel, in turns. */
export const CATCH_REACH = 0.004

const wrapTurn = (turn: number): number => ((turn % 1) + 1) % 1

/** Shortest signed distance from `to` to `from`, in [-0.5, 0.5). */
function apart(from: number, to: number): number {
  let delta = wrapTurn(from) - wrapTurn(to)
  if (delta > 0.5) delta -= 1
  if (delta < -0.5) delta += 1
  return delta
}

/**
 * Where a wheel that died against a peg actually comes to rest. Planned rather
 * than emergent: this runs before the winner's arc is left behind, and its
 * result is clamped to that arc, so what the pointer shows and what is announced
 * cannot come apart.
 *
 * `min` and `max` are the winner's arc, already inset from its edges.
 */
export function caughtLandingTurn(
  landingTurn: number,
  pegs: number[],
  min: number,
  max: number,
): number {
  if (pegs.length === 0) return landingTurn

  let nearest = pegs[0]
  let closest = Math.abs(apart(landingTurn, pegs[0]))
  for (const peg of pegs) {
    const distance = Math.abs(apart(landingTurn, peg))
    if (distance < closest) {
      closest = distance
      nearest = peg
    }
  }
  if (closest >= CATCH_REACH) return landingTurn

  // Off the peg, on whichever side is still inside the wedge that won.
  const at = landingTurn - apart(landingTurn, nearest)
  const back = at - CATCH_REACH
  if (back >= min && back <= max) return back
  const forward = at + CATCH_REACH
  if (forward >= min && forward <= max) return forward
  // The wedge is narrower than the arm's reach. Leaving the arc would change
  // the winner, so the landing stands.
  return landingTurn
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/wheel/spin.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the plan**

Append to `src/wheel/spin.test.ts`:

```ts
it('plans a caught landing inside the winner it already chose', () => {
  const segments = [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
  ]
  const config = { durationMs: 1000, fullSpins: 3, direction: 'cw' as const, morphs: [] }
  const always = () => 'ben'
  const plan = planSpin(segments, config, always, () => 0, { kind: 'bounds' })
  expect(plan).not.toBeNull()
  // ben holds the second half, and bounds pegs sit at 0 and 0.5. An rng of 0
  // lands hard against ben's own opening peg, which the arm cannot rest on.
  expect(plan?.winnerId).toBe('ben')
  expect(plan?.landingTurn).toBeGreaterThan(0.5)
  expect(plan?.restingRotationDeg).toBe(restingRotationDeg(plan?.landingTurn ?? 0))
})

it('plans an untouched landing when no peg mode is given', () => {
  const segments = [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
  ]
  const config = { durationMs: 1000, fullSpins: 3, direction: 'cw' as const, morphs: [] }
  const plan = planSpin(segments, config, () => 'ben', () => 0)
  expect(plan?.landingTurn).toBeCloseTo(0.5 + 0.5 * 0.08)
})
```

Add `restingRotationDeg` to the existing import from `./geometry` in that file
if it is not already there.

- [ ] **Step 6: Take the peg mode in planSpin**

In `src/wheel/spin.ts`, import the peg helpers:

```ts
import { type PegMode, pegAngles } from './pegs'
```

Take the mode as a fifth argument — absent means no catch, which is every caller
that has not opted in:

```ts
export function planSpin(
  segments: Segment[],
  config: SpinConfig,
  strategy: SelectionStrategy,
  rng: Rng,
  catchPegs?: PegMode,
): SpinPlan | null {
```

Apply it where `landingTurn` is computed, before anything derives from it:

```ts
  const width = arc.end - arc.start
  const inset = width * EDGE_INSET
  const jittered = arc.start + inset + rng() * (width - inset * 2)
  // Pegs at the landing, not now: the roster it will meet is `landing`.
  const landingTurn = catchPegs
    ? caughtLandingTurn(
        jittered,
        pegAngles(catchPegs, landingArcs),
        arc.start + inset,
        arc.end - inset,
      )
    : jittered
```

- [ ] **Step 7: Pass it from the wheel's look**

`useSpin` is where the plan is made. Give it an option and forward it:

```ts
  /** Set only by a look whose flapper can catch. Absent means it cannot. */
  catchPegs?: PegMode
```

At the call site inside the spin effect, replace:

```ts
      const plan = planSpin(spinSegments, spinConfig, strategy, cryptoRng)
```

with:

```ts
      const plan = planSpin(spinSegments, spinConfig, strategy, cryptoRng, override.catchPegs)
```

`override` is the options object `useSpin` already destructures for
`resolveLate`; add `catchPegs` beside it in the same type. In `src/App.tsx`,
supply it from the resolved theme:

```ts
  catchPegs: theme.flapper === 'catch' ? theme.pegs : undefined,
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/wheel/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/wheel/ src/App.tsx
git commit -m "feat(wheel): let a peg catch a dying wheel, inside the arc that won"
```

---

### Task 14: Pick a look

Without this the feature is only reachable by editing stored JSON.

**Files:**
- Create: `src/editor/ThemePanel.tsx`
- Create: `src/editor/ThemePanel.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/editor/ThemePanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemePanel } from './ThemePanel'

describe('ThemePanel', () => {
  it('offers every registered look', () => {
    render(<ThemePanel theme={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Wheel of Fortune' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Flat' })).toBeInTheDocument()
  })

  it('reports the look that was picked', async () => {
    const onChange = vi.fn()
    render(<ThemePanel theme={undefined} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'wof')
    expect(onChange).toHaveBeenCalledWith('wof')
  })

  it('shows the flat look when a show names none', () => {
    render(<ThemePanel theme={undefined} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('flat')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/ThemePanel.test.tsx`
Expected: FAIL — "Failed to resolve import './ThemePanel'".

- [ ] **Step 3: Write the implementation**

Create `src/editor/ThemePanel.tsx`:

```tsx
import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { THEME_LIST, getTheme } from '../wheel/themes/registry'

export type ThemePanelProps = {
  theme: string | undefined
  onChange: (theme: string) => void
}

export function ThemePanel({ theme, onChange }: ThemePanelProps) {
  return (
    <PropertyPanel title="Look">
      <SelectRow
        label="Wheel"
        value={getTheme(theme ?? '')?.id ?? 'flat'}
        options={THEME_LIST.map((item) => ({ value: item.id, label: item.name }))}
        onChange={onChange}
      />
    </PropertyPanel>
  )
}
```

- [ ] **Step 4: Give the wheel its theme**

In `src/App.tsx`, resolve the preset's theme and hand it to `Wheel`:

```tsx
import { getTheme } from './wheel/themes/registry'
import { flat } from './wheel/themes/flat'
```

```tsx
  const theme = getTheme(preset.theme ?? '') ?? flat
```

```tsx
  <Wheel … theme={theme} />
```

Mount `ThemePanel` beside the existing panels in the editor, passing
`preset.theme` and an `onChange` that writes it back the way the other panels
write their slice of the preset.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Verify it in a browser**

Run: `npm run dev`, open the app, pick "Wheel of Fortune" in the Look panel, and
spin. Confirm: the rim and pegs draw, the pegs follow the roster as people join,
the flapper ticks over each peg, a click sounds after the first click on the
page, and the winner announced matches the wedge under the pointer.

- [ ] **Step 7: Commit**

```bash
git add src/editor/ src/App.tsx
git commit -m "feat(editor): pick which look the wheel wears"
```

---

## Notes for whoever executes this

- **The catch is inside `planSpin`, not after it.** `planSpin` chooses a winner
  and then jitters a landing turn within that winner's arc; the catch adjusts
  that same turn and is clamped to that same arc. The winner therefore cannot
  change, and the selection guard holds by construction. Do not move it
  downstream to the resting angle, where it would need care instead.
- **A theme's flapper mode is a ladder.** `catch` clicks too; only `silent` is
  silent. Task 12 gates the click on `theme.flapper === 'silent'` for that
  reason.
- **The wedge is rewritten every frame.** Nothing inside `.wheel__wedge` may
  carry an SVG `filter`. Task 7 pins this with a test; do not relax it to get a
  drop shadow on a panel. Use a gradient or a stroke.
- **jsdom paints nothing.** A renamed token would leave the suite green and the
  wheel unpainted, which is why Task 8's test reads `Wheel.css` as a `?raw`
  import. The vitest config already narrows its CSS stub for that, and the
  `include` pattern must not anchor with `$` — `?raw` makes the module id
  `Wheel.css?raw`.
- **Mutation-test each load-bearing rule before believing a task is done.** The
  wedge presence plan lost a day to a prescribed test list that all used the
  same value at both ends; a rule with no test that fails when you break it is
  not covered.
