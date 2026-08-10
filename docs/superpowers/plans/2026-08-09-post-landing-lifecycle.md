# Post-Landing Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare result line with a real post-landing lifecycle — a `Landing` signal off `useSpin`, a `reveal/` module that consumes it, and reveal authoring in the editor.

**Architecture:** `useSpin` returns `landing: {id, winner} | null` in place of `winnerId` and the dead `onLanded` callback; `id` is a per-spin counter so the same segment winning twice reopens its reveal. A `reveal/` module holds one piece of state (the last dismissed id) and derives the rest. `reveal` joins `label` and `media` as a discrete morphable property so `swap` trades it, using an explicit `null` for "clear".

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, Biome.

**Spec:** `docs/superpowers/specs/2026-08-09-post-landing-lifecycle-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/wheel/types.ts` | Modify: `MorphKeyframe.reveal?: Reveal \| null` |
| `src/wheel/morph.ts` | Modify: `sampleReveal` + wire into `applyMorphs` |
| `src/wheel/useSpin.ts` | Modify: `Landing`, replacing `winnerId` and `onLanded` |
| `src/tricks/types.ts` | Modify: `Write.property` gains `'reveal'` |
| `src/tricks/recipes/swap.ts` | Modify: trade `reveal` |
| `src/reveal/useReveal.ts` | Create: the state machine |
| `src/reveal/Reveal.tsx` | Create: the overlay |
| `src/reveal/Reveal.css` | Create: overlay styling |
| `src/editor/RevealEditor.tsx` | Create: shared reveal form, used by two panels |
| `src/preset/storage.ts` | Modify: parse `media` and `reveal` |
| `src/editor/SegmentList.tsx` | Modify: mount `RevealEditor` per static row |
| `src/editor/OverridesPanel.tsx` | Modify: mount `RevealEditor` per override row |
| `src/App.tsx` | Modify: consume `landing`, render the overlay |

Commands: `npx vitest run <path>` for one file, `npm test` for the suite, `npm run build` for the typecheck, `npm run check` for the formatter.

---

## Task 1: `reveal` becomes a morphable property

**Files:**
- Modify: `src/wheel/types.ts:30-37`
- Modify: `src/wheel/morph.ts:117-152`
- Modify: `src/tricks/types.ts:8-11`
- Test: `src/wheel/morph.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/wheel/morph.test.ts`, inside the top-level `describe` block:

```ts
  describe('reveal', () => {
    const withReveal: Segment[] = [
      { id: 'a', label: 'A', weight: 1, reveal: { headline: 'before' } },
    ]

    it('picks a reveal discretely at its keyframe rather than interpolating', () => {
      const morphs: Morph[] = [
        {
          segmentId: 'a',
          durationMs: 100,
          keyframes: [{ at: 0.5, reveal: { headline: 'after' } }],
        },
      ]
      expect(applyMorphs(withReveal, morphs, 40)[0].reveal).toEqual({ headline: 'before' })
      expect(applyMorphs(withReveal, morphs, 60)[0].reveal).toEqual({ headline: 'after' })
    })

    it('clears the reveal when a keyframe holds null', () => {
      const morphs: Morph[] = [
        { segmentId: 'a', durationMs: 100, keyframes: [{ at: 0.5, reveal: null }] },
      ]
      expect(applyMorphs(withReveal, morphs, 40)[0].reveal).toEqual({ headline: 'before' })
      const cleared = applyMorphs(withReveal, morphs, 60)[0]
      expect(cleared.reveal).toBeUndefined()
      expect('reveal' in cleared).toBe(false)
    })

    it('gives a reveal to a segment that started without one', () => {
      const bare: Segment[] = [{ id: 'a', label: 'A', weight: 1 }]
      const morphs: Morph[] = [
        {
          segmentId: 'a',
          durationMs: 100,
          keyframes: [{ at: 0.5, reveal: { headline: 'surprise' } }],
        },
      ]
      expect(applyMorphs(bare, morphs, 40)[0].reveal).toBeUndefined()
      expect(applyMorphs(bare, morphs, 60)[0].reveal).toEqual({ headline: 'surprise' })
    })

    it('leaves reveal alone when no keyframe mentions it', () => {
      const morphs: Morph[] = [
        { segmentId: 'a', durationMs: 100, keyframes: [{ at: 1, label: 'Z' }] },
      ]
      expect(applyMorphs(withReveal, morphs, 100)[0].reveal).toEqual({ headline: 'before' })
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/wheel/morph.test.ts`
Expected: FAIL — TypeScript rejects `reveal` on `MorphKeyframe`, so the file does not compile.

- [ ] **Step 3: Add the field**

In `src/wheel/types.ts`, change `MorphKeyframe`:

```ts
export type MorphKeyframe = {
  /** Position within the morph's own duration, 0..1. */
  at: number
  weight?: number
  color?: string
  label?: string
  media?: Media
  /** `null` clears the reveal. Absent means this keyframe does not touch it. */
  reveal?: Reveal | null
}
```

- [ ] **Step 4: Add the sampler**

In `src/wheel/morph.ts`, change the import on line 1 to include `Reveal`:

```ts
import type { EasingName, Media, Morph, MorphKeyframe, Reveal, Segment } from './types'
```

Insert after `sampleStep` (after line 131):

