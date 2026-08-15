# Slice/Presence Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `main` into `feat/wedge-presence-impl` so the slice registry and the wedge presence sampler share one render, then land the result on `main`.

**Architecture:** `usePresence` owns which wedges are drawn, the arc each holds this frame (the **presence arc**), and its color. The slice registry owns what is drawn inside a wedge, fitting its label against the **layout arc** — `arcs(layoutFrom ?? segments)`, keyed by id, with a per-id memory so a departing wedge keeps the arc it last had. `Wheel` is the only place the two meet.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-slice-presence-merge-design.md`

**Where the work happens:** the worktree at `/Users/mike/src/wod/.claude/worktrees/wedge-presence`, on `feat/wedge-presence-impl`. `main` is checked out separately at `/Users/mike/src/wod-meet` and is not touched until Task 8. All paths below are relative to the worktree.

---

## File structure

| File | Responsibility after this plan |
| --- | --- |
| `src/wheel/Wheel.tsx` | Modify. Draws the presence draw list; resolves each wedge's layout arc and hands it to the slice registry. The only place the two systems meet. |
| `src/wheel/Wheel.test.tsx` | Modify. Gains a hand-pumped clock and the layout-arc rules. |
| `src/wheel/Wheel.css` | Modify. Keeps both the level transform box and the wedge custom properties. |
| `src/wheel/useSpin.ts` | Modify. Returns both field sets; reads a level element's angle when the spin is planned rather than when the element mounts. |
| `src/wheel/useSpin.test.ts` | Modify. Pins the angle being read late. |
| `src/App.tsx` | Modify. Passes both prop sets. |
| `src/wheel/label.ts`, `src/wheel/label.test.ts` | Delete. `main` replaced this rendering with the slice registry. |
| `.gitignore` | Modify. Keeps both ignore lines. |

Nothing is created. The presence modules (`src/transition/tracks.ts`, `sample.ts`, `usePresence.ts`) and the slice modules (`src/slice/*`) are untouched — the whole integration lives in `Wheel`.

---

### Task 1: Take the merge

One commit that resolves all five conflicts and leaves both suites green. Nothing here is a design decision; every choice is written out below.

**Files:**
- Modify: `.gitignore`, `src/App.tsx`, `src/wheel/Wheel.css`, `src/wheel/Wheel.tsx`, `src/wheel/useSpin.ts`, `src/wheel/Wheel.test.tsx`
- Delete: `src/wheel/label.ts`, `src/wheel/label.test.ts`

- [ ] **Step 1: Start the merge**

```bash
git merge main
```

Expected: `CONFLICT (content)` in exactly five files — `.gitignore`, `src/App.tsx`, `src/wheel/Wheel.css`, `src/wheel/Wheel.tsx`, `src/wheel/useSpin.ts`. `src/transition/useEnter.ts` and `src/transition/useEnter.test.tsx` are deleted by the merge without conflict; that is correct, `usePresence` replaced them.

- [ ] **Step 2: Resolve `.gitignore`**

Keep both lines. The file ends:

```
node_modules
dist
.DS_Store
*.local
.playwright-shots/
.superpowers/
.claude/worktrees/
```

- [ ] **Step 3: Resolve `src/wheel/useSpin.ts`**

The conflict is the return statement. Take the union of both field sets:

```ts
  return {
    displaySegments,
    layoutSegments,
    isSpinning,
    held,
    landing,
    spin,
    release,
    reset,
    rotorRef,
    levelRef,
  }
```

In the same file, the comment above `levels` says "Registered by the wheel, the way `useEnter` collects its wedges". `useEnter` no longer exists. Replace that sentence:

```ts
  // Registered by the wheel: a spin needs the elements themselves, and only the
  // renderer knows where they are.
```

- [ ] **Step 4: Resolve `src/App.tsx`**

Both hunks take the union. The destructure:

```tsx
  const {
    displaySegments,
    layoutSegments,
    isSpinning,
    held,
    landing,
    spin,
    release,
    reset,
    rotorRef,
    levelRef,
  } = useSpin(resolved.segments, config)
```

And the element:

```tsx
      <Wheel
        segments={displaySegments}
        layoutFrom={layoutSegments}
        slice={preset.slice}
        rotorRef={rotorRef}
        levelRef={levelRef}
        transitions={preset.transitions}
        held={held}
      />
```

- [ ] **Step 5: Resolve `src/wheel/Wheel.css`**

Keep both blocks. The file ends:

```css
/* CSS transforms on SVG default to a bounding-box origin, which would make
   every wedge rotate about its own middle rather than about the hub. The
   transforms `css.ts` emits are written in the wheel's coordinate system. */
