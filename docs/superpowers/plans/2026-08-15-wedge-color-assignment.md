# Wedge Color Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give wedge color assignment one owner, so the color a trick animates from is the color the wheel is painting.

**Architecture:** A pure `assignColors` in `src/wheel/colors.ts` runs inside `resolveTricks`, between its provide and resolve passes — the only point where the roster is complete and no color has been read. `effectiveColor` and `usePresence.withColor` both go away. `usePresence` reports the ids it is still drawing through a ref so an exiting wedge keeps its swatch, and a `choose` callback lets a consumer override the palette pick without overriding authored colors.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-08-15-wedge-color-assignment-design.md`

**Baseline:** 78 test files, 996 tests, all passing. Run `npm test` before starting and confirm this.

**Worktree:** `/Users/mike/src/wod/.claude/worktrees/wedge-colors`, branch `feat/wedge-color-assignment`.

---

## Background an implementer needs

**How a wedge gets a color today.** `Segment.color` is optional. A wedge with no
authored color takes one from `DEFAULT_PALETTE` (six hex strings in
`src/wheel/palette.ts`). Two different pieces of code do that assignment by two
different rules, which is the bug:

- `effectiveColor(segments, id)` in `palette.ts` returns `segments[i].color ??
  paletteColor(i)` — **by position in the roster**.
- `withColor` inside `src/transition/usePresence.ts` assigns the first unclaimed
  swatch **by id** and remembers it in a ref, so a wedge keeps its color for as
  long as it is drawn.

After one wedge leaves, these disagree for every uncolored wedge. `recolor`,
`swap` and `takeover` call `effectiveColor` to build the `at: 0` keyframe of a
morph, so on a churned roster a trick animates from a color the wedge does not
have and it jumps on the spin's first frame.

**The pipeline**, top to bottom:

```
composeBase()      merges statics + feed items       → Composition {segments, origins}
resolveTricks()    pass 1 provides, pass 2 resolves  → {segments, origins, morphs}
useSpin()          applies morphs frame by frame     → displaySegments
<Wheel>            → usePresence() → paints fill
```

Assignment goes between `resolveTricks`'s two passes. Pass 1 has appended every
wedge a trick invents; pass 2 is the first thing that reads a color.

**Vocabulary.** A *track* is one wedge's presence animation, held in
`usePresence`. A wedge that has left the roster still has a track until its exit
finishes — that is why "ids being drawn" is bigger than "ids in the roster", and
why an exiting wedge's swatch must stay reserved.

**Conventions in this codebase.** Refs are written during render in
`usePresence.ts` and `Wheel.tsx`, deliberately and with a note on each about why
it is safe under StrictMode's double render. Comments are rare and short. Tests
are colocated as `*.test.ts` / `*.test.tsx`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/wheel/colors.ts` | **Create.** Pure assignment: `assignColors`, `ChooseColor`, `ColorContext`, `ColorState`, `RetainedIds`. |
| `src/wheel/colors.test.ts` | **Create.** Unit tests for the rule, including the ones relocated from `usePresence.test.tsx`. |
| `src/wheel/palette.ts` | **Modify.** Delete `effectiveColor`; keep `DEFAULT_PALETTE`, `paletteColor`. |
| `src/wheel/palette.test.ts` | **Modify.** Delete the `effectiveColor` block; test `paletteColor`. |
| `src/tricks/resolve.ts` | **Modify.** Optional 6th `colorState` param; assign between passes; return `colors`. |
| `src/transition/usePresence.ts` | **Modify.** Delete `withColor` and its ref; write retained ids to a ref prop. |
| `src/wheel/Wheel.tsx` | **Modify.** Accept and forward the `retainedRef` prop. |
| `src/App.tsx` | **Modify.** Own the color and retained refs; pass `colorState`. |
| `src/tricks/recipes/{recolor,swap,takeover}.ts` | **Modify.** Read `segment.color`. |

---

### Task 1: The assignment rule

Pure module, no React, no wiring. Nothing else changes in this task.