```ts
type RevealKeyframe = MorphKeyframe & { reveal: Reveal | null }

/**
 * Discrete like label and media, but nullable, so a swap can trade a reveal away
 * to a wedge that has none. The shared `sampleStep` cannot express that: its
 * `NonNullable` filter strips the null that carries the meaning.
 */
function sampleReveal(
  keyframes: MorphKeyframe[],
  p: number,
  base: Reveal | undefined,
): Reveal | null | undefined {
  const declared = [...keyframes]
    .sort((a, b) => a.at - b.at)
    .filter((k): k is RevealKeyframe => k.reveal !== undefined)
  if (declared.length === 0) return undefined
  const points =
    declared[0].at > 0 ? [{ at: 0, reveal: base ?? null }, ...declared] : declared
  let value = points[0].reveal
  for (const point of points) {
    if (point.at <= p) value = point.reveal
  }
  return value
}
```

- [ ] **Step 5: Wire it into `applyMorphs`**

In `src/wheel/morph.ts`, inside the `for (const morph of relevant)` loop, after the `media` lines (line 148):

```ts
      const reveal = sampleReveal(morph.keyframes, p, out.reveal)
      if (reveal === null) delete out.reveal
      else if (reveal !== undefined) out.reveal = reveal
```

- [ ] **Step 6: Widen the write claim**

In `src/tricks/types.ts`:

```ts
export type Write = {
  segmentId: string
  property: 'weight' | 'color' | 'label' | 'media' | 'reveal'
}
```

- [ ] **Step 7: Run the morph tests**

Run: `npx vitest run src/wheel/morph.test.ts`
Expected: PASS, all tests including the four new ones.

- [ ] **Step 8: Commit**

```bash
git add src/wheel/types.ts src/wheel/morph.ts src/wheel/morph.test.ts src/tricks/types.ts
git commit -m "feat(morph): make reveal a discrete morphable property"
```

---

## Task 2: `swap` trades the reveal

**Files:**
- Modify: `src/tricks/recipes/swap.ts:40-83`
- Test: `src/tricks/recipes/swap.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/tricks/recipes/swap.test.ts`, inside its top-level `describe`:

```ts
  describe('reveal', () => {
    it('trades the reveal along with the label', () => {
      const segments: Segment[] = [
        { id: 'w', label: 'Winner', weight: 1, color: '#111111', reveal: { headline: 'mine' } },
        { id: 'o', label: 'Other', weight: 1, color: '#222222', reveal: { headline: 'theirs' } },
      ]
      const morphs = swap.resolve(
        { otherWedgeId: 'o', at: 0.9 },
        ctx(segments, { winnerId: 'w' }),
      )
      const landed = applyMorphs(segments, morphs, 1000)
      expect(landed.find((s) => s.id === 'w')?.reveal).toEqual({ headline: 'theirs' })
      expect(landed.find((s) => s.id === 'o')?.reveal).toEqual({ headline: 'mine' })
    })

    it('strips the winner reveal when the wedge it trades with has none', () => {
      const segments: Segment[] = [
        { id: 'w', label: 'Winner', weight: 1, color: '#111111', reveal: { headline: 'mine' } },
        { id: 'o', label: 'Other', weight: 1, color: '#222222' },
      ]
      const morphs = swap.resolve(
        { otherWedgeId: 'o', at: 0.9 },
        ctx(segments, { winnerId: 'w' }),
      )
      const landed = applyMorphs(segments, morphs, 1000)
      // Wearing another identity while still firing your own punchline is the
      // bug this trade exists to prevent.
      expect(landed.find((s) => s.id === 'w')?.reveal).toBeUndefined()
      expect(landed.find((s) => s.id === 'o')?.reveal).toEqual({ headline: 'mine' })
    })

    it('claims the reveal it writes', () => {
      const segments: Segment[] = [
        { id: 'w', label: 'Winner', weight: 1, color: '#111111' },
        { id: 'o', label: 'Other', weight: 1, color: '#222222' },
      ]
      const claims = swap.writes({ otherWedgeId: 'o', at: 0.9 }, ctx(segments, { winnerId: 'w' }))
      expect(claims).toContainEqual({ segmentId: 'w', property: 'reveal' })
      expect(claims).toContainEqual({ segmentId: 'o', property: 'reveal' })
    })
  })
```

If `swap.test.ts` has no `ctx` helper or does not already import `applyMorphs` and `Segment`, add them — read the top of the file and match its existing helper. The existing tests in that file already build a `RecipeContext`; reuse that construction verbatim rather than inventing a second one.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/tricks/recipes/swap.test.ts`
Expected: FAIL — the traded reveals come back as the originals, and `writes` returns no `'reveal'` claims.

- [ ] **Step 3: Trade the reveal in `resolve`**

In `src/tricks/recipes/swap.ts`, replace the two keyframe arrays inside `resolve` (lines 49-66):

```ts
    return [
      {
        segmentId: winner.id,
        durationMs: ctx.durationMs,
        keyframes: [
          { at, label: winner.label, color: winnerColor, reveal: winner.reveal ?? null },
          { at, label: other.label, color: otherColor, reveal: other.reveal ?? null },
        ],
      },
      {
        segmentId: other.id,
        durationMs: ctx.durationMs,
        keyframes: [
          { at, label: other.label, color: otherColor, reveal: other.reveal ?? null },
          { at, label: winner.label, color: winnerColor, reveal: winner.reveal ?? null },
        ],
      },
    ]
```

- [ ] **Step 4: Claim it in `writes`**

Replace the body of `writes` (lines 69-83):

```ts
  writes(params, ctx): Write[] {
    const otherId = readString(params, 'otherWedgeId', '')
    if (otherId === '') return []
    const claims: Write[] = [
      { segmentId: otherId, property: 'label' },
      { segmentId: otherId, property: 'color' },
      { segmentId: otherId, property: 'reveal' },
    ]
    if (ctx.winnerId !== null && ctx.winnerId !== otherId) {
      claims.push(
        { segmentId: ctx.winnerId, property: 'label' },
        { segmentId: ctx.winnerId, property: 'color' },
        { segmentId: ctx.winnerId, property: 'reveal' },
      )
    }
    return claims
  },