.wheel__stage,
.wheel__wedge {
  transform-box: view-box;
  transform-origin: 0 0;
}

.wheel__wedge {
  transform: var(--wedge-transform, none);
  opacity: var(--wedge-opacity, 1);
  clip-path: var(--wedge-clip, none);
}

/* The counter-rotation has to pivot on the label itself. Without these, a CSS
   transform on an SVG element resolves its origin against the viewBox and the
   label orbits the hub instead of holding still. */
.wheel__level {
  transform-box: fill-box;
  transform-origin: center;
}
```

`src/transition/css.test.ts` asserts this file binds `--wedge-transform`, `--wedge-opacity` and `--wedge-clip` to the properties they drive, so dropping that block fails a test rather than silently unanimating the wheel.

- [ ] **Step 6: Resolve `src/wheel/Wheel.tsx`**

Replace the whole file. This is the merge: the draw list and the group style come from the presence side, everything inside the wedge comes from the slice side.

```tsx
import type { Ref } from 'react'
import { useMemo } from 'react'
import { createFit } from '../slice/fit'
import { createMeasure } from '../slice/measure'
import { getSlice, resolveInstance } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
import { styleOf } from '../transition/css'
import type { Transitions } from '../transition/types'
import { usePresence } from '../transition/usePresence'
import { SliceElements } from './SliceElements'
import { arcPath, arcs } from './geometry'
import type { Segment } from './types'
import './Wheel.css'

export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
  transitions?: Transitions
  /** The wheel's default layout. A segment's own `slice` beats it. */
  slice?: SliceInstance
  /**
   * Geometry the layouts resolve against, when it differs from what is drawn.
   * A morph changes weights every frame; resolving against those would pop
   * labels between orientations mid-spin.
   */
  layoutFrom?: Segment[]
  /** Registers a level group by segment id so a spin can counter-rotate it. */
  levelRef?: (id: string, restingDeg: number) => (element: SVGGElement | null) => void
  /**
   * Something other than the roster owns the geometry, so presences settle and
   * stay settled. Takes the condition rather than the cause: a running spin and
   * a landed frame not yet released both mean it.
   */
  held?: boolean
}

/**
 * How far the tip reaches past the rim. A physical pointer wants to just brush
 * each wedge as it goes by — enough to catch an edge, not enough to jam the
 * wheel — so this stays small on purpose.
 */
const POINTER_BITE = 3
const POINTER_LENGTH = 22
const POINTER_HALF_WIDTH = 12
/** The outer end, which is where a flicking pointer would pivot. */
const POINTER_BASE = POINTER_LENGTH - POINTER_BITE
// Two extra units so the base is not sitting exactly on the clip edge.
const VIEWBOX_PAD = POINTER_BASE + 2

const midDeg = (arc: { start: number; end: number }): number =>
  (arc.start + (arc.end - arc.start) / 2) * 360