**Files:**
- Create: `src/wheel/colors.ts`
- Test: `src/wheel/colors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/wheel/colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Origin } from '../compose/types'
import { assignColors } from './colors'
import { DEFAULT_PALETTE } from './palette'
import type { Segment } from './types'

const segment = (id: string, color?: string): Segment =>
  color === undefined ? { id, label: id, weight: 1 } : { id, label: id, weight: 1, color }

const NO_ORIGINS = new Map<string, Origin>()
const fresh = { previous: new Map<string, string>(), retained: new Set<string>() }

describe('assignColors', () => {
  it('leaves an authored color alone', () => {
    const { segments } = assignColors([segment('beer', '#ffd166')], NO_ORIGINS, fresh)
    expect(segments[0].color).toBe('#ffd166')
  })

  it('gives every uncolored wedge a distinct swatch', () => {
    const { segments } = assignColors(
      [segment('ana'), segment('ben'), segment('cy')],
      NO_ORIGINS,
      fresh,
    )
    const fills = segments.map((s) => s.color)
    expect(new Set(fills).size).toBe(3)
    for (const fill of fills) expect(DEFAULT_PALETTE).toContain(fill)
  })

  it('keeps a wedge on its swatch when a neighbor leaves', () => {
    const first = assignColors([segment('ana'), segment('ben'), segment('cy')], NO_ORIGINS, fresh)
    const before = first.segments.find((s) => s.id === 'cy')?.color

    const second = assignColors([segment('ana'), segment('cy')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
    })
    expect(second.segments.find((s) => s.id === 'cy')?.color).toBe(before)
  })

  it('does not hand an arrival the swatch of a wedge still exiting', () => {
    const first = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, fresh)
    const bens = first.segments.find((s) => s.id === 'ben')?.color

    // 'ben' has left the roster but is still being drawn.
    const second = assignColors([segment('ana'), segment('dan')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set(['ben']),
    })
    expect(second.segments.find((s) => s.id === 'dan')?.color).not.toBe(bens)
  })

  it('releases a swatch once the wedge is neither present nor retained', () => {
    const first = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, fresh)
    const second = assignColors([segment('ana')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
    })
    expect(second.colors.has('ben')).toBe(false)
  })

  it('does not duplicate an authored color with a palette pick', () => {
    const authored = DEFAULT_PALETTE[0]
    const { segments } = assignColors(
      [segment('beer', authored), segment('ana')],
      NO_ORIGINS,
      fresh,
    )
    expect(segments[1].color).not.toBe(authored)
  })

  it('keeps colors for wedges present but not in previous', () => {
    const { segments } = assignColors([segment('ana')], NO_ORIGINS, {
      previous: new Map<string, string>(),
      retained: new Set<string>(),
    })
    expect(segments[0].color).toBeTruthy()
  })

  it('falls back to the wrapping palette when every swatch is taken', () => {
    const many = DEFAULT_PALETTE.map((_, i) => segment(`w${i}`))
    const { segments } = assignColors([...many, segment('extra')], NO_ORIGINS, fresh)
    expect(segments[segments.length - 1].color).toBeTruthy()
  })
})

describe('assignColors choose', () => {
  const origins = new Map<string, Origin>([
    ['sim:ana', { kind: 'external', feedId: 'sim', itemId: 'ana' }],
  ])

  it('uses the callback for an uncolored wedge', () => {
    const { segments } = assignColors([segment('ana')], NO_ORIGINS, {
      ...fresh,
      choose: () => '#123456',
    })
    expect(segments[0].color).toBe('#123456')
  })

  it('does not let the callback override an authored color', () => {
    const { segments } = assignColors([segment('beer', '#ffd166')], NO_ORIGINS, {
      ...fresh,
      choose: () => '#123456',
    })
    expect(segments[0].color).toBe('#ffd166')
  })

  it('falls through to the palette when the callback returns undefined', () => {
    const { segments } = assignColors([segment('ana')], NO_ORIGINS, {
      ...fresh,
      choose: () => undefined,
    })
    expect(DEFAULT_PALETTE).toContain(segments[0].color)
  })

  it('does not duplicate a chosen color with a palette pick', () => {
    const { segments } = assignColors([segment('ana'), segment('ben')], NO_ORIGINS, {
      ...fresh,
      choose: (s) => (s.id === 'ana' ? DEFAULT_PALETTE[0] : undefined),
    })
    expect(segments[1].color).not.toBe(DEFAULT_PALETTE[0])
  })

  it('does not store a chosen color, so it can change', () => {
    const first = assignColors([segment('ana')], NO_ORIGINS, { ...fresh, choose: () => '#111111' })
    const second = assignColors([segment('ana')], NO_ORIGINS, {
      previous: first.colors,
      retained: new Set<string>(),
      choose: () => '#222222',
    })
    expect(second.segments[0].color).toBe('#222222')
  })

  it('passes the wedge origin to the callback', () => {
    let seen: Origin | undefined
    assignColors([segment('sim:ana')], origins, {
      ...fresh,
      choose: (_s, ctx) => {
        seen = ctx.origin
        return undefined
      },
    })
    expect(seen).toEqual({ kind: 'external', feedId: 'sim', itemId: 'ana' })
  })

  it('passes index and count to the callback', () => {
    const seen: Array<[number, number]> = []
    assignColors([segment('ana'), segment('ben')], NO_ORIGINS, {
      ...fresh,
      choose: (_s, ctx) => {
        seen.push([ctx.index, ctx.count])
        return undefined
      },
    })
    expect(seen).toEqual([
      [0, 2],
      [1, 2],
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wheel/colors.test.ts`
Expected: FAIL — `Failed to resolve import "./colors"`.