```

- [ ] **Step 5: Update the description**

Line 30-31, since it now names three traded properties:

```ts
  description:
    'The winner and one other wedge exchange names, colors, and reveals just before the wheel lands.',
```

- [ ] **Step 6: Run the trick tests**

Run: `npx vitest run src/tricks/`
Expected: PASS. The registry-wide invariant test in `src/tricks/recipes/invariants.test.ts` must still pass — `reveal` is not a weight write, so the no-winner-keyed-weight rule is untouched. If that test fails, stop and re-read it before changing anything.

- [ ] **Step 7: Commit**

```bash
git add src/tricks/recipes/swap.ts src/tricks/recipes/swap.test.ts
git commit -m "fix(swap): trade the reveal with the identity"
```

---

## Task 3: `Landing` replaces `winnerId` and `onLanded`

**Files:**
- Modify: `src/wheel/useSpin.ts:28-183`
- Modify: `src/App.tsx:60-114`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/wheel/useSpin.test.ts`, inside its top-level `describe`:

```ts
  describe('landing', () => {
    it('is null while spinning and carries the winner once resolved', async () => {
      const { result } = renderSpin(PLAIN)
      act(() => {
        result.current.spin()
      })
      expect(result.current.landing).toBeNull()

      await act(async () => {
        harness.animateCalls[0].finish()
      })
      expect(result.current.landing?.winner.id).toBeDefined()
    })

    it('increments the landing id on every spin', async () => {
      const { result } = renderSpin(PLAIN)
      act(() => {
        result.current.spin()
      })
      await act(async () => {
        harness.animateCalls[0].finish()
      })
      const first = result.current.landing?.id

      act(() => {
        result.current.spin()
      })
      // Cleared the instant the next spin starts, so nothing downstream reads a
      // stale winner over a turning wheel.
      expect(result.current.landing).toBeNull()

      await act(async () => {
        harness.animateCalls[1].finish()
      })
      expect(result.current.landing?.id).toBe((first ?? 0) + 1)
    })

    it('carries the landed-frame segment, not the drawn one', async () => {
      const { result } = renderSpin(PLAIN)
      act(() => {
        result.current.spin({
          resolveLate: (winnerId) => [
            {
              segmentId: winnerId,
              durationMs: DURATION_MS,
              keyframes: [
                { at: 0.95, label: 'before' },
                { at: 0.95, label: 'after' },
              ],
            },
          ],
        })
      })
      await act(async () => {
        harness.animateCalls[0].finish()
      })
      // The whole reason Landing carries a Segment: with a swap in play the
      // announced identity is the traded one.
      expect(result.current.landing?.winner.label).toBe('after')
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — `landing` does not exist on the hook result.

- [ ] **Step 3: Change the hook's shape**

In `src/wheel/useSpin.ts`, replace the `UseSpinResult` type and the signature (lines 29-41):

```ts
/** A resolved spin. `id` is fresh per landing, so the same winner twice is two landings. */
export type Landing = { id: number; winner: Segment }

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  isSpinning: boolean
  landing: Landing | null
  spin: (override?: SpinOverride) => void
  rotorRef: RefObject<SVGGElement | null>
}

export function useSpin(segments: Segment[], config: SpinConfig): UseSpinResult {
```

- [ ] **Step 4: Replace the state**

Replace lines 55-58 (the `landed` and `winnerId` state) with:

```ts
  const [displaySegments, setDisplaySegments] = useState(segments)
  const [isSpinning, setIsSpinning] = useState(false)
  const [landing, setLanding] = useState<Landing | null>(null)
```

Add a counter beside the other refs, after `rotationRef` (line 52):

```ts
  // Identity, not a winner id: the same segment winning twice must read as two
  // landings, or a dismissed reveal never reopens.
  const landingCountRef = useRef(0)
```

- [ ] **Step 5: Update the resync guard**

Lines 60-71 — the guard and its dependency array:

```ts
    if (lastSegmentsRef.current === segments) return
    if (isSpinning || landing !== null) return
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
  }, [segments, isSpinning, landing])
```

- [ ] **Step 6: Rename the local landing frame and clear on start**

Inside `spin`, the local `const landing = lateMorphs ? …` now collides with the state. Rename it to `landedFrame` (lines 106-110):

```ts
      const landedFrame = lateMorphs
        ? landingSegments(spinSegments, lateMorphs, spinConfig.durationMs)
        : plan.landing
```

And replace the two reset calls (`setLanded(false)` and `setWinnerId(null)`) with one:

```ts
      setLanding(null)
```

- [ ] **Step 7: Set the landing on finish**

Replace the tail of the `animation.finished.then` block — the four lines from `setDisplaySegments(landing)` through `onLanded?.(plan.winnerId)`:

```ts
          setDisplaySegments(landedFrame)
          setIsSpinning(false)
          const winner = landedFrame.find((segment) => segment.id === plan.winnerId)
          if (winner) {
            landingCountRef.current += 1
            setLanding({ id: landingCountRef.current, winner })
          }
```

- [ ] **Step 8: Update the dependency array and return**

Line 180 drops `onLanded`:

```ts
    [segments, config, stopTracks],
```

Line 183:

```ts
  return { displaySegments, isSpinning, landing, spin, rotorRef }