export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  slice,
  layoutFrom,
  levelRef,
  held = false,
}: WheelProps) {
  const drawn = usePresence(segments, transitions, held)
  const half = radius + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  // One measurer per wheel, so the string cache outlives a render.
  const measure = useMemo(() => createMeasure(), [])
  const fit = useMemo(() => createFit(measure), [measure])

  const layoutArcs = new Map(arcs(layoutFrom ?? segments).map((arc) => [arc.id, arc]))

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
          {drawn.map(({ segment, arc: presenceArc, presence }, index) => {
            const width = presenceArc.end - presenceArc.start
            if (!(width > 0)) return null

            const d = arcPath(presenceArc.start, presenceArc.end, radius)
            if (d === '') return null

            const layoutArc = layoutArcs.get(segment.id) ?? presenceArc
            const instance = resolveInstance(segment, slice)
            const authored = getSlice(instance.id)
            const elements = authored
              ? authored.draw(instance.params, {
                  segment,
                  arc: { start: layoutArc.start, end: layoutArc.end },
                  radius,
                  index,
                  count: drawn.length,
                  measure,
                  fit,
                })
              : []

            return (
              <g
                key={segment.id}
                className="wheel__wedge"
                data-segment-id={segment.id}
                style={styleOf(presence, {
                  angle: midDeg(presenceArc),
                  radius,
                  pivot: radius * 0.6,
                })}
              >
                <path className="wheel__segment" d={d} fill={segment.color} />
                <SliceElements
                  elements={elements}
                  arc={presenceArc}
                  radius={radius}
                  id={segment.id}
                  levelRef={levelRef?.(segment.id, -midDeg(presenceArc))}
                />
              </g>
            )
          })}
        </g>
      </g>
      {/* Apex inward: the tip is the thing that names a winner, so it points at
          the wedge rather than away from it, dipping just past the rim. */}
      <polygon
        className="wheel__pointer"
        points={`0,${-radius + POINTER_BITE} ${-POINTER_HALF_WIDTH},${-radius - POINTER_BASE} ${POINTER_HALF_WIDTH},${-radius - POINTER_BASE}`}
      />
    </svg>
  )
}
```

`paletteColor` is gone from the imports and from the fill: `usePresence` assigns a color to every uncolored segment, by id, and a second fallback here would hide a missing assignment behind a plausible color.

`levelRef` still gets the presence angle in this task. Task 5 changes it, with a test.

- [ ] **Step 7: Delete the superseded label rendering**

```bash
git rm src/wheel/label.ts src/wheel/label.test.ts
```

Nothing else imports them: `Wheel.tsx` was the only consumer and Step 6 removed the import.

- [ ] **Step 8: Drop the superseded test**

In `src/wheel/Wheel.test.tsx`, delete the whole `it('flips labels that would otherwise read upside down', …)` block. It asserts on `text.wheel__label` transform attributes that `fitLabel` used to emit. `main`'s `it('gives every wedge the same handedness, whatever half it sits on', …)`, two tests below it, covers the same concern through the layouts.

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: PASS. Both suites now run against one component — `main`'s slice tests and the branch's presence tests. If `renders segment labels` or `draws a label through the resolved layout` fails, the slice side is not reaching the DOM; if `draws an arriving wedge from its transition start` fails, the presence side is not.

- [ ] **Step 10: Build and lint**

Run: `npm run build && npx biome check .`
Expected: both clean. `npm run build` runs `tsc --noEmit` first, which is what catches a prop or field left out of Steps 3-4.

- [ ] **Step 11: Commit the merge**

```bash
git add -A
git commit -m "merge: draw the presence list through the slice registry"
```

---

### Task 2: Pin the layout-arc fit

A wedge mid-transition fits its label against its layout arc, not the arc it is drawn at. Task 1 already does this; this task is the guard, because nothing yet fails if the two are swapped.

The observable: text is measured with `estimateWidth` under jsdom (`vitest.setup.ts` forces `getContext` to null), so a fit is deterministic and sensitive to arc width. One of four equal wedges spans 0.25 of the wheel and fits "Cal Whitmore" curved at size 26. At `hold` 0.5 against three resting neighbors it spans 0.5/3.5 ≈ 0.143 and fits at roughly 16.

**Files:**
- Modify: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Add the clock harness**

At the top of `src/wheel/Wheel.test.tsx`, after the existing imports, add `act` to the Testing Library import and add `vi` to the vitest import, then add:

```tsx
/**
 * A hand-pumped rAF clock, so a test can watch a transition mid-flight rather
 * than only on the frame it starts. Mirrors the one in usePresence.test.tsx,
 * which exists for the same reason.
 */
function installClock() {
  const queue = new Map<number, FrameRequestCallback>()
  let next = 1
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = next++
    queue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id)
  })
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)

  return {
    advance(ms: number) {
      now += ms
      const due = [...queue.entries()]
      queue.clear()
      act(() => {
        for (const [, cb] of due) cb(now)
      })
    },
    restore() {
      vi.unstubAllGlobals()
      clock.mockRestore()
    },
  }
}