- [ ] **Step 3: Write the implementation**

Create `src/wheel/colors.ts`:

```ts
import type { Origin } from '../compose/types'
import { DEFAULT_PALETTE, paletteColor } from './palette'
import type { Segment } from './types'

export type ColorContext = {
  index: number
  count: number
  /** Colors already spoken for this pass, so a pick cannot duplicate one. */
  taken: ReadonlySet<string>
  origin: Origin | undefined
  palette: readonly string[]
}

/** Returning undefined falls through to the default palette assignment. */
export type ChooseColor = (segment: Segment, ctx: ColorContext) => string | undefined

/** Ids a wheel is still drawing, including wedges animating out. */
export type RetainedIds = { current: ReadonlySet<string> }

export type ColorState = {
  previous: ReadonlyMap<string, string>
  retained: ReadonlySet<string>
  choose?: ChooseColor
}

export const EMPTY_COLOR_STATE: ColorState = {
  previous: new Map(),
  retained: new Set(),
}

/**
 * Assigns a palette color to every wedge that has none, keeping a wedge on the
 * swatch it already had. `retained` names wedges that have left the roster but
 * are still being drawn, whose swatches stay reserved for the length of an exit.
 *
 * The returned map holds default assignments only — never authored or chosen
 * colors, which are recomputed each pass so a consumer's mapping can change.
 */
export function assignColors(
  segments: Segment[],
  origins: ReadonlyMap<string, Origin>,
  state: ColorState,
): { segments: Segment[]; colors: Map<string, string> } {
  const { previous, retained, choose } = state
  const keep = new Set<string>(retained)
  for (const segment of segments) keep.add(segment.id)

  const colors = new Map<string, string>()
  for (const [id, color] of previous) {
    if (keep.has(id)) colors.set(id, color)
  }

  const taken = new Set<string>(colors.values())
  const chosen = new Map<string, string>()
  segments.forEach((segment, index) => {
    if (segment.color !== undefined) {
      taken.add(segment.color)
      return
    }
    const picked = choose?.(segment, {
      index,
      count: segments.length,
      taken,
      origin: origins.get(segment.id),
      palette: DEFAULT_PALETTE,
    })
    if (picked !== undefined) {
      chosen.set(segment.id, picked)
      taken.add(picked)
    }
  })

  const out = segments.map((segment) => {
    if (segment.color !== undefined) return segment
    const picked = chosen.get(segment.id)
    if (picked !== undefined) return { ...segment, color: picked }
    let color = colors.get(segment.id)
    if (color === undefined) {
      color = DEFAULT_PALETTE.find((swatch) => !taken.has(swatch)) ?? paletteColor(colors.size)
      colors.set(segment.id, color)
      taken.add(color)
    }
    return { ...segment, color }
  })

  return { segments: out, colors }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/colors.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the full suite and format**

Run: `npm run check && npm test`
Expected: 78 files, 1011 tests passing (996 + 15).

- [ ] **Step 6: Commit**

```bash
git add src/wheel/colors.ts src/wheel/colors.test.ts
git commit -m "feat(wheel): assign a palette color by id, in one pure place"
```

---

### Task 2: Report the ids a wheel is still drawing

Additive. `usePresence` gains an optional ref it writes during render; nothing
reads it yet and no behavior changes.

**Files:**
- Modify: `src/transition/usePresence.ts`
- Modify: `src/wheel/Wheel.tsx`
- Test: `src/transition/usePresence.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the existing top-level `describe` in
`src/transition/usePresence.test.tsx` (it already has `segment`, `transitions`
and `clock` helpers in scope — reuse them, do not redefine them):

```tsx
  it('reports a wedge it is still drawing after the roster drops it', () => {
    const retained: { current: ReadonlySet<string> } = { current: new Set() }
    const { rerender } = render(
      <Wheel
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    expect([...retained.current].sort()).toEqual(['ana', 'ben'])

    rerender(
      <Wheel segments={[segment('ana')]} transitions={transitions} retainedRef={retained} />,
    )
    expect(retained.current.has('ben')).toBe(true)
  })

  it('drops a wedge from the report once its exit is done', () => {
    const retained: { current: ReadonlySet<string> } = { current: new Set() }
    const { rerender } = render(
      <Wheel
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    rerender(
      <Wheel segments={[segment('ana')]} transitions={transitions} retainedRef={retained} />,
    )
    clock.advance(401)
    rerender(
      <Wheel segments={[segment('ana')]} transitions={transitions} retainedRef={retained} />,
    )
    expect(retained.current.has('ben')).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/transition/usePresence.test.tsx -t 'still drawing'`