```

- [ ] **Step 9: Update the three existing assertions**

In `src/wheel/useSpin.test.ts`:
- line ~211: `expect(result.current.winnerId).toBe('beer')` → `expect(result.current.landing?.winner.id).toBe('beer')`
- line ~452: `expect(result.current.winnerId).toBe('x')` → `expect(result.current.landing?.winner.id).toBe('x')`
- line ~556: `expect(result.current.winnerId).toBe(seen[0])` → `expect(result.current.landing?.winner.id).toBe(seen[0])`

- [ ] **Step 10: Keep `App.tsx` compiling**

In `src/App.tsx` line 60:

```ts
  const { displaySegments, isSpinning, landing, spin, rotorRef } = useSpin(
    resolved.segments,
    config,
  )
```

Replace the winner lookup (lines 85-87) — the comment goes with it, since `Landing` now carries the landed segment and there is nothing left to explain:

```ts
  const isEmpty = resolved.segments.length === 0
```

...keeping the existing `isEmpty` comment, and delete the now-duplicated declaration. Then line 114:

```ts
        <p className="app__result">{landing ? landing.winner.label : ''}</p>
```

- [ ] **Step 11: Run the tests and the typecheck**

Run: `npx vitest run src/wheel/useSpin.test.ts src/App.test.tsx && npm run build`
Expected: PASS, and a clean typecheck. If `App.test.tsx` asserted on the result line it still passes — the rendered text is unchanged.

- [ ] **Step 12: Commit**

```bash
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts src/App.tsx
git commit -m "feat(spin): return a Landing instead of a bare winner id"
```

---

## Task 4: the `useReveal` state machine

**Files:**
- Create: `src/reveal/useReveal.ts`
- Test: `src/reveal/useReveal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/reveal/useReveal.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Landing } from '../wheel/useSpin'
import { useReveal } from './useReveal'

const WITH: Landing = {
  id: 1,
  winner: { id: 'a', label: 'A', weight: 1, reveal: { headline: 'Surprise' } },
}
const WITHOUT: Landing = { id: 1, winner: { id: 'b', label: 'B', weight: 1 } }

describe('useReveal', () => {
  it('opens on a landing whose winner has a reveal', () => {
    const { result } = renderHook(() => useReveal(WITH))
    expect(result.current.shown?.reveal).toEqual({ headline: 'Surprise' })
    expect(result.current.shown?.segment.id).toBe('a')
  })

  it('stays closed for a winner with no reveal', () => {
    const { result } = renderHook(() => useReveal(WITHOUT))
    expect(result.current.shown).toBeNull()
  })

  it('stays closed while there is no landing', () => {
    const { result } = renderHook(() => useReveal(null))
    expect(result.current.shown).toBeNull()
  })

  it('opens for an empty reveal, which renders as the label', () => {
    const landing: Landing = { id: 1, winner: { id: 'a', label: 'A', weight: 1, reveal: {} } }
    const { result } = renderHook(() => useReveal(landing))
    expect(result.current.shown).not.toBeNull()
  })

  it('does not reopen after dismissal, however many times it re-renders', () => {
    const { result, rerender } = renderHook(({ landing }) => useReveal(landing), {
      initialProps: { landing: WITH },
    })
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.shown).toBeNull()
    rerender({ landing: WITH })
    rerender({ landing: WITH })
    expect(result.current.shown).toBeNull()
  })

  it('reopens when the same segment wins again', () => {
    const { result, rerender } = renderHook(({ landing }) => useReveal(landing), {
      initialProps: { landing: WITH },
    })
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.shown).toBeNull()

    // Same winner, new landing. Keyed on the segment id this would stay shut and
    // the punchline would silently never fire again.
    rerender({ landing: { ...WITH, id: 2 } })
    expect(result.current.shown).not.toBeNull()
  })

  it('closes when a new spin clears the landing', () => {
    const { result, rerender } = renderHook(
      ({ landing }: { landing: Landing | null }) => useReveal(landing),
      { initialProps: { landing: WITH as Landing | null } },
    )
    expect(result.current.shown).not.toBeNull()
    rerender({ landing: null })
    expect(result.current.shown).toBeNull()
  })

  describe('holdMs', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const held: Landing = {
      id: 1,
      winner: { id: 'a', label: 'A', weight: 1, reveal: { headline: 'Hi', holdMs: 500 } },
    }

    it('auto-dismisses after the hold', () => {
      const { result } = renderHook(() => useReveal(held))
      expect(result.current.shown).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(499)
      })
      expect(result.current.shown).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(result.current.shown).toBeNull()
    })

    it('a manual dismissal cancels the pending timer', () => {
      const { result } = renderHook(() => useReveal(held))
      act(() => {
        result.current.dismiss()
      })
      expect(result.current.shown).toBeNull()
      // A surviving timer would fire against a later landing's id.
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.shown).toBeNull()
    })

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
      'treats holdMs of %p as manual dismissal',
      (holdMs) => {
        const landing: Landing = {
          id: 1,
          winner: { id: 'a', label: 'A', weight: 1, reveal: { headline: 'Hi', holdMs } },
        }
        const { result } = renderHook(() => useReveal(landing))
        act(() => {
          vi.advanceTimersByTime(10_000)
        })
        expect(result.current.shown).not.toBeNull()
      },
    )
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/reveal/useReveal.test.ts`
Expected: FAIL — cannot resolve `./useReveal`.

- [ ] **Step 3: Write the hook**

Create `src/reveal/useReveal.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { Reveal, Segment } from '../wheel/types'
import type { Landing } from '../wheel/useSpin'

export type Shown = { segment: Segment; reveal: Reveal }

export type UseRevealResult = {
  shown: Shown | null
  dismiss: () => void
}

/**
 * The overlay's whole state is one dismissed id. Landing ids only move forward,
 * so a scalar answers "has this one been dismissed" without a set.
 *
 * `shown.segment` is whatever `landing` captured at rest, so a preset edit
 * arriving from the editor window cannot rewrite a punchline mid-display.
 */