/**
 * One label for every wedge, so two wedges of equal arc fit identically and a
 * test can compare them. Stay at five wedges or more: "Cal Whitmore" saturates
 * the `maxSize` cap of 26 anywhere above about a fifth of the wheel, and two
 * clamped sizes match however wrong the arc feeding them was.
 */
const roster = (ids: string[]): Segment[] =>
  ids.map((id) => ({ id, label: 'Cal Whitmore', weight: 1 }))

/** Arriving and leaving both animate the arc, which is what moves a fit. */
const opening = {
  enter: { id: 'shrink' as const, params: { durationMs: 400, staggerMs: 0 } },
  exit: { id: 'shrink' as const, params: { durationMs: 400, staggerMs: 0 } },
}

const labelSize = (container: HTMLElement, id: string) =>
  container
    .querySelector(`[data-segment-id="${id}"] text.wheel__label`)
    ?.getAttribute('font-size')
```

- [ ] **Step 2: Write the test**

Append inside the `describe('Wheel', …)` block:

```tsx
  it('fits a label against the layout arc, not the arc it is drawn at', () => {
    const clock = installClock()
    try {
      // Five at rest, then a sixth joins: only the newcomer's arc is moving, so
      // its layout arc (a sixth of the wheel, fitting at 18.88) and its presence
      // arc (0.5/5.5 of it, halfway through a shrink, fitting at 10.29)
      // disagree, and neither is near the size cap that would hide the gap.
      const { container, rerender } = render(
        <Wheel segments={roster(['ana', 'ben', 'cy', 'dee', 'eli'])} transitions={opening} />,
      )
      clock.advance(1000)

      rerender(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli', 'cal'])}
          transitions={opening}
        />,
      )
      clock.advance(200)

      expect(labelSize(container, 'cal')).toBe('18.88')
      expect(labelSize(container, 'ana')).toBe('18.88')
    } finally {
      clock.restore()
    }
  })
```

**Six wedges, not four.** A fit is clamped at `maxSize` 26 anywhere above about a
fifth of the wheel, so a four-wedge test compares two clamped sizes and passes
whatever arc fed them — it fails under the mutation only because the mutation
happens to push one side under the ceiling. At a sixth both sides are
width-derived, and the numbers are asserted outright rather than against each
other so a uniform breakage cannot make the test agree with itself.

- [ ] **Step 3: Run it**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS. Task 1 built it this way; this test is what stops it being undone.

- [ ] **Step 4: Mutation-check it**

In `src/wheel/Wheel.tsx`, temporarily change the `draw` call's `arc:` to `{ start: presenceArc.start, end: presenceArc.end }`.

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL on the new test. Revert the change and confirm the suite passes again. If it does not fail, the fit is not sensitive at these widths and the test is worthless — widen the gap by adding wedges rather than accepting a green run.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/Wheel.test.tsx
git commit -m "test(wheel): pin a mid-transition label to its layout arc"
```

---

### Task 3: Remember a departing wedge's layout arc

A wedge that has left the roster is absent from `arcs(layoutFrom ?? segments)`, so it currently falls back to its presence arc and re-fits its label every frame while it closes — the popping Task 2 just ruled out, on the one wedge that cannot be re-fitted correctly.

**Files:**
- Modify: `src/wheel/Wheel.test.tsx`
- Modify: `src/wheel/Wheel.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('Wheel', …)` block in `src/wheel/Wheel.test.tsx`:

```tsx
  it('keeps a departing wedge on the layout arc it last had', () => {
    const clock = installClock()
    try {
      const { container, rerender } = render(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli', 'cal'])}
          transitions={opening}
        />,
      )
      clock.advance(1000)
      expect(labelSize(container, 'cal')).toBe('18.88')

      rerender(
        <Wheel segments={roster(['ana', 'ben', 'cy', 'dee', 'eli'])} transitions={opening} />,
      )
      clock.advance(200)

      // Gone from the roster, so there is no layout arc to look up — only the
      // one it had while it was still on the wheel. Its survivors have already
      // grown to a fifth each, so this is not the size anything else now holds.
      expect(container.querySelector('[data-segment-id="cal"]')).not.toBeNull()
      expect(labelSize(container, 'cal')).toBe('18.88')
    } finally {
      clock.restore()
    }
  })
```