Expected: FAIL — `retainedRef` is not a known prop, and `retained.current` stays empty.

- [ ] **Step 3: Thread the ref through `usePresence`**

In `src/transition/usePresence.ts`, add the import and the parameter. Change the
signature from:

```ts
export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
): Drawn[] {
```

to:

```ts
export function usePresence(
  segments: Segment[],
  transitions: Transitions | undefined,
  held: boolean,
  retainedRef?: RetainedIds,
): Drawn[] {
```

Add to the imports at the top of the file:

```ts
import type { RetainedIds } from '../wheel/colors'
```

Then, immediately after the existing `const { drawn, arcs: laid } = drawList(tracks.current, now)`
and `arcs.current = laid` lines, add:

```ts
  // Written during render for the same reason the lines above are: the assigner
  // reads it on App's next render, and an effect would report a frame late.
  if (retainedRef) retainedRef.current = new Set(tracks.current.keys())
```

- [ ] **Step 4: Accept the prop on `Wheel`**

In `src/wheel/Wheel.tsx`, add to the imports:

```ts
import type { RetainedIds } from './colors'
```

Add to `WheelProps`, after `held`:

```ts
  /** Receives the ids this wheel is drawing, including wedges animating out. */
  retainedRef?: RetainedIds
```

Add `retainedRef` to the destructured parameter list, and change the
`usePresence` call from:

```ts
  const drawn = usePresence(segments, transitions, held)
```

to:

```ts
  const drawn = usePresence(segments, transitions, held, retainedRef)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/transition/usePresence.test.tsx`
Expected: PASS, including the two new tests.

- [ ] **Step 6: Run the full suite and format**

Run: `npm run check && npm test`
Expected: 1013 tests passing.

- [ ] **Step 7: Commit**

```bash
git add src/transition/usePresence.ts src/wheel/Wheel.tsx src/transition/usePresence.test.tsx
git commit -m "feat(transition): report which wedges a wheel is still drawing"
```

---

### Task 3: Assign inside `resolveTricks`

After this task the roster carries concrete colors and `withColor` is inert —
it only fills a color when one is missing, and none are.

**Files:**
- Modify: `src/tricks/resolve.ts`
- Test: `src/tricks/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/tricks/resolve.test.ts`. Match the import style already at the top
of that file; add `assignColors`-free imports only:

```ts
describe('resolveTricks color assignment', () => {
  const base = {
    segments: [
      { id: 'ana', label: 'Ana', weight: 1 },
      { id: 'ben', label: 'Ben', weight: 1 },
    ],
    origins: new Map<string, Origin>([
      ['ana', { kind: 'static' }],
      ['ben', { kind: 'static' }],
    ]),
  }

  it('gives every wedge a concrete color', () => {
    const resolved = resolveTricks(base, [], 1000)
    for (const segment of resolved.segments) expect(segment.color).toBeTruthy()
  })

  it('returns the assignment it made', () => {
    const resolved = resolveTricks(base, [], 1000)
    expect(resolved.colors.get('ana')).toBe(resolved.segments[0].color)
  })

  it('keeps a wedge on its color when the roster shrinks', () => {
    const first = resolveTricks(base, [], 1000)
    const bens = first.segments.find((s) => s.id === 'ben')?.color

    const shrunk = {
      segments: [base.segments[1]],
      origins: new Map<string, Origin>([['ben', { kind: 'static' }]]),
    }
    const second = resolveTricks(shrunk, [], 1000, 0, null, {
      previous: first.colors,
      retained: new Set<string>(),
    })
    expect(second.segments[0].color).toBe(bens)
  })
})
```

Ensure `Origin` is imported in that file:

```ts
import type { Origin } from '../compose/types'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/tricks/resolve.test.ts -t 'color assignment'`
Expected: FAIL — `segment.color` is undefined and `resolved.colors` does not exist.

- [ ] **Step 3: Wire assignment into `resolveTricks`**

In `src/tricks/resolve.ts`, add to the imports:

```ts
import { EMPTY_COLOR_STATE, assignColors } from '../wheel/colors'
import type { ColorState } from '../wheel/colors'
```

Add `colors` to the `ResolvedTricks` type (find it in this file and add the
field):

```ts
  colors: Map<string, string>
```

Change the signature from:

```ts
export function resolveTricks(
  base: Composition,
  tricks: Trick[],
  durationMs: number,
  roll = 0,
  winnerId: string | null = null,
): ResolvedTricks {
```

to:

```ts
export function resolveTricks(
  base: Composition,
  tricks: Trick[],
  durationMs: number,
  roll = 0,
  winnerId: string | null = null,
  colorState: ColorState = EMPTY_COLOR_STATE,
): ResolvedTricks {
```