export function useReveal(landing: Landing | null): UseRevealResult {
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  const reveal = landing?.winner.reveal
  const shown =
    landing !== null && reveal !== undefined && dismissedId !== landing.id
      ? { segment: landing.winner, reveal }
      : null

  const landingId = landing?.id ?? null
  const dismiss = useCallback(() => {
    if (landingId !== null) setDismissedId(landingId)
  }, [landingId])

  // Keyed on the shown reveal's hold, not the landing's: dismissing clears
  // `shown`, which re-runs this and tears the timer down with it.
  const holdMs = shown?.reveal.holdMs
  useEffect(() => {
    if (landingId === null) return
    if (holdMs === undefined || !Number.isFinite(holdMs) || holdMs <= 0) return
    const timer = setTimeout(() => setDismissedId(landingId), holdMs)
    return () => clearTimeout(timer)
  }, [landingId, holdMs])

  return { shown, dismiss }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/reveal/useReveal.test.ts`
Expected: PASS, all 11 cases.

- [ ] **Step 5: Commit**

```bash
git add src/reveal/useReveal.ts src/reveal/useReveal.test.ts
git commit -m "feat(reveal): add the post-landing state machine"
```

---

## Task 5: the overlay component

**Files:**
- Create: `src/reveal/Reveal.tsx`
- Create: `src/reveal/Reveal.css`
- Test: `src/reveal/Reveal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/reveal/Reveal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Segment } from '../wheel/types'
import { Reveal } from './Reveal'

const SEGMENT: Segment = { id: 'a', label: 'Alex', weight: 1 }