Without the memory `cal` falls back to its presence arc — 0.5/5.5 of the wheel,
fitting at 10.29 — which is what Step 2 should show.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — `cal` is drawn, but at the fit its closing arc produces rather than the one it had.

- [ ] **Step 3: Write the implementation**

In `src/wheel/Wheel.tsx`, add `useRef` to the React import and `type Arc` to the geometry import:

```tsx
import { useMemo, useRef } from 'react'
```

```tsx
import { type Arc, arcPath, arcs } from './geometry'
```

Then replace the `layoutArcs` line inside the component:

```tsx
  // A wedge that has left the roster has no layout arc to look up, so the last
  // one it had is kept for as long as it is still being drawn.
  const remembered = useRef(new Map<string, Arc>()).current
  for (const arc of arcs(layoutFrom ?? segments)) remembered.set(arc.id, arc)
  const stillDrawn = new Set(drawn.map((item) => item.segment.id))
  for (const id of [...remembered.keys()]) {
    if (!stillDrawn.has(id)) remembered.delete(id)
  }
```

And the lookup inside the map, replacing the `layoutArcs.get(...)` line:

```tsx
            const layoutArc = remembered.get(segment.id) ?? presenceArc
```

Writing to a ref during render matches `usePresence`, which assigns `tracks.current` the same way and for the same reason: the first painted frame has to be right. Both the writes and the prune are idempotent, so StrictMode's double render changes nothing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS, including Task 2's test.

- [ ] **Step 5: Leave the prune untested, deliberately**

Do not write a test for the prune. Nothing can read a stale entry: the refresh
loop above overwrites every id in the current layout before the lookup runs, and
the only ids that reach the memory instead are the ones absent from that layout —
which are exactly the ones still being drawn. The prune keeps the map from
growing across a session of churn and has no other observable effect, so it is
held by review rather than by an assertion.

- [ ] **Step 6: Commit**

```bash
git add src/wheel/Wheel.tsx src/wheel/Wheel.test.tsx
git commit -m "fix(wheel): keep a departing wedge on the layout arc it last had"
```

---

### Task 4: Read a level element's angle when the spin is planned

A level element is one that stays upright while the rotor turns; `useSpin` counter-rotates it by the angle it was registered with. The registration happens in a ref callback that is memoized per segment id, so the angle a wedge captures on its first render is the angle it keeps — even after the roster changes and the wedge is sitting somewhere else. Nothing on either branch tests this.

This is a defect on `main`, not something the merge introduces. It is in this plan because Task 5 changes which angle `Wheel` passes, and that change means nothing while the value is read once at mount.

**Files:**
- Modify: `src/wheel/useSpin.test.ts`
- Modify: `src/wheel/useSpin.ts`

- [ ] **Step 1: Write the failing test**

In `src/wheel/useSpin.test.ts`, find the two existing tests that call `result.current.levelRef('ana', -45)(element)` and append after the second one, inside the same `describe`:

```ts
  it('counter-rotates by where a wedge is now, not where it first mounted', () => {
    const { result } = renderSpin(PLAIN)
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')

    act(() => {
      result.current.levelRef('ana', -45)(element)
    })
    // The wedge moved — a neighbor left. The ref identity is stable, so React
    // never calls it again and this is the only report the hook will get.
    act(() => {
      result.current.levelRef('ana', -170)(element)
    })
    act(() => {
      result.current.spin()
    })

    const [rotor, level] = harness.animateCalls
    expect(degreesOf(level.keyframes[0])).toBe(-170 - degreesOf(rotor.keyframes[0]))
  })
```

`renderSpin`, `PLAIN`, `harness.animateCalls` and `degreesOf` are the file's own
helpers, used by the two `levelRef` tests directly above this one.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — the keyframe is built from `-45`, the angle captured when the element mounted.

- [ ] **Step 3: Write the implementation**

In `src/wheel/useSpin.ts`, the registration currently stores the element and the angle together. Split them: the element is registered once, the angle is refreshed on every render and read when the spin is planned.

Replace the `levels` / `levelRefs` declarations and `levelRef`:

```ts
  // Registered by the wheel: a spin needs the elements themselves, and only the
  // renderer knows where they are. The angle is kept separately because the ref
  // identity is stable — React calls it on mount and never again, while a wedge
  // moves whenever the roster changes.
  const levels = useRef(new Map<string, SVGGElement>()).current
  const restingDegs = useRef(new Map<string, number>()).current
  const levelRefs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current

  const levelRef = useCallback(
    (id: string, restingDeg: number) => {
      restingDegs.set(id, restingDeg)
      let ref = levelRefs.get(id)
      if (!ref) {
        ref = (element) => {
          if (element) levels.set(id, element)
          else {
            levels.delete(id)
            restingDegs.delete(id)
          }
        }
        levelRefs.set(id, ref)
      }
      return ref
    },
    [levels, restingDegs, levelRefs],
  )
```

Then the loop inside `spin`:

```ts
      for (const [id, element] of levels) {
        element.animate(invertTrack(track, restingDegs.get(id) ?? 0), {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        })
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS, including the two existing `levelRef` tests — one registers and spins, the other unregisters with `(null)` and expects nothing animated.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts
git commit -m "fix(wheel): counter-rotate a level element by where its wedge is now"
```

---

### Task 5: Register the layout angle

`spin()` reads its level registrations synchronously, before the `held → settle` re-render lands. A wedge caught mid-departure would register the angle it happened to be passing through. The layout angle is already what the settle is about to produce.

**Files:**
- Modify: `src/wheel/Wheel.test.tsx`
- Modify: `src/wheel/Wheel.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('Wheel', …)` block in `src/wheel/Wheel.test.tsx`:

```tsx
  it('registers a level element at its layout angle, not the one it is passing through', () => {
    const clock = installClock()
    try {
      const level: SliceInstance = { id: 'auto', params: { frame: 'level' } }
      const seen = new Map<string, number>()
      const levelRef = (id: string, restingDeg: number) => {
        seen.set(id, restingDeg)
        return () => undefined
      }

      const { rerender } = render(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli'])}
          slice={level}
          levelRef={levelRef}
          transitions={opening}
        />,
      )
      clock.advance(1000)

      rerender(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli', 'cal'])}
          slice={level}
          levelRef={levelRef}
          transitions={opening}
        />,
      )
      clock.advance(200)

      // Sixth of six: the last sixth of the wheel, centred at 330°. Drawn at
      // half its arc it is centred near 344°, which is what it must not report.
      expect(seen.get('cal')).toBeCloseTo(-330)
    } finally {
      clock.restore()
    }
  })
```

Add `SliceInstance` to the file's imports:

```tsx
import type { SliceInstance } from '../slice/types'
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — the registered angle is about `-334`, the mid-shrink position.

- [ ] **Step 3: Write the implementation**

In `src/wheel/Wheel.tsx`, change the `levelRef` argument on `SliceElements`:

```tsx
                  levelRef={levelRef?.(segment.id, -midDeg(layoutArc))}
```

`SliceElements` keeps taking `arc={presenceArc}`: it places what the layout produced, so the element still travels with its wedge. Only the angle a spin will counter-rotate by comes from the layout.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/Wheel.tsx src/wheel/Wheel.test.tsx
git commit -m "fix(wheel): register a level element at its layout angle"
```

---

### Task 6: Pin the color path

`paletteColor(index)` left `Wheel` in Task 1. `usePresence` is now the only thing that colors a wedge, and if that ever stops happening every wedge renders with no fill — black, on every frame, with the suite green.

**Files:**
- Modify: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the test**

Append inside the `describe('Wheel', …)` block:

```tsx
  it('colors a wedge that authored no color', () => {
    const { container } = render(<Wheel segments={roster(['ana', 'ben'])} />)
    const fills = [...container.querySelectorAll('path.wheel__segment')].map((path) =>
      path.getAttribute('fill'),
    )
    expect(fills).toHaveLength(2)
    expect(fills.every((fill) => fill !== null && fill !== '')).toBe(true)
    expect(new Set(fills).size).toBe(2)
  })
```

`roster` authors no colors, so every fill here came from `usePresence`. The existing `applies segment color as a fill attribute rather than an inline style` covers the other direction, where the segment brings its own.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 3: Mutation-check it**

In `src/transition/usePresence.ts`, temporarily make `withColor` return `segments` unchanged.

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL on the new test. Revert.