Between pass 1 and pass 2 — that is, after the `for (const trick of active)`
loop that calls `recipe.provides(...)` and before the `// Pass 2: resolve.`
comment — insert:

```ts
  // Between the passes on purpose: pass 1 has appended every wedge a trick
  // invents, and pass 2 is the first thing that reads a color.
  const { segments: colored, colors } = assignColors(segments, origins, colorState)
```

Then change pass 2 to resolve against `colored`, and return it. In the
`recipe.resolve` call, change `segments,` to:

```ts
        segments: colored,
```

And change the return statement from:

```ts
  return { segments, origins, morphs }
```

to:

```ts
  return { segments: colored, origins, morphs, colors }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tricks/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm run check && npm test`
Expected: all passing, 1016 tests. If `conflicts.ts` or a recipe test fails here,
it is because a `writes()` guard now sees a defined color where it saw
undefined — do not patch the test; note it and fix it in Task 5, which is where
those guards change.

- [ ] **Step 6: Commit**

```bash
git add src/tricks/resolve.ts src/tricks/resolve.test.ts
git commit -m "feat(tricks): assign wedge colors between the provide and resolve passes"
```

---

### Task 4: App owns the color state

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `src/App.test.tsx`, after the existing `feed` block.
It uses that file's `publish` helper (defined at `src/App.test.tsx:310`) and
renders with a bare `render(<App />)`, which is what every other test there does:

```tsx
describe('wedge colors', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps a wedge on its color when another leaves the feed', async () => {
    const { container } = render(<App />)
    await publish([
      { id: 'ana', label: 'Ana' },
      { id: 'ben', label: 'Ben' },
      { id: 'cy', label: 'Cy' },
    ])

    const fillOf = (id: string) =>
      container
        .querySelector(`[data-segment-id="sim:${id}"] .wheel__segment`)
        ?.getAttribute('fill')

    const before = fillOf('cy')
    expect(before).toBeTruthy()

    await publish([
      { id: 'ana', label: 'Ana' },
      { id: 'cy', label: 'Cy' },
    ])
    expect(fillOf('cy')).toBe(before)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx -t 'keeps a wedge on its color'`
Expected: FAIL — the color changes, because nothing feeds the previous assignment
back in.

- [ ] **Step 3: Hold the refs in App**

In `src/App.tsx`, confirm `useRef` is among the React imports and add it if not.
No type import is needed here — the refs are structural.

Inside the component, above the `base` memo, add:

```ts
  const colorsRef = useRef(new Map<string, string>())
  const retainedRef = useRef<ReadonlySet<string>>(new Set())
```

`useRef<ReadonlySet<string>>` is structurally a `RetainedIds` already — no cast.

Change the `resolved` memo from:

```ts
  const resolved = useMemo(
    () => resolveTricks(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )
```

to:

```ts
  // The refs are deliberately not dependencies. This recomputes on the composed
  // roster and reads them at that moment; anything narrower re-assigns a roster
  // it has already colored, anything wider re-assigns on every frame of a spin.
  const resolved = useMemo(
    () =>
      resolveTricks(base, preset.tricks, preset.spin.motion.durationMs, 0, null, {
        previous: colorsRef.current,
        retained: retainedRef.current,
      }),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )
  colorsRef.current = resolved.colors
```

- [ ] **Step 4: Pass the retained ref to the wheel**

Find the `<Wheel` element at roughly `src/App.tsx:124` and add the prop:

```tsx
        retainedRef={retainedRef}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm run check && npm test`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): carry the wedge color assignment across renders"
```

---

### Task 4b: Thread the color state through the scripted spin

Added during execution. Task 4 wires the render path only. `resolveScriptedSpin`
reaches `resolveTricks` through `evaluateWheel` and passes no color state, so it
would assign by position while the wheel paints the sticky assignment — the
original bug, surviving in the one path where an `at: 0` keyframe animates.

`Editor.tsx` needs no change: it uses the default state for both its preview and
its `resolveLate`, so it stays self-consistent.

**Files:**
- Modify: `src/spin/resolve.ts`
- Modify: `src/App.tsx:95`
- Test: `src/spin/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/spin/resolve.test.ts`, matching that file's existing fixture
style. The point is that a resolution reuses a caller's assignment rather than
recomputing one by position:

```ts
describe('resolveScriptedSpin color state', () => {
  it('resolves against the colors the caller already assigned', () => {
    const base = composeBase({
      statics: [
        { id: 'ana', label: 'Ana', weight: 1 },
        { id: 'ben', label: 'Ben', weight: 1 },
      ],
      feeds: [],
      items: {},
      overrides: {},
    })
    // 'ben' holds the swatch position would give 'ana'.
    const previous = new Map([['ben', paletteColor(0)]])

    const resolution = resolveScriptedSpin(base, [], SPIN, [], () => 0, {
      previous,
      retained: new Set<string>(),
    })

    expect(resolution?.segments.find((s) => s.id === 'ben')?.color).toBe(paletteColor(0))
  })
})
```

`SPIN` is whatever minimal `ScriptedSpin` fixture that file already defines —
reuse it, do not invent one. Import `paletteColor` from `../wheel/palette` and
`composeBase` from `../compose/compose` if not already imported.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/spin/resolve.test.ts -t 'color state'`
Expected: FAIL — `resolveScriptedSpin` takes five parameters, so the sixth is
ignored and `ben` gets the by-position swatch.

