# Responsive slices implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a wheel carry a different slice layout at a different wedge width, resolved from the wedge's arc rather than from measuring its label.

**Architecture:** A `Breakpoint` is a width floor paired with a `SliceInstance`. `resolveInstance` gains the wedge's width and consults the breakpoint list between the segment override and the wheel default, so a list with no match resolves exactly as it does today. The ladder in `ladder.ts` and `CONCESSIONS` in `glyphRun.ts` are untouched: a breakpoint selects, and whatever it selects still ladders and still concedes inside that selection.

Two things break if this is built naively, and each has its own task. Font preloading resolves before any width is known, so it has to gather every breakpoint's faces rather than only the resolved instance's. A morph animates a wedge's arc every frame, so breakpoint resolution has to read `lastLayoutArcs` — the same arc the layouts already fit against — never the presence arc.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Biome. Run `npm test` for the suite, `npm run build` for the typecheck, `npm run check` to format.

**Spec:** `docs/superpowers/specs/2026-08-16-responsive-slices-design.md`

---

## File structure

**Create**

- `src/slice/breakpoints.ts` — the `Breakpoint` type and `sliceAt`, the width→instance lookup. Its own file rather than more of `registry.ts`: the lookup is pure geometry and has nothing to say about the layout registry.
- `src/slice/breakpoints.test.ts`
- `src/editor/BreakpointPanel.tsx` — authoring: a row per breakpoint, each with its width and its own layout.
- `src/editor/BreakpointPanel.test.tsx`

**Modify**

- `src/slice/registry.ts` — `resolveInstance` gains breakpoints and a width; new `instancesUsed` for anything that has to know every instance a wheel could reach.
- `src/preset/types.ts` — `Preset.breakpoints`.
- `src/preset/storage.ts` — `readBreakpoints`, called from `parsePreset`.
- `src/wheel/Wheel.tsx` — `breakpoints` prop; resolve at the layout arc's width; preload every breakpoint's faces.
- `src/slice/report.ts` — the fit report resolves at each wedge's own width, or it reports a layout the wheel will not draw.
- `src/editor/FitReport.tsx`, `src/editor/Editor.tsx`, `src/App.tsx` — pass `preset.breakpoints` through.
- `src/studio/SliceStudio.tsx`, `src/studio/Studio.css` — each preview resolves at its own width and names the breakpoint it landed on; the panel that authors them.

**Untouched on purpose:** `src/slice/ladder.ts`, `src/slice/glyphRun.ts`. See the spec's "Why not extend the ladder anyway".

---

### Task 1: The breakpoint lookup

**Files:**
- Create: `src/slice/breakpoints.ts`
- Test: `src/slice/breakpoints.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/slice/breakpoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type Breakpoint, sliceAt } from './breakpoints'

const plate: Breakpoint = { from: 1 / 12, slice: { id: 'composed', params: {} } }
const initials: Breakpoint = { from: 0, slice: { id: 'radial', params: {} } }

describe('sliceAt', () => {
  it('takes the widest breakpoint the wedge still clears', () => {
    expect(sliceAt([plate, initials], 1 / 12)?.id).toBe('composed')
    expect(sliceAt([plate, initials], 1 / 6)?.id).toBe('composed')
  })

  it('drops to a narrower breakpoint below the floor', () => {
    expect(sliceAt([plate, initials], 1 / 45)?.id).toBe('radial')
  })

  it('reads the same list either way up', () => {
    expect(sliceAt([initials, plate], 1 / 6)?.id).toBe('composed')
    expect(sliceAt([initials, plate], 1 / 45)?.id).toBe('radial')
  })

  it('resolves nothing when the wedge clears no floor', () => {
    expect(sliceAt([plate], 1 / 45)).toBeUndefined()
  })

  it('resolves nothing without a list or without a width', () => {
    expect(sliceAt(undefined, 1 / 6)).toBeUndefined()
    expect(sliceAt([plate], undefined)).toBeUndefined()
    expect(sliceAt([initials], Number.NaN)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/breakpoints.test.ts`
Expected: FAIL — `Failed to resolve import "./breakpoints"`.

- [ ] **Step 3: Write the implementation**

Create `src/slice/breakpoints.ts`:

```ts
import type { SliceInstance } from './types'

/** Turns. The narrowest wedge this instance still suits. */
export type Breakpoint = { from: number; slice: SliceInstance }

/**
 * What a wedge this wide is set as, or undefined when no breakpoint claims it —
 * which is the caller's cue to resolve as it did before there were any.
 *
 * Resolved by the widest floor at or below the width rather than by list order,
 * so a hand-edited preset that lists its breakpoints the other way up still
 * answers the same.
 */
export function sliceAt(
  breakpoints: Breakpoint[] | undefined,
  width: number | undefined,
): SliceInstance | undefined {
  if (!breakpoints || width === undefined) return undefined

  let best: Breakpoint | undefined
  for (const point of breakpoints) {
    if (width >= point.from && (best === undefined || point.from > best.from)) best = point
  }
  return best?.slice
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/breakpoints.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/slice/breakpoints.ts src/slice/breakpoints.test.ts
git commit -m "feat(slice): resolve a slice from a wedge's width"
```

---

### Task 2: `resolveInstance` takes the width

**Files:**
- Modify: `src/slice/registry.ts:59-65`
- Test: `src/slice/registry.test.ts:39` (the existing `resolveInstance` describe block)

- [ ] **Step 1: Write the failing tests**

Add to the `resolveInstance` describe block in `src/slice/registry.test.ts`, after the existing `falls back to the built-in` test:

```ts
  it('takes a matching breakpoint over the wheel default', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1 }
    const points = [{ from: 1 / 12, slice: { id: 'radial' as const, params: {} } }]
    expect(resolveInstance(segment, { id: 'curved', params: {} }, points, 1 / 6).id).toBe('radial')
  })

  it('falls through to the wheel default when no breakpoint matches', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1 }
    const points = [{ from: 1 / 12, slice: { id: 'radial' as const, params: {} } }]
    expect(resolveInstance(segment, { id: 'curved', params: {} }, points, 1 / 45).id).toBe('curved')
  })

  // The wedge's own layout is the most specific thing anyone authored, so a
  // width cannot talk it out of it.
  it('keeps the segment override ahead of a matching breakpoint', () => {
    const segment = {
      id: 'a',
      label: 'Mike Truk',
      weight: 1,
      slice: { id: 'cash' as const, params: {} },
    }
    const points = [{ from: 1 / 12, slice: { id: 'radial' as const, params: {} } }]
    expect(resolveInstance(segment, undefined, points, 1 / 6).id).toBe('cash')
  })
```

And a new describe block at the end of the file:

```ts
describe('instancesUsed', () => {
  it('gathers every instance a width could reach, not only the resolved one', () => {
    const segments = [{ id: 'a', label: 'Mike Truk', weight: 1 }]
    const points = [{ from: 1 / 12, slice: { id: 'radial' as const, params: {} } }]
    expect(instancesUsed(segments, { id: 'curved', params: {} }, points).map((i) => i.id)).toEqual([
      'curved',
      'radial',
    ])
  })

  it('is just the wedges when there are no breakpoints', () => {
    const segments = [{ id: 'a', label: 'Mike Truk', weight: 1 }]
    expect(instancesUsed(segments, undefined, undefined)).toEqual([DEFAULT_SLICE])
  })
})
```

Extend the import at the top of the file:

```ts
import { DEFAULT_SLICE, SLICE_LIST, getSlice, instancesUsed, resolveInstance } from './registry'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/slice/registry.test.ts`
Expected: FAIL — `instancesUsed is not a function`, and the breakpoint tests resolve to `curved`.

- [ ] **Step 3: Write the implementation**

In `src/slice/registry.ts`, add to the imports:

```ts
import { type Breakpoint, sliceAt } from './breakpoints'
```

Replace `resolveInstance` (lines 59-65) with:

```ts
/** Segment override beats a matching breakpoint beats the wheel default beats the built-in. */
export function resolveInstance(
  segment: Segment,
  wheelDefault: SliceInstance | undefined,
  breakpoints?: Breakpoint[],
  /** Turns. Absent resolves as it did before there were breakpoints. */
  width?: number,
): SliceInstance {
  return segment.slice ?? sliceAt(breakpoints, width) ?? wheelDefault ?? DEFAULT_SLICE
}

/**
 * Every instance a wheel could resolve to, whatever its wedges end up as wide
 * as. What font preloading needs: it runs before any wedge has a width, and a
 * face fetched only once a wedge reaches the breakpoint that wants it arrives
 * after the run that measured against the fallback has already been cached.
 */
export function instancesUsed(
  segments: Segment[],
  wheelDefault: SliceInstance | undefined,
  breakpoints: Breakpoint[] | undefined,
): SliceInstance[] {
  return [
    ...segments.map((segment) => resolveInstance(segment, wheelDefault)),
    ...(breakpoints ?? []).map((point) => point.slice),
  ]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/slice/registry.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole suite — nothing else passes a width yet, so nothing else should move**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/slice/registry.ts src/slice/registry.test.ts
git commit -m "feat(slice): resolve a wedge's layout against its width"
```