- [ ] **Step 4: Run the whole suite, the build, and the linter**

Run: `npm test && npm run build && npx biome check .`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/wheel/Wheel.test.tsx
git commit -m "test(wheel): pin every wedge to a fill it did not author"
```

---

### Task 7: See it move

No test in this repo renders a real font or a real `<textPath>`. The editor preview animates nothing — its `<Wheel>` takes neither `slice` nor `transitions` — so this runs on the show page.

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Note the port it prints. Another dev server may already hold 5173.

- [ ] **Step 2: Arm both sides**

Open `#/edit`. Set the wheel's layout to *Text curves along the arc*, and in the Transitions panel set "Wedges arriving" to *Wedges fly in from outside* and "Wedges leaving" to *Wedges open and close* with a duration around 4000ms, so a departure is long enough to watch.

- [ ] **Step 3: Watch a departure on the show page**

Open `#/` in a second window, with the editor still open in the first. Delete a segment in the editor and watch the show page. Confirm:

- the label holds the size and orientation it had, rather than re-fitting as the arc closes
- the label travels with its wedge rather than staying put
- the neighbors' labels do not change as they grow into the space

- [ ] **Step 4: Watch a curved label overrun its path**

This is the one the spec calls out and no assertion can reach. A curved label is a `<textPath>` on a path built from the presence arc, so a label fit for the full arc has more text than the path can hold once the wedge closes. Watch what an overflowing `textPath` actually does: clip at the end, or drop out entirely. Either is survivable at the opacity the wedge has by then — but if the label blinks off while the wedge is still clearly visible, that is a finding, and Step 6 is where it goes.

Watch an **arrival** for the same thing, which is the worse direction: a wedge entering with `shrink` is fitted for its final width and drawn on a sliver, so the overflow is at its largest exactly when the wedge is becoming visible rather than leaving. Confirm the opacity ramp covers it.

- [ ] **Step 5: Screenshot the result**

Capture the wheel mid-departure and open the image so it lands on screen.

- [ ] **Step 6: Commit anything the pass turned up**

If Steps 3-4 revealed a defect, fix it with a test first, then commit. If they did not, there is nothing to commit.

**What the pass found.** No defect. Six curved wedges, one leaving over four seconds:
the label held size 26 for the whole exit while its arc closed 60° → 0.2°, never
re-fitted, never flipped orientation, and its `textPath` travelled with the wedge
(its start point walked 121,70 → 82,113). The text was still in the DOM at
opacity 0.003, so nothing blinks off at the drop.

The overflow is real and degrades gracefully. A label fitted for 60° needs 78% of
its path at rest, 107% at opacity 0.69, 120% at 0.61, and 321% at 0.21. An
overflowing `<textPath>` drops the glyphs that fall off each end rather than
vanishing whole: at 321% "Calbrook" renders as "albro", centred and faint. The
worst of it sits below opacity 0.7, and the erosion is symmetric, so it reads as
a label fading in rather than as a broken one. Fixing it would mean fitting
against the presence arc — the popping this design exists to prevent — so it
stays.

Unrelated and pre-existing: curved labels on the lower half of the wheel read
upside down, because a concentric path there runs right to left. It comes from
`main` untouched and is not this merge's to fix.

---

### Task 8: Land it on main

**Files:** none — integration only.

- [ ] **Step 1: Confirm the branch is green**

Run: `npm test && npm run build && npx biome check .`
Expected: all clean.

- [ ] **Step 2: Merge to main**

`main` is checked out at `/Users/mike/src/wod-meet`, not in this worktree.

```bash
cd /Users/mike/src/wod-meet
git merge feat/wedge-presence-impl
```

Expected: fast-forward or a clean merge — every conflict was resolved on the branch in Task 1.

- [ ] **Step 3: Verify the merged result**

Run: `npm test && npm run build && npx biome check .`
Expected: all clean, from `/Users/mike/src/wod-meet`.

- [ ] **Step 4: Ask before removing anything**

The worktree and the branch are the user's to keep or discard. Report that the merge has landed and let them choose.

---

### Task 6b: One home for a rationale

The merge put both branches' documentation in one call graph, so three prop/field
pairs now say the same thing twice with nothing keeping them in sync. Rationale
belongs on the prop, which is the public surface; the hook's field says what it
produces.