- [ ] **Step 3: Thread it through**

In `src/spin/resolve.ts`, add the import:

```ts
import { EMPTY_COLOR_STATE } from '../wheel/colors'
import type { ColorState } from '../wheel/colors'
```

Add a sixth parameter to `resolveScriptedSpin`:

```ts
export function resolveScriptedSpin(
  base: Composition,
  tricks: Trick[],
  spin: ScriptedSpin,
  branches: BranchNode[],
  rng: Rng,
  colorState: ColorState = EMPTY_COLOR_STATE,
): Resolution | null {
```

Add a seventh parameter to `evaluateWheel`, after `winnerId`:

```ts
  colorState: ColorState = EMPTY_COLOR_STATE,
```

and pass it to its `resolveTricks` call as the sixth argument.

Then pass `colorState` at all four `evaluateWheel` call sites inside
`resolveScriptedSpin`. Two are direct calls; two are inside the `resolveLate`
closures, which capture it — that is intended, since a late resolution must use
the same assignment the wheel is painting.

- [ ] **Step 4: Pass it from App**

In `src/App.tsx`, the `resolveScriptedSpin` call at roughly line 95 gains a sixth
argument:

```ts
      { previous: colorsRef.current, retained: retainedRef.current },
```

`colorsRef` and `retainedRef` were added in Task 4. Add nothing to the
`useCallback` dependency array — refs are not dependencies, for the same reason
Task 4's memo excludes them.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/spin/resolve.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run `npm run check` and `npm test` as separate commands.

- [ ] **Step 7: Commit**

```bash
git add src/spin/resolve.ts src/App.tsx src/spin/resolve.test.ts
git commit -m "fix(spin): resolve a spin against the colors the wheel is painting"
```

---

### Task 5: Recipes read the color the wheel paints

**Files:**
- Modify: `src/tricks/recipes/recolor.ts:39`
- Modify: `src/tricks/recipes/swap.ts:18-24`
- Modify: `src/tricks/recipes/takeover.ts:113`, `:153`
- Modify: `src/wheel/palette.ts`
- Modify: `src/wheel/palette.test.ts`
- Test: `src/tricks/recipes/recolor.test.ts`

- [ ] **Step 1: Write the failing test**

This is the bug. Append to `src/tricks/recipes/recolor.test.ts`, matching that
file's existing import and helper style:

```ts
  it('starts from the color the wheel is painting after churn', () => {
    const base = {
      segments: [
        { id: 'ana', label: 'Ana', weight: 1 },
        { id: 'ben', label: 'Ben', weight: 1 },
        { id: 'cy', label: 'Cy', weight: 1 },
      ],
      origins: new Map<string, Origin>([
        ['ana', { kind: 'static' }],
        ['ben', { kind: 'static' }],
        ['cy', { kind: 'static' }],
      ]),
    }
    const first = resolveTricks(base, [], 1000)
    const painted = first.segments.find((s) => s.id === 'cy')?.color

    // 'ben' leaves. 'cy' moves down a position but keeps its swatch.
    const churned = {
      segments: [base.segments[0], base.segments[2]],
      origins: new Map<string, Origin>([
        ['ana', { kind: 'static' }],
        ['cy', { kind: 'static' }],
      ]),
    }
    const trick = {
      id: 't1',
      name: 'recolor cy',
      recipe: 'recolor' as const,
      enabled: true,
      params: { targets: ['cy'], toColor: '#000000', startAt: 0.5 },
    }
    const resolved = resolveTricks(churned, [trick], 1000, 0, null, {
      previous: first.colors,
      retained: new Set<string>(),
    })

    const morph = resolved.morphs.find((m) => m.segmentId === 'cy')
    expect(morph?.keyframes[0]).toEqual({ at: 0, color: painted })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/tricks/recipes/recolor.test.ts -t 'painting after churn'`
Expected: FAIL — the `at: 0` color is the palette entry for cy's new position, not
the swatch it kept.

- [ ] **Step 3: Change `recolor`**

In `src/tricks/recipes/recolor.ts`, replace:

```ts
      const from = effectiveColor(ctx.segments, segment.id) ?? '#888888'
```

with:

```ts
      const from = segment.color ?? '#888888'
```

