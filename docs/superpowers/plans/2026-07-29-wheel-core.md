# Wheel Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weighted spinning wheel that renders correctly at every weight distribution, picks winners against the landing weight distribution, and animates segment properties mid-spin.

**Architecture:** Pure functions do all the math (weights → arcs → SVG paths → rotation angle), and a thin React layer renders them. The winner is chosen before the animation starts, and the rotation target is computed from the weight distribution as it will be *at landing* — not at launch — so mid-spin weight changes stay consistent. Animation runs on two independent tracks: rotation via the Web Animations API on a single `<g>`, geometry morphing via `requestAnimationFrame` regenerating paths.

**Tech Stack:** Vite, React 19, TypeScript, Vitest + jsdom, Testing Library, Biome.

**Scope:** This plan covers build steps 1–2 of the design spec (`docs/superpowers/specs/2026-07-29-wod-design.md`). Out of scope, each getting its own later plan: the composer and sources, presets and `localStorage`, reveals and skins, the near-miss, the admin window and rig channel, live-fired morphs with in-flight re-targeting, and the Meet roster source.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/wheel/types.ts` | Shared type definitions. No logic. |
| `src/wheel/geometry.ts` | Weights → arcs → SVG paths, and the rotation ↔ pointer mapping. |
| `src/wheel/selection.ts` | Choosing a winner from weighted candidates. |
| `src/wheel/morph.ts` | Sampling morph keyframes and applying them to segments. |
| `src/wheel/label.ts` | Fitting label text into an arc. |
| `src/wheel/spin.ts` | `planSpin` — ties selection + morphs + geometry into one pure result. |
| `src/wheel/Wheel.tsx` | Static SVG rendering of a segment array. No animation. |
| `src/wheel/Wheel.css` | All wheel styling. |
| `src/wheel/useSpin.ts` | Thin animation shell around `planSpin`. Not unit tested. |
| `src/App.tsx` | Demo harness with hardcoded segments including the beer wedge. |

Each math module is independently testable with no DOM. `useSpin.ts` is deliberately the only file containing untested code, and it is kept as thin as possible for that reason.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vitest.setup.ts`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "wod",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "biome check --write ."
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
// Import defineConfig from vitest/config, not vite — the plain vite version
// does not know about the `test` key and rejects it as an unknown property.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
  },
})
```

- [ ] **Step 4: Create `src/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" }
  }
}
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>wod</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Create a placeholder `src/App.tsx`**

```tsx
export function App() {
  return <main>wod</main>
}
```

- [ ] **Step 9: Create `.gitignore`**

```
node_modules
dist
.DS_Store
*.local
```

- [ ] **Step 10: Install and verify the toolchain runs**

Run: `npm install && npx tsc --noEmit && npm test -- --passWithNoTests`