**Files:**
- Modify: `src/wheel/useSpin.ts`

- [ ] **Step 1: Cut the duplicated halves**

In `src/wheel/useSpin.ts`, on the `UseSpinResult` type:

- `layoutSegments` — `Wheel`'s `layoutFrom` prop carries the morph rationale. Leave one line here: `/** The roster layouts resolve against, which a morph holds still. */`
- `levelRef` — the comment is verbatim on `Wheel`'s prop. Leave one line: `/** Registers a level group so a spin can counter-rotate it. */`
- `held` — the four-line explanation belongs on `Wheel`'s prop, where it already is. Leave one line: `/** A landed frame is being held until the next spin. */`

Do not touch the comments on `Wheel`'s props: they are the surviving copy.

- [ ] **Step 2: Verify nothing else moved**

Run: `npm test && npm run build && npx biome check .`
Expected: all clean. This task changes only comments; a failure means something else was edited.

- [ ] **Step 3: Commit**

```bash
git add src/wheel/useSpin.ts
git commit -m "docs(wheel): keep each rationale on the surface that owns it"
```

---

## Review findings folded in

Task 1's code quality review raised seven items. Their dispositions, so a later
reader does not re-litigate them:

- **The `restingDeg` staleness** is Task 4, which the review reached
  independently. It adds one detail the plan did not have: a wedge first mounts
  on the frame its hold crosses zero, so with the presence angle it captures its
  sliver angle rather than its resting one, and every neighbor's angle shifts as
  the newcomer opens with no update either.
- **An exiting wedge re-walking its ladder** is Task 3.
- **A label fitted for one arc and drawn along another** is Task 7, extended to
  cover arrivals as well as departures.
- **Duplicated prop/field comments** are Task 6b.
- **`index` and `count` come from the draw list while `arc` comes from the layout
  roster.** Left as is. The review would source all three from the layout roster;
  that needs a fallback for a departed wedge, which has no layout index, and no
  registered layout reads either field. The pair being internally consistent —
  an index always within its count — is the property worth keeping.
- **`midDeg` is a third copy of one formula**, alongside `SliceElements`'s
  rounded version and `tracks.ts`'s `angleOf`. Left as is: the three want
  different things (DOM rounding, an `undefined` guard, neither), so a shared
  helper would carry all three concerns. Worth revisiting if a fourth appears.
- **`.wheel__stage`'s transform rules are inert.** Confirmed intentional. The
  stage exists so a wheel-scope transform never fights the rotation, and the
  wheel-scope transitions that will use it are the next plan's work.

Task 4 turned up two of its own:

- **The angle map does not delete on unmount.** Deleting it there loses a race:
  React detaches a ref *after* the render that re-registered it, so an id that
  unmounts and remounts in one commit — reachable, since `SliceElements` keys a
  level group `` `${id}-${index}` `` and a reordered element list remounts it —
  would leave `levels` holding an id whose angle had just been dropped. Only
  `levels` is ever iterated, so a lingering angle is inert. The `?? 0` in the
  spin loop stays as a defensive default rather than a path anything takes.
- **A slice with two `frame: 'level'` elements registers one ref for both**, so
  the second overwrites the first and only one is counter-animated. Pre-existing
  and untouched here; it needs a per-element key, not a per-segment one.

Task 3's review added one worth carrying: **the prune's safety borrows an
invariant from another module.** It can only over-retain because a departing id,
once dropped from `tracks`, never returns — so a discarded render cannot delete
an entry a later one needs. `Wheel` neither states that dependency nor tests it.
A future change to how `tracks.ts` evicts would break the memory silently.

## Notes for whoever executes this

**The merge is the risky task, and it is Task 1.** Everything after it is small and tested. If Task 1's suite does not go green, do not patch tests to make it — the two suites passing against one component is the whole proof that the merge is correct.

**`ctx.index` and `ctx.count`** both come from the draw list, so an index is always within its count. No registered layout reads either one.

**Left for a later plan:** the editor preview passes neither `slice` nor `transitions` to its `<Wheel>`, so an operator arms both in one window and can see either only in the other. Wiring it means deciding what `held` means in a window with no spin of its own.