and delete the now-unused import line:

```ts
import { effectiveColor } from '../../wheel/palette'
```

- [ ] **Step 4: Change `swap`**

In `src/tricks/recipes/swap.ts`, replace the comment and the two lookups:

```ts
  // `effectiveColor`, not `segment.color`: a wedge with no explicit color takes
  // one from the palette, and passing undefined through would leave the color
  // half of the swap silently doing nothing while the labels traded.
  const winnerColor = effectiveColor(ctx.segments, winner.id)
  const otherColor = effectiveColor(ctx.segments, other.id)
  if (winnerColor === null || otherColor === null) return null
```

with:

```ts
  const winnerColor = winner.color
  const otherColor = other.color
  if (winnerColor === undefined || otherColor === undefined) return null
```

and delete the import line:

```ts
import { effectiveColor } from '../../wheel/palette'
```

- [ ] **Step 5: Change `takeover`**

In `src/tricks/recipes/takeover.ts`, replace:

```ts
    // The color the wheel actually paints, which is what the fade has to start
    // from. `wedge.color` is undefined for any segment left to the palette, and
    // reading that directly would silently drop the requested end color.
    const baseColor = effectiveColor(ctx.segments, id)
```

with:

```ts
    const baseColor = wedge.color
```

Then replace the `writes` guard:

```ts
    if (readOptionalString(params, 'endColor') && effectiveColor(ctx.segments, id)) {
```

with:

```ts
    if (readOptionalString(params, 'endColor') && ctx.segments.some((s) => s.id === id)) {
```

and delete the import line:

```ts
import { effectiveColor } from '../../wheel/palette'
```

- [ ] **Step 6: Delete `effectiveColor`**

In `src/wheel/palette.ts`, delete the docstring and the function, leaving:

```ts
export const DEFAULT_PALETTE = ['#f4a261', '#2a9d8f', '#e76f51', '#e9c46a', '#8ab17d', '#5f8dd3']

export function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
}
```

The `import type { Segment } from './types'` line becomes unused — delete it too.

Replace `src/wheel/palette.test.ts` entirely with:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, paletteColor } from './palette'

describe('paletteColor', () => {
  it('returns the swatch at the index', () => {
    expect(paletteColor(0)).toBe(DEFAULT_PALETTE[0])
  })

  it('wraps past the end of the palette', () => {
    expect(paletteColor(DEFAULT_PALETTE.length)).toBe(DEFAULT_PALETTE[0])
  })
})
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/tricks src/wheel/palette.test.ts`
Expected: PASS. If a `swap` or `takeover` test fails asserting a specific hex,
read it before changing it — a test that hardcoded a by-position palette color is
asserting the old bug and its expected value should change; a test asserting a
relationship between two colors should still hold as written.

- [ ] **Step 8: Run the full suite**

Run: `npm run check && npm test`
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add src/tricks/recipes src/wheel/palette.ts src/wheel/palette.test.ts
git commit -m "feat(tricks): start a color morph from the color the wheel paints"
```

---

### Task 6: Delete `withColor`

`usePresence` receives concrete colors now, so this removes dead code and the
second color authority.

**Files:**
- Modify: `src/transition/usePresence.ts`
- Modify: `src/transition/usePresence.test.tsx`

- [ ] **Step 1: Delete the function and its ref**

In `src/transition/usePresence.ts`, delete the whole `withColor` function
including its docstring (lines 8-32), the `colors` ref:

```ts
  const colors = useRef(new Map<string, string>())
```

and the call, replacing:

```ts
  const colored = withColor(
    segments,
    colors.current,
    new Set([...segments.map((segment) => segment.id), ...tracks.current.keys()]),
  )
```

with nothing — then change the two uses of `colored` to `segments`:
`settle(colored)` becomes `settle(segments)`, and `segments: colored,` inside the
`advance({...})` call becomes `segments,`.

Delete the now-unused import:

```ts
import { DEFAULT_PALETTE, paletteColor } from '../wheel/palette'
```

- [ ] **Step 2: Move the color tests**

Four tests in `src/transition/usePresence.test.tsx` cover the rule that now lives
in `colors.ts`, and Task 1 already covers three of them as unit tests. Delete
these three, which are `assignColors` tests wearing a React costume:

- `'gives a newcomer a color no wedge on the wheel is already using'` (`:196`)
- `'gives a survivor and the wedge leaving beside it different colors'` (`:234`)
- `'keeps a departed wedge on the color it had, not the palette index'` (`:245`)

**Keep** `'keeps every wedge painted while something else owns the wheel'`
(`:221`). It
asserts that a held wheel paints a fill at all, which is the guard for this whole
change, and it is an integration test that no unit test replaces.

Those tests render `<Wheel segments={...}>` directly with uncolored segments, so
the kept test needs colored input now. Change its segments to carry explicit
colors:

```tsx
  it('keeps every wedge painted while something else owns the wheel', () => {
    const { container, rerender } = render(
      <Wheel
        segments={[segment('ana', '#f4a261'), segment('ben', '#2a9d8f')]}
        transitions={transitions}
      />,
    )
    rerender(
      <Wheel segments={[segment('ana', '#f4a261')]} transitions={transitions} held={true} />,
    )
    const fill = container
      .querySelector('[data-segment-id="ana"] .wheel__segment')
      ?.getAttribute('fill')
    expect(fill).toMatch(/^#[0-9a-f]{6}$/i)
  })
```

If that file's `segment` helper does not take a color, extend it:

```tsx
const segment = (id: string, color?: string): Segment =>
  color === undefined ? { id, label: id, weight: 1 } : { id, label: id, weight: 1, color }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/transition/usePresence.test.tsx`
Expected: PASS.

- [ ] **Step 4: Run the full suite**

Run: `npm run check && npm test`
Expected: all passing. Any other test that renders `<Wheel>` and asserts a fill
needs explicit colors on its segments now — `src/wheel/Wheel.test.tsx` is the
likely one. Give those segments authored colors rather than reaching for
`assignColors` in a test.

- [ ] **Step 5: Commit**

```bash
git add src/transition/usePresence.ts src/transition/usePresence.test.tsx src/wheel/Wheel.test.tsx
git commit -m "refactor(transition): stop assigning colors where the wheel paints them"
```

---

### Task 7: Expose the `choose` callback

The rule already supports it from Task 1. This gives it a route from App.

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

`App` does not take props today. Add an optional one so a consumer — and the test
— can supply the callback. Append inside the `wedge colors` describe block added
in Task 4:

```tsx
  it('lets a caller choose a wedge color', async () => {
    const { container } = render(<App chooseColor={() => '#123456'} />)
    await publish([{ id: 'ana', label: 'Ana' }])
    const fill = container
      .querySelector('[data-segment-id="sim:ana"] .wheel__segment')
      ?.getAttribute('fill')
    expect(fill).toBe('#123456')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx -t 'choose a wedge color'`
Expected: FAIL — `App` takes no props and the fill is a palette swatch.

- [ ] **Step 3: Add the prop**

In `src/App.tsx`, add to the imports:

```ts
import type { ChooseColor, RetainedIds } from './wheel/colors'
```

(merging with the `RetainedIds` import added in Task 4). Add the props type above
the component:

```ts
export type AppProps = {
  /** Picks a color for a wedge with none authored. Undefined uses the palette. */
  chooseColor?: ChooseColor
}
```

Change the component signature to take `{ chooseColor }: AppProps = {}`, and add
`choose: chooseColor,` to the `colorState` object in the `resolved` memo, with
`chooseColor` added to that memo's dependency array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm run check && npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): let a caller choose a wedge's palette color"
```

---

### Task 8: Close out

- [ ] **Step 1: Confirm nothing references the deleted functions**

Run: `grep -rn "effectiveColor\|withColor" src/`
Expected: no output.

- [ ] **Step 2: Confirm the type-check and full suite pass**

Run: `npm run build && npm test`
Expected: `tsc --noEmit` clean, vite build succeeds, all tests pass.

- [ ] **Step 3: Update the merge plan's open list**

In `docs/superpowers/plans/2026-08-15-slice-presence-merge.md`, under "What the
final review left open", the first item — `effectiveColor` reports a color the
wheel does not paint — is now resolved. Replace that paragraph block with a line
pointing at this work:

```markdown
**`effectiveColor` reports a color the wheel does not paint.** Fixed — see
`docs/superpowers/specs/2026-08-15-wedge-color-assignment-design.md`. Assignment
moved into `resolveTricks` and both `effectiveColor` and `withColor` are gone.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-15-slice-presence-merge.md
git commit -m "docs: mark the color assignment split as resolved"
```

---

## Self-review notes

**Spec coverage.** Assignment inside `resolveTricks` (Task 3); the `colors.ts`
module and its types (Task 1); precedence, non-stored chosen colors and `origin`
in context (Tasks 1, 7); retention through a ref prop (Tasks 2, 4); the memo
caveat (Task 4, as a comment in the code); deletions (Tasks 5, 6); the `taken`
seeding change (Task 1, `'does not duplicate an authored color'`); the editor
needing no change (no task — `Editor.tsx` passes no color state and gets the
default, which is correct); testing (throughout, with the churn regression test
in Task 5).

**Known risk.** Task 5 Step 7 and Task 6 Step 4 are the two places existing tests
are most likely to fail on a hardcoded hex. Both say to read the test before
changing it and how to tell an old-bug assertion from a real one. Do not weaken
an assertion to make a suite green.