Expected: `npm install` succeeds, `tsc` reports no errors, and Vitest starts and reports **no test files found** while still exiting 0. This confirms the toolchain is wired up before any tests exist. (`--passWithNoTests` is needed only here — Vitest exits non-zero on an empty suite by default, which is the behavior we want for every later task.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react 19 + vitest project"
```

---

## Task 2: Core types

**Files:**
- Create: `src/wheel/types.ts`

There are no tests in this task — it declares types only, which the compiler checks. Every later task depends on these exact names.

- [ ] **Step 1: Create `src/wheel/types.ts`**

```ts
export type Media = { kind: 'emoji' | 'image' | 'gif'; value: string }

export type Reveal = {
  headline?: string
  body?: string
  media?: Media
  sound?: string
  effect?: 'confetti' | 'none'
  holdMs?: number
}

export type Segment = {
  id: string
  label: string
  /** Relative, not a percentage. Normalized at render time. Zero means present but invisible. */
  weight: number
  color?: string
  media?: Media
  reveal?: Reveal
}

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export type MorphKeyframe = {
  /** Position within the morph's own duration, 0..1. */
  at: number
  weight?: number
  color?: string
  label?: string
  media?: Media
}

export type Morph = {
  segmentId: string
  keyframes: MorphKeyframe[]
  durationMs: number
  easing?: EasingName
}

export type SpinConfig = {
  durationMs: number
  fullSpins: number
  /** CSS easing string, handed to the Web Animations API. */
  easing: string
  morphs: Morph[]
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/wheel/types.ts
git commit -m "feat(wheel): add core segment and morph types"
```

---

## Task 3: Weight normalization and arcs

Converts a segment list into arcs measured in **turns** (0..1, where 0 is 12 o'clock and values increase clockwise). Turns are used internally instead of degrees or radians because the math stays exact and conversion happens only at the SVG boundary.

**Files:**
- Create: `src/wheel/geometry.ts`
- Test: `src/wheel/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { arcs, normalizeWeights } from './geometry'

describe('normalizeWeights', () => {
  it('returns fractions summing to one', () => {
    const result = normalizeWeights([
      { id: 'a', weight: 1 },
      { id: 'b', weight: 3 },
    ])
    expect(result).toEqual([0.25, 0.75])
  })

  it('falls back to equal weights when the total is zero', () => {
    const result = normalizeWeights([
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
    ])
    expect(result).toEqual([0.5, 0.5])
  })

  it('treats negative and non-finite weights as zero', () => {
    const result = normalizeWeights([
      { id: 'a', weight: -5 },
      { id: 'b', weight: Number.NaN },
      { id: 'c', weight: 2 },
    ])
    expect(result).toEqual([0, 0, 1])
  })

  it('returns an empty array for no segments', () => {
    expect(normalizeWeights([])).toEqual([])
  })
})

describe('arcs', () => {
  it('lays segments out consecutively from zero to one', () => {
    const result = arcs([
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
    ])
    expect(result).toEqual([
      { id: 'a', start: 0, end: 0.5 },
      { id: 'b', start: 0.5, end: 1 },
    ])
  })

  it('gives a zero-weight segment zero width', () => {
    const result = arcs([
      { id: 'a', weight: 1 },
      { id: 'ghost', weight: 0 },
    ])
    const ghost = result.find((a) => a.id === 'ghost')
    expect(ghost?.end).toBe(ghost?.start)
  })

  it('gives a single full-weight segment the entire circle', () => {
    const result = arcs([
      { id: 'beer', weight: 1 },
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
    ])
    expect(result[0]).toEqual({ id: 'beer', start: 0, end: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- geometry`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 3: Write the implementation**

```ts
export type Weighted = { id: string; weight: number }

/** An arc measured in turns: 0 is 12 o'clock, increasing clockwise to 1. */
export type Arc = { id: string; start: number; end: number }

export function normalizeWeights(items: Weighted[]): number[] {
  if (items.length === 0) return []
  const safe = items.map((i) => (Number.isFinite(i.weight) && i.weight > 0 ? i.weight : 0))
  const total = safe.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return items.map(() => 1 / items.length)
  return safe.map((w) => w / total)
}

export function arcs(items: Weighted[]): Arc[] {
  const fractions = normalizeWeights(items)
  const out: Arc[] = []
  let cursor = 0
  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1
    // Snap the final non-empty arc to exactly 1 so float drift cannot leave a gap
    // at the top of the wheel. A zero-weight final segment must stay zero-width.
    const end = isLast && fractions[i] > 0 ? 1 : cursor + fractions[i]
    out.push({ id: items[i].id, start: cursor, end })
    cursor = end
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- geometry`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/geometry.ts src/wheel/geometry.test.ts
git commit -m "feat(wheel): normalize weights into arcs"
```

---

## Task 4: SVG arc paths, including the degenerate cases

The 360° case is the one that matters most: it is the end state of the headline gag, and naive arc generation renders it as nothing because the start and end points coincide.

**Files:**
- Modify: `src/wheel/geometry.ts`
- Modify: `src/wheel/geometry.test.ts`

- [ ] **Step 1: Write the failing tests (append to `geometry.test.ts`)**

```ts
import { arcPath } from './geometry'

describe('arcPath', () => {
  it('renders nothing for a zero-width arc', () => {
    expect(arcPath(0.5, 0.5, 100)).toBe('')
  })

  it('renders nothing for a negative-width arc', () => {
    expect(arcPath(0.7, 0.3, 100)).toBe('')
  })

  it('renders a full ring using two arc commands when one segment holds everything', () => {
    const d = arcPath(0, 1, 100)
    expect(d).not.toBe('')
    const arcCommands = d.match(/A/g) ?? []
    expect(arcCommands).toHaveLength(2)
  })

  it('sets the large-arc flag for arcs wider than half the circle', () => {
    expect(arcPath(0, 0.75, 100)).toMatch(/A 100 100 0 1 1/)
    expect(arcPath(0, 0.25, 100)).toMatch(/A 100 100 0 0 1/)
  })

  it('starts a quarter arc at twelve o clock and ends at three o clock', () => {
    const d = arcPath(0, 0.25, 100)
    expect(d).toContain('L 0 -100')
    expect(d).toContain('100 0')
  })

  it('never emits NaN for any weight distribution', () => {
    for (const [start, end] of [
      [0, 0],
      [0, 1],
      [0, 0.0001],
      [0.9999, 1],
      [0.5, 0.5],
    ]) {
      expect(arcPath(start, end, 100)).not.toContain('NaN')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- geometry`
Expected: FAIL — `arcPath` is not exported.

- [ ] **Step 3: Write the implementation (append to `geometry.ts`)**

```ts
const TAU = Math.PI * 2

const round = (n: number): number => {
  const r = Number(n.toFixed(3))
  return Object.is(r, -0) ? 0 : r
}

/** Turn 0 is 12 o'clock; turns increase clockwise. SVG y grows downward. */
function pointOnCircle(turn: number, radius: number): [number, number] {
  const angle = turn * TAU
  return [round(radius * Math.sin(angle)), round(-radius * Math.cos(angle))]
}

export function arcPath(start: number, end: number, radius: number): string {
  const width = end - start
  if (!(width > 0)) return ''

  // A full circle cannot be drawn as one arc: its start and end points are the
  // same, and SVG renders that as nothing. Two half-arcs instead.
  if (width >= 1) {
    const r = round(radius)
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`
  }

  const [x0, y0] = pointOnCircle(start, radius)
  const [x1, y1] = pointOnCircle(end, radius)
  const largeArc = width > 0.5 ? 1 : 0
  const r = round(radius)
  return `M 0 0 L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- geometry`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/geometry.ts src/wheel/geometry.test.ts
git commit -m "feat(wheel): generate arc paths incl. full-circle and zero-width cases"
```

---

## Task 5: Pointer mapping — the exact-inverse property

This is the highest-value test in the codebase. The bug it prevents is the pointer visually landing on one slice while a different slice is reported as the winner.

**Files:**
- Modify: `src/wheel/geometry.ts`
- Modify: `src/wheel/geometry.test.ts`

- [ ] **Step 1: Write the failing tests (append to `geometry.test.ts`)**

```ts
import { angleToSegment, pointerTurn, targetRotationDeg } from './geometry'

describe('angleToSegment', () => {
  const list = arcs([
    { id: 'a', weight: 1 },
    { id: 'b', weight: 1 },
    { id: 'c', weight: 2 },
  ])

  it('finds the segment containing a turn', () => {
    expect(angleToSegment(list, 0.1)).toBe('a')
    expect(angleToSegment(list, 0.3)).toBe('b')
    expect(angleToSegment(list, 0.7)).toBe('c')
  })

  it('treats arc start as inside and arc end as outside', () => {
    expect(angleToSegment(list, 0.25)).toBe('b')
  })

  it('wraps turns outside the unit range', () => {
    expect(angleToSegment(list, 1.1)).toBe('a')
    expect(angleToSegment(list, -0.9)).toBe('a')
  })

  it('never returns a zero-width segment', () => {
    const withGhost = arcs([
      { id: 'real', weight: 1 },
      { id: 'ghost', weight: 0 },
    ])
    for (let t = 0; t < 1; t += 0.01) {
      expect(angleToSegment(withGhost, t)).toBe('real')
    }
  })

  it('returns null when there is nothing to land on', () => {
    expect(angleToSegment([], 0.5)).toBeNull()
  })
})

describe('rotation mapping', () => {
  it('is the exact inverse of the pointer mapping', () => {
    for (const turn of [0, 0.001, 0.25, 0.5, 0.75, 0.999]) {
      for (const spins of [0, 1, 5]) {
        expect(pointerTurn(targetRotationDeg(turn, spins))).toBeCloseTo(turn, 9)
      }
    }
  })

  it('adds a full revolution per requested spin', () => {
    expect(targetRotationDeg(0, 5)).toBe(1800)
  })

  it('rotates counter to the turn so the pointer meets it', () => {
    expect(targetRotationDeg(0.25, 0)).toBe(270)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- geometry`
Expected: FAIL — `angleToSegment` is not exported.

- [ ] **Step 3: Write the implementation (append to `geometry.ts`)**

```ts
const wrapTurn = (turn: number): number => ((turn % 1) + 1) % 1

export function angleToSegment(list: Arc[], turn: number): string | null {
  const t = wrapTurn(turn)
  for (const arc of list) {
    if (arc.end > arc.start && t >= arc.start && t < arc.end) return arc.id
  }
  // Float drift can leave a sliver at the very top uncovered. Fall back to the
  // last segment that actually has width rather than reporting no winner.
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].end > list[i].start) return list[i].id
  }
  return null
}

/**
 * The wheel rotates; the pointer is fixed at 12 o'clock. To bring wheel-local
 * `landingTurn` under the pointer, rotate by its complement, plus whole
 * revolutions for the spin.
 */
export function targetRotationDeg(landingTurn: number, fullSpins: number): number {
  const t = wrapTurn(landingTurn)
  return fullSpins * 360 + ((360 - t * 360) % 360)
}

/** Which wheel-local turn currently sits under the pointer. */
export function pointerTurn(rotationDeg: number): number {
  return wrapTurn(-rotationDeg / 360)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- geometry`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/geometry.ts src/wheel/geometry.test.ts
git commit -m "feat(wheel): map rotation to pointer position with inverse guarantee"
```

---

## Task 6: Selection

The winner is chosen before any animation. Rigging is a strategy, not a special case, and a rig aimed at a segment with no weight silently falls back to a fair draw.

**Files:**
- Create: `src/wheel/selection.ts`
- Test: `src/wheel/selection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { forced, weightedRandom } from './selection'
import type { Rng } from './selection'

/** Deterministic generator so weight fidelity is reproducible in tests. */
function lcg(seed: number): Rng {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('weightedRandom', () => {
  it('returns null when there are no candidates', () => {
    expect(weightedRandom([], lcg(1))).toBeNull()
  })

  it('always returns the only weighted candidate', () => {
    const result = weightedRandom(
      [
        { id: 'only', weight: 1 },
        { id: 'ghost', weight: 0 },
      ],
      lcg(7),
    )
    expect(result).toBe('only')
  })

  it('never returns a zero-weight candidate', () => {
    const rng = lcg(42)
    const candidates = [
      { id: 'a', weight: 1 },
      { id: 'ghost', weight: 0 },
      { id: 'b', weight: 1 },
    ]
    for (let i = 0; i < 5000; i++) {
      expect(weightedRandom(candidates, rng)).not.toBe('ghost')
    }
  })

  it('honors weights proportionally', () => {
    const rng = lcg(99)
    const candidates = [
      { id: 'common', weight: 95 },
      { id: 'rare', weight: 5 },
    ]
    const counts: Record<string, number> = { common: 0, rare: 0 }
    const draws = 100_000
    for (let i = 0; i < draws; i++) {
      const winner = weightedRandom(candidates, rng)
      if (winner) counts[winner]++
    }
    expect(counts.rare / draws).toBeGreaterThan(0.04)
    expect(counts.rare / draws).toBeLessThan(0.06)
  })

  it('selects the first candidate at the bottom of the range', () => {
    expect(weightedRandom([{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }], () => 0)).toBe('a')
  })

  it('selects the last candidate at the top of the range', () => {
    const almostOne = () => 1 - Number.EPSILON
    expect(weightedRandom([{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }], almostOne)).toBe('b')
  })
})

describe('forced', () => {
  it('returns its target when the target still has weight', () => {
    const result = forced('rigged')([
      { id: 'fair', weight: 10 },
      { id: 'rigged', weight: 1 },
    ], lcg(3))
    expect(result).toBe('rigged')
  })

  it('falls back to a fair draw when the target has been zeroed out', () => {
    const result = forced('gone')([
      { id: 'here', weight: 1 },
      { id: 'gone', weight: 0 },
    ], lcg(3))
    expect(result).toBe('here')
  })

  it('falls back to a fair draw when the target no longer exists', () => {
    const result = forced('missing')([{ id: 'here', weight: 1 }], lcg(3))
    expect(result).toBe('here')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- selection`
Expected: FAIL — cannot resolve `./selection`.

- [ ] **Step 3: Write the implementation**

```ts
import { normalizeWeights } from './geometry'
import type { Weighted } from './geometry'

/** Returns a float in [0, 1). */
export type Rng = () => number

export type SelectionStrategy = (candidates: Weighted[], rng: Rng) => string | null

export const cryptoRng: Rng = () => {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / 2 ** 32
}

export const weightedRandom: SelectionStrategy = (candidates, rng) => {
  if (candidates.length === 0) return null
  const fractions = normalizeWeights(candidates)
  const roll = rng()
  let cumulative = 0
  for (let i = 0; i < candidates.length; i++) {
    cumulative += fractions[i]
    // Strictly greater, so a zero-weight candidate can never win: it does not
    // advance the cumulative total past whatever the previous one already cleared.
    if (cumulative > roll) return candidates[i].id
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (fractions[i] > 0) return candidates[i].id
  }
  return null
}

/** The rig. Degrades to a fair draw rather than erroring mid-spin. */
export function forced(segmentId: string): SelectionStrategy {
  return (candidates, rng) => {
    const target = candidates.find((c) => c.id === segmentId)
    if (target && target.weight > 0) return segmentId
    return weightedRandom(candidates, rng)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- selection`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/selection.ts src/wheel/selection.test.ts
git commit -m "feat(wheel): add weighted and forced selection strategies"
```

---

## Task 7: Morph sampling

Morphs animate weight, color, label, and media during a spin. Weight and color interpolate; label and media step at their keyframe, because interpolating text is meaningless.

**Files:**
- Create: `src/wheel/morph.ts`
- Test: `src/wheel/morph.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { applyMorphs, landingSegments, lerpColor, morphProgress, parseHex } from './morph'
import type { Morph, Segment } from './types'

const base: Segment[] = [
  { id: 'beer', label: 'free beer', weight: 1 },
  { id: 'dave', label: 'Dave', weight: 99 },
]

const swell: Morph = {
  segmentId: 'beer',
  durationMs: 1000,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 99 },
  ],
}

const vanish: Morph = {
  segmentId: 'dave',
  durationMs: 1000,
  keyframes: [
    { at: 0, weight: 99 },
    { at: 1, weight: 0 },
  ],
}

describe('parseHex', () => {
  it('expands shorthand hex', () => {
    expect(parseHex('#f00')).toEqual([255, 0, 0])
  })

  it('parses full hex', () => {
    expect(parseHex('#00ff80')).toEqual([0, 255, 128])
  })

  it('returns null for anything else', () => {
    expect(parseHex('rebeccapurple')).toBeNull()
  })
})

describe('lerpColor', () => {
  it('interpolates hex colors', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('steps rather than blending when a color is not hex', () => {
    expect(lerpColor('red', 'blue', 0.4)).toBe('red')
    expect(lerpColor('red', 'blue', 1)).toBe('blue')
  })
})

describe('morphProgress', () => {
  it('clamps below zero and above one', () => {
    expect(morphProgress(swell, -100)).toBe(0)
    expect(morphProgress(swell, 999999)).toBe(1)
  })

  it('is linear by default', () => {
    expect(morphProgress(swell, 500)).toBeCloseTo(0.5)
  })

  it('applies a named easing', () => {
    const eased: Morph = { ...swell, easing: 'easeIn' }
    expect(morphProgress(eased, 500)).toBeCloseTo(0.25)
  })

  it('completes immediately for a zero duration', () => {
    expect(morphProgress({ ...swell, durationMs: 0 }, 0)).toBe(1)
  })
})

describe('applyMorphs', () => {
  it('returns the input untouched when there are no morphs', () => {
    expect(applyMorphs(base, [], 500)).toBe(base)
  })

  it('interpolates weight at the midpoint', () => {
    const result = applyMorphs(base, [swell], 500)
    expect(result[0].weight).toBeCloseTo(50)
  })

  it('leaves unmorphed segments alone', () => {
    const result = applyMorphs(base, [swell], 500)
    expect(result[1].weight).toBe(99)
  })

  it('holds the final value past the morph duration', () => {
    const result = applyMorphs(base, [swell], 5000)
    expect(result[0].weight).toBe(99)
  })

  it('steps labels instead of interpolating them', () => {
    const relabel: Morph = {
      segmentId: 'dave',
      durationMs: 1000,
      keyframes: [
        { at: 0, label: 'Dave' },
        { at: 0.5, label: 'Dave (sorry)' },
      ],
    }
    expect(applyMorphs(base, [relabel], 200)[1].label).toBe('Dave')
    expect(applyMorphs(base, [relabel], 800)[1].label).toBe('Dave (sorry)')
  })

  it('uses the segment base value when a morph does not mention a property', () => {
    const result = applyMorphs(base, [swell], 500)
    expect(result[0].label).toBe('free beer')
  })
})

describe('landingSegments', () => {
  it('resolves the distribution the pointer will actually meet', () => {
    const landing = landingSegments(base, [swell, vanish], 1000)
    expect(landing.find((s) => s.id === 'beer')?.weight).toBe(99)
    expect(landing.find((s) => s.id === 'dave')?.weight).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- morph`
Expected: FAIL — cannot resolve `./morph`.

- [ ] **Step 3: Write the implementation**

```ts
import type { EasingName, Media, Morph, MorphKeyframe, Segment } from './types'

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
}

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

export function lerpColor(from: string, to: string, t: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  if (!a || !b) return t < 1 ? from : to
  const channels = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function morphProgress(morph: Morph, elapsedMs: number): number {
  const raw = morph.durationMs <= 0 ? 1 : elapsedMs / morph.durationMs
  const clamped = Math.min(1, Math.max(0, raw))
  return EASINGS[morph.easing ?? 'linear'](clamped)
}

type Defined<K extends keyof MorphKeyframe> = MorphKeyframe & Record<K, NonNullable<MorphKeyframe[K]>>

function pointsFor<K extends keyof MorphKeyframe>(
  keyframes: MorphKeyframe[],
  key: K,
): Defined<K>[] {
  return [...keyframes]
    .sort((a, b) => a.at - b.at)
    .filter((k): k is Defined<K> => k[key] !== undefined)
}

/** Finds the pair of keyframes bracketing `p`, plus how far between them it sits. */
function bracket<K extends keyof MorphKeyframe>(
  points: Defined<K>[],
  p: number,
): { from: Defined<K>; to: Defined<K>; t: number } | null {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  if (p <= first.at) return { from: first, to: first, t: 0 }
  if (p >= last.at) return { from: last, to: last, t: 1 }
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

function sampleWeight(keyframes: MorphKeyframe[], p: number): number | undefined {
  const found = bracket(pointsFor(keyframes, 'weight'), p)
  if (!found) return undefined
  return found.from.weight + (found.to.weight - found.from.weight) * found.t
}

function sampleColor(keyframes: MorphKeyframe[], p: number): string | undefined {
  const found = bracket(pointsFor(keyframes, 'color'), p)
  if (!found) return undefined
  return lerpColor(found.from.color, found.to.color, found.t)
}

/** Discrete properties take the most recent keyframe rather than blending. */
function sampleStep<K extends 'label' | 'media'>(
  keyframes: MorphKeyframe[],
  key: K,
  p: number,
): MorphKeyframe[K] | undefined {
  const points = pointsFor(keyframes, key)
  if (points.length === 0) return undefined
  let value = points[0][key]
  for (const point of points) {
    if (point.at <= p) value = point[key]
  }
  return value
}

export function applyMorphs(segments: Segment[], morphs: Morph[], elapsedMs: number): Segment[] {
  if (morphs.length === 0) return segments
  return segments.map((segment) => {
    const relevant = morphs.filter((m) => m.segmentId === segment.id)
    if (relevant.length === 0) return segment
    const out: Segment = { ...segment }
    for (const morph of relevant) {
      const p = morphProgress(morph, elapsedMs)
      const weight = sampleWeight(morph.keyframes, p)
      if (weight !== undefined) out.weight = weight
      const color = sampleColor(morph.keyframes, p)
      if (color !== undefined) out.color = color
      const label = sampleStep(morph.keyframes, 'label', p)
      if (label !== undefined) out.label = label as string
      const media = sampleStep(morph.keyframes, 'media', p)
      if (media !== undefined) out.media = media as Media
    }
    return out
  })
}

/**
 * The weight distribution the pointer will meet when the wheel stops. Selection
 * samples this, never the launch distribution.
 */
export function landingSegments(
  segments: Segment[],
  morphs: Morph[],
  spinDurationMs: number,
): Segment[] {
  return applyMorphs(segments, morphs, spinDurationMs)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- morph`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/morph.ts src/wheel/morph.test.ts
git commit -m "feat(wheel): sample and apply mid-spin morphs"
```

---

## Task 8: Label fitting

A pure function so the fit is testable without measuring text in a browser. It is deliberately an estimate — visual tuning happens later against the real thing.

**Files:**
- Create: `src/wheel/label.ts`
- Test: `src/wheel/label.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { fitLabel } from './label'

describe('fitLabel', () => {
  it('returns null for a zero-width arc', () => {
    expect(fitLabel('Dave', 0, 200)).toBeNull()
  })

  it('returns null for empty text', () => {
    expect(fitLabel('', 0.25, 200)).toBeNull()
  })

  it('returns null when the arc is too narrow to be legible', () => {
    expect(fitLabel('free beer', 0.0005, 200)).toBeNull()
  })

  it('returns the full text when it fits', () => {
    const fitted = fitLabel('Dave', 0.25, 200)
    expect(fitted?.text).toBe('Dave')
    expect(fitted?.fontSize).toBeGreaterThan(0)
  })

  it('truncates with an ellipsis when the text is too long', () => {
    const fitted = fitLabel(
      'my boss buys the team beer for the next decade',
      0.25,
      200,
    )
    expect(fitted?.text.endsWith('…')).toBe(true)
    expect(fitted?.text.length).toBeLessThan(46)
  })

  it('never exceeds the base font size on a wide arc', () => {
    const fitted = fitLabel('Dave', 1, 200)
    expect(fitted?.fontSize).toBeLessThanOrEqual(18)
  })

  it('scales the font down as the arc narrows', () => {
    // 0.01 turns is narrow enough to force a reduced size but still wide
    // enough to stay above the legibility floor.
    const wide = fitLabel('Dave', 0.5, 200)
    const narrow = fitLabel('Dave', 0.01, 200)
    expect(narrow).not.toBeNull()
    expect(narrow?.fontSize).toBeLessThan(wide?.fontSize ?? 0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- label`
Expected: FAIL — cannot resolve `./label`.

- [ ] **Step 3: Write the implementation**

```ts
export type FittedLabel = { text: string; fontSize: number }

const BASE_FONT_SIZE = 18
const MIN_FONT_SIZE = 8
/** Rough average glyph width as a fraction of font size, for a sans-serif face. */
const CHAR_WIDTH_RATIO = 0.55
/** Fraction of the radius available for text to run along. */
const RADIAL_TEXT_FRACTION = 0.75

export function fitLabel(text: string, arcTurns: number, radius: number): FittedLabel | null {
  if (!(arcTurns > 0) || text.length === 0) return null

  // The chord across the arc at the rim bounds how tall the text can be.
  const chord = 2 * radius * Math.sin(Math.PI * Math.min(arcTurns, 0.5))
  const fontSize = Math.min(BASE_FONT_SIZE, chord * 0.8)
  if (fontSize < MIN_FONT_SIZE) return null

  const available = radius * RADIAL_TEXT_FRACTION
  const maxChars = Math.floor(available / (fontSize * CHAR_WIDTH_RATIO))
  if (maxChars <= 0) return null
  if (text.length <= maxChars) return { text, fontSize }
  if (maxChars === 1) return { text: '…', fontSize }
  return { text: `${text.slice(0, maxChars - 1)}…`, fontSize }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- label`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/label.ts src/wheel/label.test.ts
git commit -m "feat(wheel): fit label text to arc width"
```

---

## Task 9: planSpin — the integration point

This is where the design's central rule becomes executable: resolve landing weights, pick the winner against *those*, and compute a rotation that lands inside the winner's arc **in the landing geometry**. Everything animated is derived from this pure result.

**Files:**
- Create: `src/wheel/spin.ts`
- Test: `src/wheel/spin.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { angleToSegment, arcs, pointerTurn } from './geometry'
import { landingSegments } from './morph'
import { forced, weightedRandom } from './selection'
import type { Rng } from './selection'
import { planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

function lcg(seed: number): Rng {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const people: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1 },
  { id: 'b', label: 'Ben', weight: 1 },
  { id: 'c', label: 'Cal', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0.05 },
]

const config: SpinConfig = {
  durationMs: 4000,
  fullSpins: 5,
  easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
  morphs: [],
}

const beerSwallowsTheWheel: Morph = {
  segmentId: 'beer',
  durationMs: 4000,
  keyframes: [
    { at: 0, weight: 0.05 },
    { at: 1, weight: 1 },
  ],
}

const everyoneElseVanishes: Morph[] = ['a', 'b', 'c'].map((id) => ({
  segmentId: id,
  durationMs: 4000,
  keyframes: [
    { at: 0, weight: 1 },
    { at: 1, weight: 0 },
  ],
}))

describe('planSpin', () => {
  it('returns null when there is nothing to spin', () => {
    expect(planSpin([], config, weightedRandom, lcg(1))).toBeNull()
  })

  it('lands inside the winner arc under the landing geometry', () => {
    const rng = lcg(11)
    for (let i = 0; i < 500; i++) {
      const plan = planSpin(people, config, weightedRandom, rng)
      expect(plan).not.toBeNull()
      if (!plan) continue
      const landing = arcs(landingSegments(people, config.morphs, config.durationMs))
      expect(angleToSegment(landing, pointerTurn(plan.targetRotationDeg))).toBe(plan.winnerId)
    }
  })

  it('honors the requested number of full spins', () => {
    const plan = planSpin(people, config, weightedRandom, lcg(5))
    expect(plan?.targetRotationDeg).toBeGreaterThanOrEqual(5 * 360)
    expect(plan?.targetRotationDeg).toBeLessThan(6 * 360)
  })

  it('lands on the winner even when the geometry morphs during the spin', () => {
    const morphed: SpinConfig = {
      ...config,
      morphs: [beerSwallowsTheWheel, ...everyoneElseVanishes],
    }
    const plan = planSpin(people, morphed, weightedRandom, lcg(21))
    expect(plan).not.toBeNull()
    if (!plan) return
    const landing = arcs(landingSegments(people, morphed.morphs, morphed.durationMs))
    expect(angleToSegment(landing, pointerTurn(plan.targetRotationDeg))).toBe(plan.winnerId)
  })

  it('guarantees a wedge that grows to fill the circle wins', () => {
    const morphed: SpinConfig = {
      ...config,
      morphs: [beerSwallowsTheWheel, ...everyoneElseVanishes],
    }
    const rng = lcg(33)
    for (let i = 0; i < 200; i++) {
      expect(planSpin(people, morphed, weightedRandom, rng)?.winnerId).toBe('beer')
    }
  })

  it('never selects a segment that morphs to zero', () => {
    const morphed: SpinConfig = { ...config, morphs: everyoneElseVanishes }
    const rng = lcg(44)
    for (let i = 0; i < 200; i++) {
      expect(planSpin(people, morphed, weightedRandom, rng)?.winnerId).toBe('beer')
    }
  })

  it('lands on a rigged target', () => {
    const plan = planSpin(people, config, forced('beer'), lcg(8))
    expect(plan?.winnerId).toBe('beer')
    const landing = arcs(landingSegments(people, config.morphs, config.durationMs))
    expect(angleToSegment(landing, pointerTurn(plan?.targetRotationDeg ?? 0))).toBe('beer')
  })

  it('keeps the landing point away from the arc edges', () => {
    const rng = lcg(64)
    for (let i = 0; i < 300; i++) {
      const plan = planSpin(people, config, weightedRandom, rng)
      if (!plan) continue
      const landing = arcs(landingSegments(people, config.morphs, config.durationMs))
      const arc = landing.find((a) => a.id === plan.winnerId)
      if (!arc) throw new Error('winner has no arc')
      const width = arc.end - arc.start
      expect(plan.landingTurn).toBeGreaterThan(arc.start + width * 0.05)
      expect(plan.landingTurn).toBeLessThan(arc.end - width * 0.05)
    }
  })

  it('varies the landing point rather than always centering it', () => {
    const rng = lcg(77)
    const rigged = forced('a')
    const turns = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const plan = planSpin(people, config, rigged, rng)
      if (plan) turns.add(plan.landingTurn)
    }
    expect(turns.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- spin`
Expected: FAIL — cannot resolve `./spin`.

- [ ] **Step 3: Write the implementation**

```ts
import { arcs, targetRotationDeg } from './geometry'
import { landingSegments } from './morph'
import type { Rng, SelectionStrategy } from './selection'
import type { Segment, SpinConfig } from './types'

export type SpinPlan = {
  winnerId: string
  /** Wheel-local turn that will sit under the pointer when the wheel stops. */
  landingTurn: number
  targetRotationDeg: number
  /** The segments as they will be at the moment of landing. */
  landing: Segment[]
}

/**
 * Fraction of the winning arc kept clear at each edge, so the pointer never
 * settles on a boundary where rounding could flip which segment it reads as.
 */
const EDGE_INSET = 0.08

export function planSpin(
  segments: Segment[],
  config: SpinConfig,
  strategy: SelectionStrategy,
  rng: Rng,
): SpinPlan | null {
  if (segments.length === 0) return null

  // Sample the distribution the pointer will actually meet, not the one on
  // screen right now. With morphs running, these are different wheels.
  const landing = landingSegments(segments, config.morphs, config.durationMs)
  const winnerId = strategy(landing, rng)
  if (!winnerId) return null

  const landingArcs = arcs(landing)
  const arc = landingArcs.find((a) => a.id === winnerId)
  if (!arc || !(arc.end > arc.start)) return null

  // Jitter within the arc. Always landing dead center would make repeated
  // spins look identical and give away that the outcome is precomputed.
  const width = arc.end - arc.start
  const inset = width * EDGE_INSET
  const landingTurn = arc.start + inset + rng() * (width - inset * 2)

  return {
    winnerId,
    landingTurn,
    targetRotationDeg: targetRotationDeg(landingTurn, config.fullSpins),
    landing,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- spin`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 62 tests across 5 files.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/spin.ts src/wheel/spin.test.ts
git commit -m "feat(wheel): plan spins against the landing weight distribution"
```

---

## Task 10: Wheel component

Static rendering only — given segments and a rotation, draw them. No animation lives here.

Note on styling: segment fill uses the SVG `fill` **presentation attribute**, not an inline style rule. Presentation attributes carry the lowest CSS specificity, so a stylesheet can still override them without `!important`, and no `style={{...}}` is needed for data-driven color.

**Files:**
- Create: `src/wheel/Wheel.tsx`, `src/wheel/Wheel.css`
- Test: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Wheel } from './Wheel'
import type { Segment } from './types'

const segments: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1, color: '#ff0000' },
  { id: 'b', label: 'Ben', weight: 1, color: '#00ff00' },
]

describe('Wheel', () => {
  it('renders one path per weighted segment', () => {
    const { container } = render(<Wheel segments={segments} />)
    expect(container.querySelectorAll('path.wheel__segment')).toHaveLength(2)
  })

  it('renders segment labels', () => {
    render(<Wheel segments={segments} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Ben')).toBeInTheDocument()
  })

  it('applies segment color as a fill attribute rather than an inline style', () => {
    const { container } = render(<Wheel segments={segments} />)
    const first = container.querySelector('path.wheel__segment')
    expect(first?.getAttribute('fill')).toBe('#ff0000')
    expect(first?.getAttribute('style')).toBeNull()
  })

  it('omits zero-weight segments entirely', () => {
    const withGhost: Segment[] = [...segments, { id: 'ghost', label: 'hidden', weight: 0 }]
    const { container } = render(<Wheel segments={withGhost} />)
    expect(container.querySelectorAll('path.wheel__segment')).toHaveLength(2)
    expect(screen.queryByText('hidden')).not.toBeInTheDocument()
  })

  it('renders a single full-weight segment as one full ring', () => {
    const solo: Segment[] = [
      { id: 'beer', label: 'free beer', weight: 1 },
      { id: 'a', label: 'Ana', weight: 0 },
    ]
    const { container } = render(<Wheel segments={solo} />)
    const paths = container.querySelectorAll('path.wheel__segment')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('d')).not.toBe('')
  })

  it('applies rotation to the wheel group', () => {
    const { container } = render(<Wheel segments={segments} rotationDeg={90} />)
    expect(container.querySelector('g.wheel__rotor')?.getAttribute('transform')).toBe('rotate(90)')
  })

  it('renders nothing spinnable when there are no segments', () => {
    const { container } = render(<Wheel segments={[]} />)
    expect(container.querySelectorAll('path.wheel__segment')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Wheel`
Expected: FAIL — cannot resolve `./Wheel`.

- [ ] **Step 3: Write `src/wheel/Wheel.css`**

```css
.wheel {
  display: block;
  width: 100%;
  max-width: 40rem;
  height: auto;
}

.wheel__segment {
  stroke: var(--wheel-segment-stroke, #11111a);
  stroke-width: 1;
}

.wheel__label {
  fill: var(--wheel-label-color, #11111a);
  font-family: system-ui, sans-serif;
  font-weight: 600;
  pointer-events: none;
  user-select: none;
}

.wheel__pointer {
  fill: var(--wheel-pointer-color, #11111a);
}
```

- [ ] **Step 4: Write `src/wheel/Wheel.tsx`**

```tsx
import type { Ref } from 'react'
import { arcPath, arcs } from './geometry'
import { fitLabel } from './label'
import type { Segment } from './types'
import './Wheel.css'

const DEFAULT_PALETTE = ['#f4a261', '#2a9d8f', '#e76f51', '#e9c46a', '#8ab17d', '#5f8dd3']

export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
}

export function Wheel({ segments, radius = 200, rotationDeg = 0, rotorRef }: WheelProps) {
  const layout = arcs(segments)
  const viewBox = `${-radius - 4} ${-radius - 4} ${(radius + 4) * 2} ${(radius + 4) * 2}`

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
        {layout.map((arc, index) => {
          const width = arc.end - arc.start
          if (!(width > 0)) return null

          const segment = segments[index]
          const d = arcPath(arc.start, arc.end, radius)
          if (d === '') return null

          const color = segment.color ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
          const fitted = fitLabel(segment.label, width, radius)
          const midDeg = (arc.start + width / 2) * 360

          return (
            <g key={segment.id}>
              <path className="wheel__segment" d={d} fill={color} />
              {fitted && (
                <text
                  className="wheel__label"
                  fontSize={fitted.fontSize}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midDeg}) translate(0 ${-radius * 0.62}) rotate(90)`}
                >
                  {fitted.text}
                </text>
              )}
            </g>
          )
        })}
      </g>
      <polygon className="wheel__pointer" points={`0,${-radius - 4} -12,${-radius + 18} 12,${-radius + 18}`} />
    </svg>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- Wheel`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/Wheel.tsx src/wheel/Wheel.css src/wheel/Wheel.test.tsx
git commit -m "feat(wheel): render segments as an SVG wheel"
```

---

## Task 11: useSpin and the demo harness

`useSpin` is the only untested file in the plan, so it stays thin: it calls `planSpin` for all decisions and does nothing but drive two animation tracks. jsdom does not implement the Web Animations API, which is why this is verified by eye rather than asserted.

**Files:**
- Create: `src/wheel/useSpin.ts`
- Modify: `src/App.tsx`
- Create: `src/App.css`

- [ ] **Step 1: Write `src/wheel/useSpin.ts`**

```ts
import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMorphs } from './morph'
import { cryptoRng, weightedRandom } from './selection'
import type { SelectionStrategy } from './selection'
import { planSpin } from './spin'
import type { Segment, SpinConfig } from './types'

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  isSpinning: boolean
  winnerId: string | null
  spin: (strategy?: SelectionStrategy) => void
  rotorRef: RefObject<SVGGElement | null>
}

export function useSpin(
  segments: Segment[],
  config: SpinConfig,
  onLanded?: (winnerId: string) => void,
): UseSpinResult {
  const rotorRef = useRef<SVGGElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const animationRef = useRef<Animation | null>(null)
  const [displaySegments, setDisplaySegments] = useState(segments)
  const [isSpinning, setIsSpinning] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)

  useEffect(() => {
    if (!isSpinning) setDisplaySegments(segments)
  }, [segments, isSpinning])

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      animationRef.current?.cancel()
    },
    [],
  )

  const spin = useCallback(
    (strategy: SelectionStrategy = weightedRandom) => {
      if (isSpinning) return
      const rotor = rotorRef.current
      if (!rotor) return

      const plan = planSpin(segments, config, strategy, cryptoRng)
      if (!plan) return

      setIsSpinning(true)
      setWinnerId(null)

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const durationMs = reduceMotion ? 300 : config.durationMs

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(
        [{ transform: 'rotate(0deg)' }, { transform: `rotate(${plan.targetRotationDeg}deg)` }],
        { duration: durationMs, easing: config.easing, fill: 'forwards' },
      )
      animationRef.current = animation

      // Track 2: geometry. Independent of rotation; only regenerates paths.
      if (config.morphs.length > 0) {
        const startedAt = performance.now()
        const tick = (now: number) => {
          const elapsed = Math.min(now - startedAt, config.durationMs)
          setDisplaySegments(applyMorphs(segments, config.morphs, elapsed))
          if (elapsed < config.durationMs) {
            frameRef.current = requestAnimationFrame(tick)
          }
        }
        frameRef.current = requestAnimationFrame(tick)
      }

      animation.finished
        .then(() => {
          setDisplaySegments(plan.landing)
          setIsSpinning(false)
          setWinnerId(plan.winnerId)
          onLanded?.(plan.winnerId)
        })
        .catch(() => {
          // The animation was cancelled (unmount, or a future re-target).
          setIsSpinning(false)
        })
    },
    [segments, config, isSpinning, onLanded],
  )

  return { displaySegments, isSpinning, winnerId, spin, rotorRef }
}
```

- [ ] **Step 2: Write `src/App.css`**

```css
.app {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem 1rem;
  font-family: system-ui, sans-serif;
}

.app__controls {
  display: flex;
  gap: 0.75rem;
}

.app__button {
  padding: 0.6rem 1.4rem;
  font: inherit;
  font-weight: 600;
  border: 1px solid currentColor;
  border-radius: 0.4rem;
  background: transparent;
  cursor: pointer;
}

.app__button:disabled {
  opacity: 0.4;
  cursor: default;
}

.app__result {
  min-height: 2rem;
  font-size: 1.5rem;
  font-weight: 700;
}
```

- [ ] **Step 3: Write `src/App.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Wheel } from './wheel/Wheel'
import type { Morph, Segment, SpinConfig } from './wheel/types'
import { useSpin } from './wheel/useSpin'
import './App.css'

const SEGMENTS: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
  { id: 'cal', label: 'Cal', weight: 1 },
  { id: 'dee', label: 'Dee', weight: 1 },
  { id: 'eli', label: 'Eli', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0.02, color: '#ffd166' },
]

const DURATION_MS = 4500

/** The headline gag: a sliver swells to swallow the wheel while it is turning. */
const BEER_TAKEOVER: Morph[] = [
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
  ...['ana', 'ben', 'cal', 'dee', 'eli'].map<Morph>((id) => ({
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

export function App() {
  const [riggedForBeer, setRiggedForBeer] = useState(false)

  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: DURATION_MS,
      fullSpins: 6,
      easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
      morphs: riggedForBeer ? BEER_TAKEOVER : [],
    }),
    [riggedForBeer],
  )

  const { displaySegments, isSpinning, winnerId, spin, rotorRef } = useSpin(SEGMENTS, config)
  const winner = displaySegments.find((s) => s.id === winnerId)

  return (
    <main className="app">
      <Wheel segments={displaySegments} rotorRef={rotorRef} />
      <div className="app__controls">
        <button
          className="app__button"
          type="button"
          onClick={() => spin()}
          disabled={isSpinning}
        >
          Spin
        </button>
        <button
          className="app__button"
          type="button"
          onClick={() => setRiggedForBeer((v) => !v)}
          disabled={isSpinning}
        >
          {riggedForBeer ? 'Takeover: on' : 'Takeover: off'}
        </button>
      </div>
      <p className="app__result">{winner ? winner.label : ''}</p>
    </main>
  )
}
```

- [ ] **Step 4: Run the full suite and the linter**

Run: `npm test && npx tsc --noEmit && npm run check`
Expected: all tests pass, no type errors, Biome reports no remaining issues.

- [ ] **Step 5: Verify by eye**

Run: `npm run dev`, open the printed URL, and confirm all of the following:

1. The wheel renders six segments; "free beer" is a barely-visible sliver.
2. "Spin" rotates the wheel smoothly, decelerates, and stops with the pointer clearly inside one segment.
3. The name shown below the wheel matches the segment the pointer is actually on. **Check this on at least ten spins** — a mismatch here is the failure Task 5 exists to prevent.
4. Repeated spins do not always stop at the same point within a segment.
5. With "Takeover: on", the beer wedge stays small for the first ~60% of the spin, then swells to fill the entire wheel while it is still turning, and the result is always `free beer`.
6. During takeover the other labels shrink and disappear rather than overlapping or flickering.
7. At full takeover the wheel is a complete filled circle, not a blank or partially-drawn ring.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/useSpin.ts src/App.tsx src/App.css
git commit -m "feat(wheel): animate spins with a two-track rotation and morph loop"
```

---

## Done When

- `npm test` passes with 75 tests across 6 files. (The plan as written produces
  69; adversarial review and browser verification added six more covering
  boundary precision, arc invariants, label orientation, and the
  arcs → rotation → pointer → segment round trip.)
- `npx tsc --noEmit` is clean.
- `npm run check` is clean.
- All seven manual checks in Task 11 Step 5 pass.

## Next Plans

1. **Composer and sources** — `Source` interface, `manualList`, exclusions, draw-and-remove, repeat-avoidance weighting.
2. **Presets and storage** — `localStorage` persistence, JSON export/import.
3. **Reveals and skins** — the landing takeover, plus the near-miss.
4. **Admin window and rig** — `BroadcastChannel` control channel, live-fired morphs, in-flight re-targeting.
5. **Meet roster source** — gated on the liveness probe, not on scope. The scope question is resolved (the scopes are bundled; see the spec's auth section) and is a disclosure matter rather than a blocker. What gates the build is whether `conferenceRecords.participants` tracks joins and leaves mid-meeting fast enough to describe the room. If it doesn't, this source is dropped rather than degraded — there is no live fallback.