---

### Task 3: A preset carries its breakpoints

**Files:**
- Modify: `src/preset/types.ts:88` (after `slice`)
- Modify: `src/preset/storage.ts:62-73` (beside `readSlice`) and `:564-577` (the `parsePreset` return)
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/preset/storage.test.ts`, at the end of the file:

```ts
describe('breakpoints', () => {
  const round = (data: unknown) => parsePreset(JSON.stringify(data))

  it('reads a list widest-first whatever order it was written in', () => {
    const preset = round({
      ...DEFAULT_PRESET,
      breakpoints: [
        { from: 0, slice: { id: 'radial', params: {} } },
        { from: 1 / 12, slice: { id: 'curved', params: {} } },
      ],
    })
    expect(preset.breakpoints?.map((point) => point.from)).toEqual([1 / 12, 0])
  })

  it('drops an entry with no usable width or no usable layout', () => {
    const preset = round({
      ...DEFAULT_PRESET,
      breakpoints: [
        { from: 'wide', slice: { id: 'radial', params: {} } },
        { from: -1, slice: { id: 'radial', params: {} } },
        { from: 0.1, slice: { id: 'spiral', params: {} } },
        { from: 0.2, slice: { id: 'curved', params: {} } },
      ],
    })
    expect(preset.breakpoints).toEqual([{ from: 0.2, slice: { id: 'curved', params: {} } }])
  })

  it('leaves a preset with no list undefined rather than empty', () => {
    expect(round({ ...DEFAULT_PRESET }).breakpoints).toBeUndefined()
    expect(round({ ...DEFAULT_PRESET, breakpoints: [] }).breakpoints).toBeUndefined()
    expect(round({ ...DEFAULT_PRESET, breakpoints: 'nope' }).breakpoints).toBeUndefined()
  })

  it('reads the parts of a breakpoint the way it reads any other slice', () => {
    const preset = round({
      ...DEFAULT_PRESET,
      breakpoints: [{ from: 0, slice: { id: 'composed', params: { parts: 'nope' } } }],
    })
    expect(preset.breakpoints?.[0].slice.params.parts).toEqual([])
  })
})
```

Check the top of `src/preset/storage.test.ts` for how `parsePreset` and `DEFAULT_PRESET` are already imported; add whichever is missing rather than duplicating an import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/preset/storage.test.ts -t breakpoints`
Expected: FAIL — `breakpoints` is undefined on every read.

- [ ] **Step 3: Add the field to the preset type**

In `src/preset/types.ts`, add the import:

```ts
import type { Breakpoint } from '../slice/breakpoints'
```

and, immediately after the `slice` field in `Preset`:

```ts
  /**
   * Widths that get a layout of their own, widest first. A wedge matching none
   * of them takes `slice`.
   */
  breakpoints?: Breakpoint[]
```

- [ ] **Step 4: Write the reader**

In `src/preset/storage.ts`, add to the imports:

```ts
import type { Breakpoint } from '../slice/breakpoints'
```

and add this function directly below `readSlice` (after line 73):

```ts
function readBreakpoints(value: unknown): Breakpoint[] | undefined {
  if (!Array.isArray(value)) return undefined

  const points: Breakpoint[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.from !== 'number' || !Number.isFinite(entry.from) || entry.from < 0) continue
    const slice = readSlice(entry.slice)
    if (slice === undefined) continue
    points.push({ from: entry.from, slice })
  }
  points.sort((a, b) => b.from - a.from)

  // Undefined rather than empty, so a preset that never had breakpoints and one
  // whose breakpoints were all unreadable are the same preset.
  return points.length > 0 ? points : undefined
}
```

Then add to the `parsePreset` return object, directly after `slice: readSlice(data.slice),`:

```ts
    breakpoints: readBreakpoints(data.breakpoints),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/preset/types.ts src/preset/storage.ts src/preset/storage.test.ts
git commit -m "feat(preset): carry a wheel's width breakpoints"
```

---

### Task 4: The wheel resolves at the layout arc

This is where both breakages get fixed. Read the spec's "Two things that will break" before starting.

**Files:**
- Modify: `src/wheel/Wheel.tsx:31-69` (props), `:158-165` (faces), `:222-223` (resolution)
- Test: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/wheel/Wheel.test.tsx`, in a new describe block at the end of the file:

```tsx
describe('breakpoints', () => {
  // `radial` paints plain <text>, `curved` paints a <textPath>. That is the whole
  // discriminator: which one a wedge got is readable straight off the DOM.
  // `AUTO` is no good here — its first ladder rung is curved too, so a wide
  // wedge produces a textPath whether a breakpoint fired or not.
  const RADIAL: SliceInstance = { id: 'radial', params: {} }
  const curvedAt = (from: number) => [{ from, slice: { id: 'curved' as const, params: {} } }]

  const evenly = (count: number): Segment[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `w${index}`,
      label: 'Cal Whitmore',
      weight: 1,
    }))

  it('takes the breakpoint a wedge is wide enough for', () => {
    // Two wedges is half a turn each, well over a quarter-turn floor.
    const { container } = render(
      <Wheel segments={evenly(2)} slice={RADIAL} breakpoints={curvedAt(0.25)} />,
    )
    expect(container.querySelector('textPath')).not.toBeNull()
  })

  it('leaves a wedge below every floor exactly as it was', () => {
    // Eight wedges is an eighth of a turn each, under the floor.
    const { container } = render(
      <Wheel segments={evenly(8)} slice={RADIAL} breakpoints={curvedAt(0.25)} />,
    )
    expect(container.querySelector('textPath')).toBeNull()
  })
})
```

- [ ] **Step 2: Write the test that pins the morph fix**

A wedge whose arc is animating must resolve against the layout arc, not the presence arc. `Wheel` already takes `layoutFrom` for exactly this, so the test drives it directly — no clock needed. Wedge `a` is a hundredth of a turn as drawn and half a turn as laid out, so the two arcs sit on opposite sides of the floor. Add to the same describe block:

```tsx
  // The arc a morph is animating through must not pick the layout; only the arc
  // the wheel lays out against may. Otherwise a wedge crosses a floor mid-spin
  // and re-lays-out under the pointer.
  it('resolves against the layout arc rather than the drawn one', () => {
    const drawn: Segment[] = [
      { id: 'a', label: 'Cal Whitmore', weight: 1 },
      { id: 'b', label: 'Cal Whitmore', weight: 99 },
    ]
    const layout: Segment[] = [
      { id: 'a', label: 'Cal Whitmore', weight: 1 },
      { id: 'b', label: 'Cal Whitmore', weight: 1 },
    ]
    const { container } = render(
      <Wheel segments={drawn} layoutFrom={layout} slice={RADIAL} breakpoints={curvedAt(0.25)} />,
    )

    expect(container.querySelector('[data-segment-id="a"] textPath')).not.toBeNull()
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/wheel/Wheel.test.tsx -t breakpoints`
Expected: FAIL — `breakpoints` is not a prop, so nothing curves.

- [ ] **Step 4: Add the prop**

In `src/wheel/Wheel.tsx`, add to the imports:

```ts
import type { Breakpoint } from '../slice/breakpoints'
```

and change the `getSlice, resolveInstance` import to:

```ts
import { getSlice, instancesUsed, resolveInstance } from '../slice/registry'
```

Add to `WheelProps`, directly after the `slice` prop:

```ts
  /** Widths that get a layout of their own. A wedge matching none takes `slice`. */
  breakpoints?: Breakpoint[]
```

and to the destructured parameter list, directly after `slice,`:

```ts
  breakpoints,
```

- [ ] **Step 5: Fix font preloading**

Replace the `faces` memo (lines 158-165) with:

```ts
  // Every face a wedge is set in is a webfont, so the first render measures
  // whatever the fallback is. Every breakpoint's faces, not the resolved one's:
  // resolution happens per wedge per frame, and a face requested only once a
  // wedge reaches its breakpoint arrives after that wedge has been measured.
  const faces = useMemo(
    () => facesUsed(instancesUsed(segments, slice, breakpoints), theme.font),
    [segments, slice, breakpoints, theme.font],
  )
```

- [ ] **Step 6: Resolve at the layout arc**

Replace line 223 (`const instance = resolveInstance(segment, slice)`) with:

```ts
              const instance = resolveInstance(
                segment,
                slice,
                breakpoints,
                layoutArc.end - layoutArc.start,
              )
```

It already sits directly below `const layoutArc = …`, which is the arc the layouts are fitted against — leave that line where it is.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/wheel/Wheel.tsx src/wheel/Wheel.test.tsx
git commit -m "feat(wheel): give a wedge the layout its width earns"
```

---

### Task 5: The fit report tells the truth

The report exists so an operator can read what each wedge resolves to before the wheel is on a screen. Left alone it would report the wheel default for a wedge a breakpoint is about to relayout.

**Files:**
- Modify: `src/slice/report.ts:20-42`
- Modify: `src/editor/FitReport.tsx:8-17`
- Test: `src/slice/report.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/slice/report.test.ts`:

```ts
it('reports the breakpoint a wedge is wide enough for', () => {
  const segments = [
    { id: 'a', label: 'Cal Whitmore', weight: 1 },
    { id: 'b', label: 'Cal Whitmore', weight: 1 },
  ]
  const points = [{ from: 0.25, slice: { id: 'curved' as const, params: {} } }]
  const rows = fitReport(segments, AUTO, 200, measure, points)

  expect(rows.map((row) => row.drawn)).toEqual(['Cal Whitmore', 'Cal Whitmore'])
})
```

`measure` and `AUTO` are both already declared at the top of this file — reuse them rather than making second ones.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/report.test.ts`
Expected: FAIL — `fitReport` takes four arguments, so the breakpoints are ignored and the rows come back degraded.

- [ ] **Step 3: Widen `fitReport`**

In `src/slice/report.ts`, add to the imports:

```ts
import type { Breakpoint } from './breakpoints'
```

Add a fifth parameter to `fitReport` and use it. The signature becomes:

```ts
export function fitReport(
  segments: Segment[],
  wheelDefault: SliceInstance | undefined,
  radius: number,
  measure: Measure,
  breakpoints?: Breakpoint[],
): FitRow[] {
```

and inside the map, replace `const instance = resolveInstance(segment, wheelDefault)` with the arc-aware form — note `arc` is read on the next line today, so move it up:

```ts
    const arc = layout[index]
    const instance = resolveInstance(segment, wheelDefault, breakpoints, arc.end - arc.start)
```

and delete the now-duplicated `const arc = layout[index]` below it.

- [ ] **Step 4: Pass it from the panel**

In `src/editor/FitReport.tsx`, add the import:

```ts
import type { Breakpoint } from '../slice/breakpoints'
```

add to `FitReportProps`, after `slice`:

```ts
  breakpoints?: Breakpoint[]
```

and thread it through the signature and the call:

```ts
export function FitReport({ segments, slice, breakpoints, radius = 200, measure }: FitReportProps) {
  const fallback = useMemo(() => createMeasure(), [])
  const rows = fitReport(segments, slice, radius, measure ?? fallback, breakpoints)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/slice/report.test.ts src/editor/FitReport.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/slice/report.ts src/slice/report.test.ts src/editor/FitReport.tsx
git commit -m "feat(slice): report the layout each wedge's width resolves to"
```

---

### Task 6: Wire the preset through both wheels

**Files:**
- Modify: `src/App.tsx:199`
- Modify: `src/editor/Editor.tsx:238` and `:270`

- [ ] **Step 1: Add the prop at both call sites**

In `src/App.tsx`, directly below `slice={preset.slice}` inside the `<Wheel>`:

```tsx
          breakpoints={preset.breakpoints}
```

In `src/editor/Editor.tsx`, directly below `slice={preset.slice}` inside the `<Wheel>`:

```tsx
            breakpoints={preset.breakpoints}
```

and change the fit report to:

```tsx
          <FitReport segments={shown} slice={preset.slice} breakpoints={preset.breakpoints} />
```

- [ ] **Step 2: Typecheck and run the suite**

Run: `npm run build && npm test`
Expected: PASS both.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/editor/Editor.tsx
git commit -m "feat(preset): give the show and editor wheels their breakpoints"
```

---

### Task 7: The studio resolves each preview at its own width

The gallery is eight widths of one wedge side by side, which is exactly the surface breakpoints are authored against — but every preview currently draws the same resolved instance.

**Files:**
- Modify: `src/studio/SliceStudio.tsx:55-77` and the gallery JSX
- Modify: `src/studio/Studio.css`
- Test: `src/studio/SliceStudio.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/studio/SliceStudio.test.tsx`:

```ts
it('draws each preview as the width it is, not as the wedge resolves once', () => {
  savePreset({
    ...loadPreset(),
    slice: { id: 'radial', params: {} },
    // A twelfth of a turn is 30°, so only the last step and the wide pair clear it.
    breakpoints: [{ from: 1 / 12, slice: { id: 'curved', params: {} } }],
  })
  render(<SliceStudio />)

  const curvedIn = (deg: number) =>
    screen.getByRole('img', { name: `wedge at ${deg} degrees` }).querySelector('textPath') !== null

  expect(curvedIn(30)).toBe(true)
  expect(curvedIn(8)).toBe(false)
})

it('names the breakpoint a preview landed on', () => {
  savePreset({
    ...loadPreset(),
    breakpoints: [{ from: 1 / 12, slice: { id: 'curved', params: {} } }],
  })
  render(<SliceStudio />)

  expect(screen.getAllByText('Curved').length).toBeGreaterThan(0)
})
```

`savePreset` and `loadPreset` are already imported in this file; the `beforeEach` already clears storage.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/studio/SliceStudio.test.tsx -t breakpoint`
Expected: FAIL — every preview draws the same instance and no caption names a layout.

- [ ] **Step 3: Resolve per width**

In `src/studio/SliceStudio.tsx`, change the registry import to:

```ts
import { getSlice, instancesUsed, resolveInstance } from '../slice/registry'
```

and add:

```ts
import { sliceAt } from '../slice/breakpoints'
```

Replace the block from `const instance = resolveInstance(segment, preset.slice)` through the `faces` memo with:

```ts
  // The wedge's own layout beats the one being edited, which is what makes an
  // overridden wedge visibly not answer to this page.
  const instanceAt = (degrees: number) =>
    resolveInstance(segment, preset.slice, preset.breakpoints, degrees / 360)

  /**
   * The layout a breakpoint put on this width, or null where none did — so the
   * caption stays a bare width until breakpoints are actually in play. Null for
   * an overridden wedge too: the override won, so naming a breakpoint there
   * would name something the preview is not drawing.
   */
  const breakpointAt = (degrees: number): string | null => {
    if (segment.slice) return null
    const matched = sliceAt(preset.breakpoints, degrees / 360)
    return matched ? (getSlice(matched.id)?.name ?? null) : null
  }

  const faces = useMemo(
    () => facesUsed(instancesUsed([segment], preset.slice, preset.breakpoints), theme.font),
    [segment, preset.slice, preset.breakpoints, theme.font],
  )
```

Then drop `instance` from `shared`:

```ts
  const shared = { segment, theme, measure, fill, hub, showBands }
```

- [ ] **Step 4: Draw it**

In the gallery JSX, give each of the three `<WedgePreview>` call sites its own instance, and each caption its resolved name. The stepped list becomes:

```tsx
            {ARC_STEPS.map((step) => {
              const named = breakpointAt(step)
              return (
                <li className="studio__slot" key={step}>
                  <WedgePreview {...shared} instance={instanceAt(step)} degrees={step} />
                  <p className="studio__caption">
                    {turnFraction(step)}
                    {named && <span className="studio__resolved">{named}</span>}
                  </p>
                </li>
              )
            })}
```

the wide list becomes:

```tsx
            {WIDE_ARC_STEPS.map((step) => {
              const named = breakpointAt(step)
              return (
                <li className="studio__slot" key={step}>
                  <WedgePreview
                    {...shared}
                    instance={instanceAt(step)}
                    degrees={step}
                    fitDegrees={step}
                  />
                  <p className="studio__caption">
                    {turnFraction(step)}
                    {named && <span className="studio__resolved">{named}</span>}
                  </p>
                </li>
              )
            })}
```

and the scrubbed slot's preview and caption become:

```tsx
              <WedgePreview {...shared} instance={instanceAt(scrubbed)} degrees={scrubbed} />
              <p className="studio__caption">
                {scrubbed}°
                {breakpointAt(scrubbed) && (
                  <span className="studio__resolved">{breakpointAt(scrubbed)}</span>
                )}
              </p>
```

- [ ] **Step 5: Style the name**

Add to `src/studio/Studio.css`, after the `.studio__caption` rule at line 59:

```css
/* The layout a breakpoint put on this width. Set apart from the width itself,
   which is what the caption is about. */
.studio__resolved {
  margin-left: 0.4rem;
  opacity: 0.7;
  font-style: italic;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/studio/SliceStudio.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/studio/SliceStudio.tsx src/studio/Studio.css src/studio/SliceStudio.test.tsx
git commit -m "feat(studio): draw each preview as the width it is"
```

---

### Task 8: Author the breakpoints

Nothing so far can put a breakpoint on a preset from inside the app. The panel goes in the studio rather than the editor because the studio is the only page that shows what a width does.

**Files:**
- Create: `src/editor/BreakpointPanel.tsx`
- Create: `src/editor/BreakpointPanel.test.tsx`
- Modify: `src/studio/SliceStudio.tsx` (the controls column)

- [ ] **Step 1: Write the failing test**

Create `src/editor/BreakpointPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BreakpointPanel } from './BreakpointPanel'

describe('BreakpointPanel', () => {
  it('adds a breakpoint to an empty list', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={undefined} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add breakpoint' }))

    expect(onChange).toHaveBeenCalledWith([
      { from: expect.any(Number), slice: { id: 'composed', params: expect.anything() } },
    ])
  })

  it('writes a width in degrees as turns', async () => {
    const onChange = vi.fn()
    render(
      <BreakpointPanel
        breakpoints={[{ from: 0.25, slice: { id: 'curved', params: {} } }]}
        onChange={onChange}
      />,
    )

    const width = screen.getByLabelText('From (degrees)')
    await userEvent.clear(width)
    await userEvent.type(width, '30')

    expect(onChange).toHaveBeenLastCalledWith([
      { from: 30 / 360, slice: { id: 'curved', params: {} } },
    ])
  })

  it('changes the layout a breakpoint carries', async () => {
    const onChange = vi.fn()
    render(
      <BreakpointPanel
        breakpoints={[{ from: 0.25, slice: { id: 'curved', params: {} } }]}
        onChange={onChange}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'radial')

    expect(onChange).toHaveBeenCalledWith([
      { from: 0.25, slice: { id: 'radial', params: expect.anything() } },
    ])
  })

  // Undefined rather than empty: an empty list and no list mean the same thing,
  // and only one of them round-trips through storage.
  it('clears the list rather than leaving it empty', async () => {
    const onChange = vi.fn()
    render(
      <BreakpointPanel
        breakpoints={[{ from: 0.25, slice: { id: 'curved', params: {} } }]}
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/BreakpointPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./BreakpointPanel"`.

- [ ] **Step 3: Write the panel**

Create `src/editor/BreakpointPanel.tsx`:

```tsx
import { NumberRow, PropertyPanel, SelectRow, Subpanel } from '@weasel-js/labkit'
import type { Breakpoint } from '../slice/breakpoints'
import { DEFAULT_SLICE, SLICE_LIST, getSlice } from '../slice/registry'
import type { SliceParams } from '../slice/types'
import { RecipeForm } from './RecipeForm'

export type BreakpointPanelProps = {
  breakpoints: Breakpoint[] | undefined
  onChange: (breakpoints: Breakpoint[] | undefined) => void
}

/** A twelfth of a turn — the width the name plate stops reading below. */
const NEW_BREAKPOINT_FROM = 1 / 12

const degreesOf = (turns: number): number => Math.round(turns * 360 * 10) / 10

export function BreakpointPanel({ breakpoints, onChange }: BreakpointPanelProps) {
  const list = breakpoints ?? []

  // Widest first on every write, so the list a preset stores and the list this
  // panel shows are in the one order the resolver documents.
  const write = (next: Breakpoint[]) =>
    onChange(next.length > 0 ? [...next].sort((a, b) => b.from - a.from) : undefined)

  const replace = (index: number, point: Breakpoint) =>
    write(list.map((entry, at) => (at === index ? point : entry)))

  return (
    <PropertyPanel title="Widths">
      {list.map((point, index) => {
        const layout = getSlice(point.slice.id)
        return (
          <Subpanel key={`${point.from}-${index}`} title={`From ${degreesOf(point.from)}°`}>
            <NumberRow
              label="From (degrees)"
              value={degreesOf(point.from)}
              min={0}
              max={360}
              step={1}
              onChange={(degrees) => replace(index, { ...point, from: degrees / 360 })}
            />
            <SelectRow
              label="Layout"
              value={point.slice.id}
              options={SLICE_LIST.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                const chosen = getSlice(value)
                if (!chosen) return
                replace(index, { ...point, slice: { id: chosen.id, params: { ...chosen.defaults } } })
              }}
            />
            {layout && layout.fields.length > 0 ? (
              <RecipeForm
                fields={layout.fields}
                params={point.slice.params}
                segments={[]}
                onChange={(params: SliceParams) =>
                  replace(index, { ...point, slice: { ...point.slice, params } })
                }
              />
            ) : null}
            <button
              type="button"
              className="breakpoint__remove"
              onClick={() => write(list.filter((_, at) => at !== index))}
            >
              Remove
            </button>
          </Subpanel>
        )
      })}
      <button
        type="button"
        className="breakpoint__add"
        onClick={() => write([...list, { from: NEW_BREAKPOINT_FROM, slice: DEFAULT_SLICE }])}
      >
        Add breakpoint
      </button>
    </PropertyPanel>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/editor/BreakpointPanel.test.tsx`
Expected: PASS, 4 tests.

If the "writes a width in degrees as turns" test sees intermediate calls from typing digit by digit, `toHaveBeenLastCalledWith` is the assertion that survives it — it is already what the test uses. If `userEvent.clear` fires an `onChange` with `NaN`, guard the handler: `Number.isFinite(degrees) ? degrees / 360 : point.from`.

- [ ] **Step 5: Put it in the studio**

In `src/studio/SliceStudio.tsx`, add the import:

```ts
import { BreakpointPanel } from '../editor/BreakpointPanel'
```

and add the panel directly below the existing `<SlicePanel …>` in the controls column:

```tsx
          <BreakpointPanel
            breakpoints={preset.breakpoints}
            onChange={(breakpoints) => update({ ...preset, breakpoints })}
          />
```

- [ ] **Step 6: Write the studio test that closes the loop**

Add to `src/studio/SliceStudio.test.tsx`:

```tsx
it('authors a breakpoint that the gallery immediately draws', async () => {
  render(<SliceStudio />)

  await userEvent.click(screen.getByRole('button', { name: 'Add breakpoint' }))

  expect(loadPreset().breakpoints).toHaveLength(1)
  // `DEFAULT_SLICE` is the composed layout, and a new breakpoint's floor of a
  // twelfth of a turn is exactly the 30° step, so that caption names it.
  expect(screen.getAllByText('Composed').length).toBeGreaterThan(0)
})
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run src/studio src/editor && npm run build`
Expected: PASS both.

- [ ] **Step 8: Commit**

```bash
git add src/editor/BreakpointPanel.tsx src/editor/BreakpointPanel.test.tsx src/studio/SliceStudio.tsx src/studio/SliceStudio.test.tsx
git commit -m "feat(studio): author the widths that get a layout of their own"
```

---

### Task 9: Whole-suite verification and format

- [ ] **Step 1: Format**

Run: `npm run check`
Expected: files written, no errors left.

- [ ] **Step 2: Typecheck and full suite**

Run: `npm run build && npm test`
Expected: PASS both. If `npm run check` rewrote anything, commit that too.

- [ ] **Step 3: See it in the app**

Run: `npm run dev` and open `http://localhost:5173/#/slice`. Add a breakpoint, set it to 30° with the `Radial` layout, and check that 30° and the wide pair switch to radial while 8°, 12°, 15° and 20° keep the name plate. Screenshot the gallery and `open` it so it lands on screen.

- [ ] **Step 4: Commit anything the format pass touched**

```bash
git add -A
git commit -m "chore: format"
```

---

## Known adjacent bug, deliberately not fixed here

`src/studio/Studio.css:65-79` has a comment spliced into the middle of the
`.studio__slot--scrubbed .studio__band` selector, which left the following
`.studio__caption` rule global instead of scoped to the scrubbed slot. It
predates this work and changes what every caption looks like, so fixing it here
would hide a visual change inside a feature commit. Worth its own commit.