describe('Reveal', () => {
  it('falls back to the segment label when no headline is authored', () => {
    render(<Reveal segment={SEGMENT} reveal={{}} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Alex')
  })

  it('prefers the authored headline', () => {
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Free beer' }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Free beer')
  })

  it('renders the body when there is one', () => {
    render(<Reveal segment={SEGMENT} reveal={{ body: 'on the house' }} onDismiss={vi.fn()} />)
    expect(screen.getByText('on the house')).toBeInTheDocument()
  })

  it('renders emoji media as text', () => {
    render(
      <Reveal segment={SEGMENT} reveal={{ media: { kind: 'emoji', value: '🍺' } }} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('🍺')).toBeInTheDocument()
  })

  it('renders image media as an img', () => {
    render(
      <Reveal
        segment={SEGMENT}
        reveal={{ media: { kind: 'image', value: 'https://example.test/x.png' } }}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole('presentation')).toHaveAttribute('src', 'https://example.test/x.png')
  })

  it('keeps the text when the media fails to load', () => {
    render(
      <Reveal
        segment={SEGMENT}
        reveal={{ headline: 'Free beer', media: { kind: 'gif', value: 'bad://x' } }}
        onDismiss={vi.fn()}
      />,
    )
    screen.getByRole('presentation').dispatchEvent(new Event('error'))
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Free beer')
  })

  it('dismisses on click', async () => {
    const onDismiss = vi.fn()
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Hi' }} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('dialog'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn()
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Hi' }} onDismiss={onDismiss} />)
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('takes focus so the keyboard reaches it', () => {
    render(<Reveal segment={SEGMENT} reveal={{ headline: 'Hi' }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/reveal/Reveal.test.tsx`
Expected: FAIL — cannot resolve `./Reveal`.

- [ ] **Step 3: Write the component**

Create `src/reveal/Reveal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Media, Reveal as RevealData, Segment } from '../wheel/types'
import './Reveal.css'

export type RevealProps = {
  segment: Segment
  reveal: RevealData
  onDismiss: () => void
}

function MediaView({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  if (media.kind === 'emoji') return <span className="reveal__emoji">{media.value}</span>
  // Decorative: the headline already carries the meaning, and alt text repeating
  // it would be read twice.
  return (
    <img
      className="reveal__image"
      src={media.value}
      alt=""
      onError={() => setFailed(true)}
    />
  )
}

export function Reveal({ segment, reveal, onDismiss }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const headline = reveal.headline ?? segment.label

  // Focus on mount, or Escape never reaches the handler below.
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div
      className="reveal"
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      tabIndex={-1}
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss()
      }}
    >
      <div className="reveal__card">
        <h2 className="reveal__headline">{headline}</h2>
        {reveal.body === undefined ? null : <p className="reveal__body">{reveal.body}</p>}
        {reveal.media === undefined ? null : <MediaView media={reveal.media} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write the styles**

Create `src/reveal/Reveal.css`:

```css
.reveal {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgb(0 0 0 / 0.72);
  cursor: pointer;
  animation: reveal-in 160ms ease-out;
}

.reveal__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  max-width: min(40rem, 90vw);
  padding: 2.5rem 3rem;
  border-radius: 1rem;
  background: canvas;
  color: canvastext;
  text-align: center;
}

.reveal__headline {
  margin: 0;
  font-size: clamp(2rem, 6vw, 3.5rem);
  font-weight: 800;
  line-height: 1.1;
}

.reveal__body {
  margin: 0;
  font-size: 1.25rem;
  opacity: 0.8;
}

.reveal__emoji {
  font-size: clamp(3rem, 12vw, 7rem);
  line-height: 1;
}

.reveal__image {
  max-width: 100%;
  max-height: 45vh;
  border-radius: 0.5rem;
}

@keyframes reveal-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    animation: none;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/reveal/Reveal.test.tsx`
Expected: PASS, all 10 cases.

- [ ] **Step 6: Commit**

```bash
git add src/reveal/Reveal.tsx src/reveal/Reveal.css src/reveal/Reveal.test.tsx
git commit -m "feat(reveal): add the landing overlay"
```

---

## Task 6: wire the reveal into the show window

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/App.test.tsx` as a new top-level `describe`, reusing the module-scope `installSpinHarness` already defined in that file. Add `Reveal` and `Segment` to the imports from `./wheel/types`.

```tsx
describe('App reveal', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  // One segment is always its own winner, so the landing needs no stubbed rng.
  const seed = (reveal?: Reveal) => {
    const segment: Segment = { id: 'solo', label: 'Solo', weight: 1 }
    if (reveal !== undefined) segment.reveal = reveal
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({ ...DEFAULT_PRESET, segments: [segment], tricks: [], branches: [] }),
    )
  }

  it('raises no overlay for a winner with no reveal', async () => {
    const harness = installSpinHarness()
    try {
      seed()
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      // Landed, and still the quiet result line.
      expect(screen.getByText('Solo')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
    } finally {
      harness.restore()
    }
  })

  it('raises the overlay for an authored reveal, blocks spin, and dismisses on click', async () => {
    const harness = installSpinHarness()
    try {
      seed({ headline: 'Free beer' })
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Free beer')
      // No spinning out from under a reveal that is still describing the winner.
      expect(screen.getByRole('button', { name: /spin/i })).toBeDisabled()

      await userEvent.click(dialog)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
    } finally {
      harness.restore()
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no `dialog` role is ever rendered.

- [ ] **Step 3: Wire it up**

In `src/App.tsx`, add the imports:

```ts
import { Reveal } from './reveal/Reveal'
import { useReveal } from './reveal/useReveal'
```

After the `useSpin` call:

```ts
  const { shown, dismiss } = useReveal(landing)
```

Disable spin while the overlay is up, so no reveal can narrate a winner the wheel has already spun past:

```tsx
        <button
          className="app__button"
          type="button"
          onClick={onSpin}
          disabled={isSpinning || isEmpty || shown !== null}
        >
          Spin
        </button>
```

And render the overlay as the last child of `<main>`:

```tsx
      {shown === null ? null : (
        <Reveal segment={shown.segment} reveal={shown.reveal} onDismiss={dismiss} />
      )}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): raise the reveal overlay when the winner has one"
```

---

## Task 7: storage parses `media` and `reveal`

**Files:**
- Modify: `src/preset/storage.ts:28-52`, `:393-416`
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/preset/storage.test.ts`, inside its top-level `describe`:

```ts
  describe('reveal and media', () => {
    const parseSegments = (segments: unknown) =>
      parsePreset(JSON.stringify({ version: 3, name: 'p', segments })).segments

    it('round-trips a full reveal', () => {
      const reveal = {
        headline: 'Free beer',
        body: 'on the house',
        media: { kind: 'gif', value: 'https://example.test/x.gif' },
        sound: 'airhorn',
        effect: 'confetti',
        holdMs: 2000,
      }
      const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, reveal }])
      expect(segment.reveal).toEqual(reveal)
    })

    it('keeps an empty reveal, which means an overlay showing the label', () => {
      const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, reveal: {} }])
      expect(segment.reveal).toEqual({})
    })

    it('drops a reveal that is not an object', () => {
      const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, reveal: 'yes' }])
      expect(segment.reveal).toBeUndefined()
    })

    it('reads segment media', () => {
      const [segment] = parseSegments([
        { id: 'a', label: 'A', weight: 1, media: { kind: 'emoji', value: '🍺' } },
      ])
      expect(segment.media).toEqual({ kind: 'emoji', value: '🍺' })
    })

    it.each([
      { kind: 'video', value: 'x' },
      { kind: 'emoji' },
      { kind: 'emoji', value: 7 },
      'emoji',
    ])('drops malformed media %p without losing the segment', (media) => {
      const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, media }])
      expect(segment).toMatchObject({ id: 'a', label: 'A' })
      expect(segment.media).toBeUndefined()
    })

    it.each([0, -5, 'soon', Number.NaN])('drops a holdMs of %p', (holdMs) => {
      const [segment] = parseSegments([
        { id: 'a', label: 'A', weight: 1, reveal: { headline: 'H', holdMs } },
      ])
      expect(segment.reveal).toEqual({ headline: 'H' })
    })

    it('reads an unknown effect as none', () => {
      const [segment] = parseSegments([
        { id: 'a', label: 'A', weight: 1, reveal: { effect: 'fireworks' } },
      ])
      expect(segment.reveal).toEqual({ effect: 'none' })
    })

    it('round-trips reveal and media on an override', () => {
      const parsed = parsePreset(
        JSON.stringify({
          version: 3,
          name: 'p',
          overrides: {
            u1: {
              media: { kind: 'image', value: 'https://example.test/u.png' },
              reveal: { headline: 'Gotcha' },
            },
          },
        }),
      )
      expect(parsed.overrides.u1).toEqual({
        media: { kind: 'image', value: 'https://example.test/u.png' },
        reveal: { headline: 'Gotcha' },
      })
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — every `reveal` and `media` assertion comes back `undefined`.

- [ ] **Step 3: Add the two readers**

In `src/preset/storage.ts`, add `Media` and `Reveal` to the type import from `../wheel/types` (check the existing import block at the top and extend it rather than adding a second import). Then insert after `isRecord` (line 26):

```ts
function readMedia(value: unknown): Media | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind !== 'emoji' && value.kind !== 'image' && value.kind !== 'gif') return undefined
  if (typeof value.value !== 'string') return undefined
  return { kind: value.kind, value: value.value }
}

/**
 * An empty object survives: a reveal with nothing authored is an overlay showing
 * the segment's label, which is distinct from having no reveal at all.
 */
function readReveal(value: unknown): Reveal | undefined {
  if (!isRecord(value)) return undefined
  const reveal: Reveal = {}
  if (typeof value.headline === 'string') reveal.headline = value.headline
  if (typeof value.body === 'string') reveal.body = value.body
  const media = readMedia(value.media)
  if (media !== undefined) reveal.media = media
  if (typeof value.sound === 'string') reveal.sound = value.sound
  if (value.effect !== undefined) reveal.effect = value.effect === 'confetti' ? 'confetti' : 'none'
  if (typeof value.holdMs === 'number' && Number.isFinite(value.holdMs) && value.holdMs > 0) {
    reveal.holdMs = value.holdMs
  }
  return reveal
}
```

- [ ] **Step 4: Read them in `readSegments`**

In `readSegments`, after the color line (line 48):

```ts
    if (typeof entry.color === 'string') segment.color = entry.color
    const media = readMedia(entry.media)
    if (media !== undefined) segment.media = media
    const reveal = readReveal(entry.reveal)
    if (reveal !== undefined) segment.reveal = reveal
    segments.push(segment)
```

- [ ] **Step 5: Read them in `readOverrides`**

Replace the stale doc comment above `readOverrides` (lines 393-397) — it says these fields are deliberately unread, which is no longer true — with nothing, and add the two reads after the color line (line 410):

```ts
    if (typeof raw.color === 'string') override.color = raw.color
    const media = readMedia(raw.media)
    if (media !== undefined) override.media = media
    const reveal = readReveal(raw.reveal)
    if (reveal !== undefined) override.reveal = reveal
```

- [ ] **Step 6: Run the storage tests**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS. No `Preset` version bump — both fields were already on the types and never written, so stored v3 presets parse identically.

- [ ] **Step 7: Commit**

```bash
git add src/preset/storage.ts src/preset/storage.test.ts
git commit -m "feat(preset): parse reveal and media"
```

---

## Task 8: reveal authoring in the editor

**Files:**
- Create: `src/editor/RevealEditor.tsx`
- Test: `src/editor/RevealEditor.test.tsx`
- Modify: `src/editor/SegmentList.tsx`
- Modify: `src/editor/OverridesPanel.tsx`
- Modify: `src/editor/Editor.css`

- [ ] **Step 1: Write the failing tests**

Create `src/editor/RevealEditor.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RevealEditor } from './RevealEditor'

describe('RevealEditor', () => {
  it('offers to add a reveal when there is none', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={undefined} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add reveal to Alex' }))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('edits the headline', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{}} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Reveal headline for Alex'), 'H')
    expect(onChange).toHaveBeenCalledWith({ headline: 'H' })
  })

  it('clears a field back to absent rather than storing an empty string', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{ headline: 'H' }} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Reveal headline for Alex'))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('writes media as a kind and value pair', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{}} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Reveal media value for Alex'), '🍺')
    expect(onChange).toHaveBeenCalledWith({ media: { kind: 'emoji', value: '🍺' } })
  })

  it('drops media when its value is emptied', async () => {
    const onChange = vi.fn()
    render(
      <RevealEditor
        name="Alex"
        reveal={{ media: { kind: 'emoji', value: '🍺' } }}
        onChange={onChange}
      />,
    )
    await userEvent.clear(screen.getByLabelText('Reveal media value for Alex'))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('removes the whole reveal', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{ headline: 'H' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove reveal from Alex' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('keeps an emptied reveal, since a bare reveal still shows the label', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{ headline: 'H' }} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Reveal headline for Alex'))
    // {} not undefined: emptying the fields is not the same as removing it.
    expect(onChange).toHaveBeenCalledWith({})
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/editor/RevealEditor.test.tsx`
Expected: FAIL — cannot resolve `./RevealEditor`.

- [ ] **Step 3: Write the component**

Create `src/editor/RevealEditor.tsx`:

```tsx
import type { Media, Reveal } from '../wheel/types'

export type RevealEditorProps = {
  /** Names the controls for screen readers and tests. */
  name: string
  reveal: Reveal | undefined
  onChange: (reveal: Reveal | undefined) => void
}

const KINDS: Media['kind'][] = ['emoji', 'image', 'gif']

export function RevealEditor({ name, reveal, onChange }: RevealEditorProps) {
  if (reveal === undefined) {
    return (
      <button
        className="reveal-editor__add"
        type="button"
        aria-label={`Add reveal to ${name}`}
        onClick={() => onChange({})}
      >
        + Reveal
      </button>
    )
  }

  // An absent field means "not authored", so a cleared control deletes its key
  // rather than storing an empty string. An emptied reveal stays `{}` — that is
  // an overlay showing the label, which is not the same as no reveal.
  const patch = (next: Partial<Reveal>) => {
    const merged: Reveal = { ...reveal, ...next }
    for (const key of Object.keys(merged) as (keyof Reveal)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    onChange(merged)
  }

  const media = reveal.media

  return (
    <div className="reveal-editor">
      <input
        className="reveal-editor__headline"
        aria-label={`Reveal headline for ${name}`}
        placeholder={name}
        value={reveal.headline ?? ''}
        onChange={(event) => patch({ headline: event.target.value || undefined })}
      />
      <input
        className="reveal-editor__body"
        aria-label={`Reveal body for ${name}`}
        placeholder="body"
        value={reveal.body ?? ''}
        onChange={(event) => patch({ body: event.target.value || undefined })}
      />
      <select
        className="reveal-editor__kind"
        aria-label={`Reveal media kind for ${name}`}
        value={media?.kind ?? 'emoji'}
        onChange={(event) => {
          const kind = event.target.value as Media['kind']
          patch({ media: media === undefined ? undefined : { ...media, kind } })
        }}
      >
        {KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {kind}
          </option>
        ))}
      </select>
      <input
        className="reveal-editor__media"
        aria-label={`Reveal media value for ${name}`}
        placeholder="emoji or URL"
        value={media?.value ?? ''}
        onChange={(event) => {
          const value = event.target.value
          patch({ media: value === '' ? undefined : { kind: media?.kind ?? 'emoji', value } })
        }}
      />
      <input
        className="reveal-editor__hold"
        type="number"
        min={0}
        step={250}
        aria-label={`Reveal hold for ${name}`}
        placeholder="hold ms"
        value={reveal.holdMs ?? ''}
        onChange={(event) => {
          const holdMs = Number.parseFloat(event.target.value)
          patch({ holdMs: Number.isFinite(holdMs) && holdMs > 0 ? holdMs : undefined })
        }}
      />
      <button
        type="button"
        aria-label={`Remove reveal from ${name}`}
        onClick={() => onChange(undefined)}
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the component tests**

Run: `npx vitest run src/editor/RevealEditor.test.tsx`
Expected: PASS, all 7 cases.

- [ ] **Step 5: Mount it in `SegmentList`**

In `src/editor/SegmentList.tsx`, import it:

```ts
import { RevealEditor } from './RevealEditor'
```

The static rows are a flat `<li>`. Add the editor as a trailing child of each authored row, after the delete button and before `</li>`:

```tsx
            <RevealEditor
              name={segment.label}
              reveal={segment.reveal}
              onChange={(reveal) => replace(index, { reveal })}
            />
```

`replace` spreads a `Partial<Segment>`, so `{ reveal: undefined }` writes the key back as `undefined` rather than deleting it. Change `replace` to strip undefined values:

```tsx
  const replace = (index: number, patch: Partial<Segment>) => {
    onChange(
      segments.map((segment, i) => {
        if (i !== index) return segment
        const merged = { ...segment, ...patch }
        for (const key of Object.keys(patch) as (keyof Segment)[]) {
          if (merged[key] === undefined) delete merged[key]
        }
        return merged
      }),
    )
  }
```

- [ ] **Step 6: Mount it in `OverridesPanel`**

In `src/editor/OverridesPanel.tsx`, import it and add it as the last child of `Row`'s `<li>`, before the forget button:

```tsx
      <RevealEditor
        name={label}
        reveal={override.reveal}
        onChange={(reveal) => onPatch({ reveal })}
      />
```

`patch` in this file already deletes undefined keys, so removing a reveal clears it correctly with no change.

- [ ] **Step 7: Add the styles**

Append to `src/editor/Editor.css`:

```css
.reveal-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  width: 100%;
  padding: 0.35rem 0 0.1rem;
}

.reveal-editor__headline,
.reveal-editor__body,
.reveal-editor__media {
  flex: 1 1 6rem;
  min-width: 0;
}

.reveal-editor__hold {
  width: 5rem;
}

.reveal-editor__add {
  font-size: 0.8rem;
  opacity: 0.7;
}
```

- [ ] **Step 8: Run the editor tests**

Run: `npx vitest run src/editor/`
Expected: PASS. If `SegmentList.test.tsx` or `OverridesPanel.test.tsx` query by a role or label that the new controls now duplicate (for example a bare `getByRole('textbox')`), tighten that query to the specific `aria-label` it meant — do not remove the assertion.

- [ ] **Step 9: Commit**

```bash
git add src/editor/RevealEditor.tsx src/editor/RevealEditor.test.tsx src/editor/SegmentList.tsx src/editor/OverridesPanel.tsx src/editor/Editor.css
git commit -m "feat(editor): author reveals on segments and overrides"
```

---

## Task 9: full verification and doc reconciliation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-wod-editor-design.md:32`
- Modify: `docs/superpowers/specs/2026-07-29-wod-design.md`

- [ ] **Step 1: Run everything**

Run: `npm run check && npm run build && npm test`
Expected: formatter clean, typecheck clean, all tests pass. Fix anything that fails before continuing — do not proceed with a red suite.

- [ ] **Step 2: Reconcile the two stale doc claims**

`2026-07-30-wod-editor-design.md:32` lists "Editing reveals" as a non-goal on the grounds that "the reveal renderer is not built yet; tricks stop at the wheel." Replace that bullet with a line saying reveals are now authored per-segment and per-override, and pointing at `2026-08-09-post-landing-lifecycle-design.md`.

`2026-07-29-wod-design.md` says a segment with no `reveal` gets a default takeover showing its label. Add a sentence recording that only authored reveals raise an overlay, with the pointer to the same spec. Keep both edits to one or two sentences — these are pointers, not a second copy of the design.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: reconcile the reveal deferrals with what shipped"
```

---

## Self-review notes

Spec sections and the task that implements each:

| Spec section | Task |
|---|---|
| The landing signal | 3 |
| `reveal/` module | 4, 5 |
| Dismissal | 4 (machine), 5 (input), 6 (spin disabled) |
| Not every landing overlays | 4 |
| Rendering | 5 |
| `reveal` becomes morphable | 1, 2 |
| Storage and authoring | 7, 8 |
| Draw history | none — specified as future work, deliberately unbuilt |
| Error handling | 5 (media failure), 4 (unmount, holdMs), 7 (malformed input) |
| Testing | every task is test-first |

Names fixed across tasks: `Landing`, `landing`, `landingCountRef`, `landedFrame`, `useReveal`, `Shown`, `shown`, `dismiss`, `sampleReveal`, `readReveal`, `readMedia`, `RevealEditor`.
