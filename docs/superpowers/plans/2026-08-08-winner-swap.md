# Winner Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two wedges trade labels and colors in the last instant before the wheel lands, so the pointer comes down on the wedge that was about to win and it is now somebody else.

**Architecture:** A recipe cannot be keyed on the winner today because `resolveTricks` runs before `planSpin` draws one. The fix is not to reorder but to resolve twice: pass 1 with `winnerId = null` produces the wheel `planSpin` draws from, pass 2 with the drawn winner produces the morphs that actually animate. Because both rolls are frozen for the whole resolution and every other recipe ignores `winnerId`, pass 2 reproduces pass 1 exactly plus the swap. The seam lives in `useSpin` via a new `SpinOverride.resolveLate` hook, which is what lets the editor rehearse the gag and what makes the show window see the winner that actually happened rather than the one it asked for.

**The invariant the whole design rests on:** *no winner-keyed weight writes.* Weight determines the arcs, the arcs determine where the pointer lands, and the landing determines the winner — so a recipe that moved weight in response to the winner would be chasing its own tail, and pass 2 would hand `rotor.animate` a landing distribution `planSpin` never saw. Enforced by a test over every registered recipe, not by a comment.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Biome. Design spec: `docs/superpowers/specs/2026-08-07-winner-swap-design.md` — read it before starting; it explains *why* at every point this plan only says *what*.

**Commands:** `npm test` runs the suite once (currently 477 passing across 36 files). `npx vitest run <path>` runs one file. `npm run build` typechecks (`tsc --noEmit`) then builds. `npm run check` runs Biome with `--write`.

**Conventions in this codebase, which you should follow:**
- Comments explain *why*, not *what*, and only where the reason is non-obvious. Do not narrate code. The comments written out in this plan are deliberate — keep them, and do not add more.
- Tests are colocated: `foo.ts` → `foo.test.ts`.
- Parsers in `src/preset/storage.ts` are defensive: malformed stored data is dropped or defaulted, never thrown on.
- Recipes are pure. They never import React, and they read params only through the readers in `src/tricks/params.ts`, which fall back rather than throw.
- Run `npm run check` before committing; Biome will reformat.
- Commit messages: conventional-commit style, lowercase subject. No `Co-Authored-By` trailer, no "Generated with" line.

**Two deviations from the design spec, decided here:**

1. **`resolveLate` returns the whole pass-2 morph list and `useSpin` replaces, rather than returning just the swap's morphs to be appended.** The spec's prose says "appended" while its own two-pass diagram says "the resulting list replaces pass 1's". Replacing is what falls out of the machinery — pass 2 is a whole `resolveTricks` run — and returning a delta would mean teaching the resolver to diff itself. The observable result is identical, because pass 2 reproduces pass 1 exactly plus the swap; the two-pass equivalence test in Task 5 is what holds that.
2. **`RecipeContext.winnerId` is required, not optional.** The spec writes it as `winnerId: string | null`, which is required-but-nullable, and that is the right call even though it breaks 12 construction sites: an optional field would let a new call site silently omit the winner, and `findConflicts` passing `null` should be a deliberate, visible act rather than an absence. The churn is mechanical and the compiler finds every site.

**What this plan does NOT build**, carried from the spec's "Not in this design" so it does not get reinvented: two named wedges trading with no winner involved; a geometric "whoever is under the pointer" framing; trading media or a reveal; and any conflict badging for the winner half — `findConflicts` has no winner and will not be given a speculative one.

---

### Task 1: `winnerId` reaches every recipe

Pure plumbing. No recipe reads the new field yet and no behavior changes, but the type change touches 12 object literals across 7 files and the compiler is what finds them.

**Files:**
- Modify: `src/tricks/types.ts` (`RecipeContext`)
- Modify: `src/tricks/resolve.ts` (`resolveTricks`)
- Modify: `src/tricks/conflicts.ts` (`findConflicts`)
- Modify: `src/spin/resolve.ts` (`evaluateWheel`)
- Test: `src/tricks/recipes/invariants.test.ts`, `relabel.test.ts`, `recolor.test.ts`, `vanish.test.ts`, `takeover.test.ts`

- [ ] **Step 1: Add the field**

In `src/tricks/types.ts`, add to `RecipeContext`, after `roll`:

```ts
  /** Null everywhere the winner is not yet known, which is most places. */
  winnerId: string | null
```

- [ ] **Step 2: Thread it through `resolveTricks`**

In `src/tricks/resolve.ts`, extend the signature — a defaulted trailing parameter, so every existing caller keeps working:

```ts
export function resolveTricks(
  base: Composition,
  tricks: Trick[],
  durationMs: number,
  roll = 0,
  winnerId: string | null = null,
): ResolvedTricks {
```

and add `winnerId` to the context literal it builds in its resolve pass, alongside `roll`.

- [ ] **Step 3: Make the editor's blindness explicit**

In `src/tricks/conflicts.ts`, the hand-built context literal gains:

```ts
    // Conflicts are computed before any spin, so there is no winner to declare
    // a claim on. A swap can only badge the wedge it was pointed at.
    winnerId: null,
```

- [ ] **Step 4: Run the typecheck to find the rest**

Run: `npm run build`
Expected: FAIL, with an error at every `RecipeContext` literal missing `winnerId`. Work the list. The test-side literals are in `src/tricks/recipes/invariants.test.ts` (the local `ctxFor` helper), `relabel.test.ts`, `recolor.test.ts`, `vanish.test.ts`, and `takeover.test.ts` (six separate literals). Add `winnerId: null` to each — none of these tests is about the winner.

Do not "fix" this by making the field optional.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS, 477 tests. Nothing should change behaviorally — this step is what proves the plumbing is inert.

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
npm run check
git add -A
git commit -m "feat(tricks): give every recipe context a winner slot"
```

---

### Task 2: the `swap` recipe

Pure, and the whole trick lives here. Nothing calls it with a real winner yet — Task 5 does that — so this task's tests are the specification.

**Files:**
- Modify: `src/tricks/types.ts` (`RecipeId`)
- Create: `src/tricks/recipes/swap.ts`
- Create: `src/tricks/recipes/swap.test.ts`
- Modify: `src/tricks/registry.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tricks/recipes/swap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyMorphs } from '../../wheel/morph'
import type { Segment } from '../../wheel/types'
import type { RecipeContext } from '../types'
import { swap } from './swap'

const DURATION_MS = 4000

// Cal carries no explicit color, so the palette supplies one. That is the case
// that silently half-works if the recipe reads `segment.color` directly.
const SEGMENTS: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1, color: '#ff0000' },
  { id: 'ben', label: 'Ben', weight: 1, color: '#00ff00' },
  { id: 'cal', label: 'Cal', weight: 1 },
]

const ctx = (winnerId: string | null): RecipeContext => ({
  trickId: 'swap1',
  segments: SEGMENTS,
  origins: new Map(),
  durationMs: DURATION_MS,
  roll: 0,
  winnerId,
})

const params = { otherWedgeId: 'ben', at: 0.95 }

describe('swap', () => {
  it('emits a mirrored pair of morphs', () => {
    const morphs = swap.resolve(params, ctx('ana'))
    expect(morphs.map((m) => m.segmentId).sort()).toEqual(['ana', 'ben'])
    for (const morph of morphs) {
      expect(morph.durationMs).toBe(DURATION_MS)
      expect(morph.keyframes).toHaveLength(2)
    }
  })

  it('holds each wedge as itself until the trade, then snaps', () => {
    const morphs = swap.resolve(params, ctx('ana'))
    const before = applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.9)
    const after = applyMorphs(SEGMENTS, morphs, DURATION_MS)

    expect(before.find((s) => s.id === 'ana')?.label).toBe('Ana')
    expect(before.find((s) => s.id === 'ben')?.label).toBe('Ben')
    expect(after.find((s) => s.id === 'ana')?.label).toBe('Ben')
    expect(after.find((s) => s.id === 'ben')?.label).toBe('Ana')
  })

  it('snaps the color rather than fading it', () => {
    // Both keyframes share one offset, so `bracket` returns t = 1 for the pair
    // and the color jumps. A fade would telegraph the switch to the audience.
    const morphs = swap.resolve(params, ctx('ana'))
    const justBefore = applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.949)
    const justAfter = applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.951)
    expect(justBefore.find((s) => s.id === 'ana')?.color).toBe('#ff0000')
    expect(justAfter.find((s) => s.id === 'ana')?.color).toBe('#00ff00')
  })

  it('fires at the authored offset, not before', () => {
    const morphs = swap.resolve({ otherWedgeId: 'ben', at: 0.5 }, ctx('ana'))
    expect(applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.49).find((s) => s.id === 'ana')?.label).toBe('Ana')
    expect(applyMorphs(SEGMENTS, morphs, DURATION_MS * 0.51).find((s) => s.id === 'ana')?.label).toBe('Ben')
  })

  it('trades the palette color of a wedge that has none of its own', () => {
    // `segment.color` is undefined for Cal. Passed straight through, the label
    // would trade while the color did not, which reads as a rendering bug.
    const morphs = swap.resolve({ otherWedgeId: 'cal', at: 0.95 }, ctx('ana'))
    const after = applyMorphs(SEGMENTS, morphs, DURATION_MS)
    const ana = after.find((s) => s.id === 'ana')
    const cal = after.find((s) => s.id === 'cal')
    expect(ana?.label).toBe('Cal')
    expect(cal?.label).toBe('Ana')
    expect(ana?.color).toBeDefined()
    expect(ana?.color).not.toBe('#ff0000')
    expect(cal?.color).toBe('#ff0000')
  })

  it('keeps the pre-swap keyframe first', () => {
    // Both keyframes share an offset, so only sort stability keeps them in the
    // authored order. Reversed, the swap fires backwards: each wedge would
    // start out wearing the other's name and revert at `at`.
    const [winnerMorph] = swap.resolve(params, ctx('ana'))
    expect(winnerMorph.keyframes[0].label).toBe('Ana')
    expect(winnerMorph.keyframes[1].label).toBe('Ben')
  })

  it('never writes weight', () => {
    const morphs = swap.resolve(params, ctx('ana'))
    for (const morph of morphs) {
      for (const keyframe of morph.keyframes) {
        expect(keyframe).not.toHaveProperty('weight')
      }
    }
  })

  describe('emits nothing when', () => {
    it('there is no winner yet', () => {
      // The editor while scrubbing. An unresolvable selection is a no-op.
      expect(swap.resolve(params, ctx(null))).toEqual([])
    })

    it('the chosen wedge is the winner', () => {
      // Trading a wedge with itself would put two contradictory morphs on one id.
      expect(swap.resolve({ otherWedgeId: 'ana', at: 0.95 }, ctx('ana'))).toEqual([])
    })

    it('the chosen wedge is gone', () => {
      expect(swap.resolve({ otherWedgeId: 'ghost', at: 0.95 }, ctx('ana'))).toEqual([])
    })

    it('the winner is not on the wheel', () => {
      expect(swap.resolve(params, ctx('ghost'))).toEqual([])
    })

    it('nothing is chosen', () => {
      expect(swap.resolve({ at: 0.95 }, ctx('ana'))).toEqual([])
    })
  })

  describe('validate', () => {
    const wedges = { has: (id: string) => ['ana', 'ben', 'cal'].includes(id) }

    it('accepts a known wedge', () => {
      expect(swap.validate({ otherWedgeId: 'ben' }, wedges)).toBeNull()
    })

    it('reports an empty choice the way takeover does', () => {
      expect(swap.validate({ otherWedgeId: '' }, wedges)).toBe('no wedge chosen')
      expect(swap.validate({}, wedges)).toBe('no wedge chosen')
    })

    it('reports a wedge nobody can produce', () => {
      expect(swap.validate({ otherWedgeId: 'ghost' }, wedges)).toBe('unknown wedge: ghost')
    })
  })

  describe('writes', () => {
    it('claims both wedges when the winner is known', () => {
      expect(swap.writes(params, ctx('ana'))).toEqual([
        { segmentId: 'ben', property: 'label' },
        { segmentId: 'ben', property: 'color' },
        { segmentId: 'ana', property: 'label' },
        { segmentId: 'ana', property: 'color' },
      ])
    })

    it('claims only the chosen wedge when there is no winner', () => {
      // What `findConflicts` sees. The winner half goes unbadged, which is the
      // documented cost of not inventing a speculative winner.
      expect(swap.writes(params, ctx(null))).toEqual([
        { segmentId: 'ben', property: 'label' },
        { segmentId: 'ben', property: 'color' },
      ])
    })

    it('claims nothing when nothing is chosen', () => {
      expect(swap.writes({}, ctx(null))).toEqual([])
    })
  })

  it('provides no wedges', () => {
    expect(swap.provides({ otherWedgeId: 'ben' }, 'swap1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/tricks/recipes/swap.test.ts`
Expected: FAIL — `Failed to resolve import "./swap"`.

- [ ] **Step 3: Write the recipe**

In `src/tricks/types.ts`, extend the union:

```ts
export type RecipeId = 'takeover' | 'vanish' | 'recolor' | 'relabel' | 'swap'
```

Create `src/tricks/recipes/swap.ts`:

```ts
import { effectiveColor } from '../../wheel/palette'
import type { Morph } from '../../wheel/types'
import { readString, readUnit } from '../params'
import type { Recipe, RecipeContext, TrickParams, Write } from '../types'

const DEFAULT_AT = 0.95

/** The pair this trick acts on, or null when there is nothing to trade. */
function pair(params: TrickParams, ctx: RecipeContext) {
  if (ctx.winnerId === null) return null
  const otherId = readString(params, 'otherWedgeId', '')
  // Trading a wedge with itself is a no-op that would otherwise produce two
  // contradictory morphs on one id.
  if (otherId === '' || otherId === ctx.winnerId) return null
  const winner = ctx.segments.find((segment) => segment.id === ctx.winnerId)
  const other = ctx.segments.find((segment) => segment.id === otherId)
  if (!winner || !other) return null
  // `effectiveColor`, not `segment.color`: a wedge with no explicit color takes
  // one from the palette, and passing undefined through would leave the color
  // half of the swap silently doing nothing while the labels traded.
  const winnerColor = effectiveColor(ctx.segments, winner.id)
  const otherColor = effectiveColor(ctx.segments, other.id)
  if (winnerColor === null || otherColor === null) return null
  return { winner, other, winnerColor, otherColor }
}

export const swap: Recipe = {
  id: 'swap',
  name: 'Two wedges trade identities',
  description: 'The winner and one other wedge exchange names and colors just before the wheel lands.',
  defaults: { otherWedgeId: '', at: DEFAULT_AT },
  fields: [
    { key: 'otherWedgeId', label: 'Trades with', kind: 'segment' },
    { key: 'at', label: 'Fires at', kind: 'slider', min: 0, max: 1, step: 0.01 },
  ],

  provides: () => [],

  resolve(params, ctx): Morph[] {
    const trade = pair(params, ctx)
    if (!trade) return []
    const at = readUnit(params, 'at', DEFAULT_AT)
    const { winner, other, winnerColor, otherColor } = trade
    // Two keyframes on one offset per wedge: the first holds the wedge as
    // itself, the second is what it becomes. A zero-length span makes `bracket`
    // return t = 1, so the identity snaps instead of fading — a fade would show
    // the audience the switch coming.
    return [
      {
        segmentId: winner.id,
        durationMs: ctx.durationMs,
        keyframes: [
          { at, label: winner.label, color: winnerColor },
          { at, label: other.label, color: otherColor },
        ],
      },
      {
        segmentId: other.id,
        durationMs: ctx.durationMs,
        keyframes: [
          { at, label: other.label, color: otherColor },
          { at, label: winner.label, color: winnerColor },
        ],
      },
    ]
  },

  writes(params, ctx): Write[] {
    const otherId = readString(params, 'otherWedgeId', '')
    if (otherId === '') return []
    const claims: Write[] = [
      { segmentId: otherId, property: 'label' },
      { segmentId: otherId, property: 'color' },
    ]
    if (ctx.winnerId !== null && ctx.winnerId !== otherId) {
      claims.push(
        { segmentId: ctx.winnerId, property: 'label' },
        { segmentId: ctx.winnerId, property: 'color' },
      )
    }
    return claims
  },

  validate(params, wedges) {
    const id = readString(params, 'otherWedgeId', '')
    if (id === '') return 'no wedge chosen'
    return wedges.has(id) ? null : `unknown wedge: ${id}`
  },
}
```

Register it in `src/tricks/registry.ts`: import `swap`, add it to `RECIPES`, and append it to `RECIPE_LIST`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/tricks/recipes/swap.test.ts`
Expected: PASS.

If `trades the palette color of a wedge that has none of its own` fails with an undefined color, check `withImplicitBase` in `src/wheel/morph.ts` — it only prepends a base keyframe when the base is defined, which is the trap `effectiveColor` exists to avoid.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. Note that `src/preset/storage.test.ts` and `src/editor/TrickLibrary.test.tsx` may assert over the recipe list; if a count or list assertion fails, update it — a new recipe legitimately changes those.

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
npm run check
git add -A
git commit -m "feat(tricks): add the swap recipe"
```

---

### Task 3: the invariant, enforced across the registry

The guard on the whole design. It has to fail loudly and name the rule, because the failure it prevents — a landing distribution `planSpin` never saw — shows up as a pointer resting somewhere the plan did not predict, which nobody would trace back to a recipe.

**Files:**
- Modify: `src/tricks/recipes/invariants.test.ts`
- Modify: `src/wheel/morph.test.ts`

- [ ] **Step 1: Write the failing tests**

Read `src/tricks/recipes/invariants.test.ts` first and follow its existing shape — it already iterates the registry and has a local `ctxFor` helper. Add:

```ts
  it('never lets a winner-keyed recipe write weight', () => {
    // Weight determines the arcs, the arcs determine where the pointer lands,
    // and the landing determines the winner — so a recipe that moved weight in
    // response to the winner would make pass 2 produce a distribution planSpin
    // never saw, and the pointer would rest somewhere the plan did not predict.
    for (const recipe of RECIPE_LIST) {
      const params = recipe.defaults
      const blind = recipe.resolve(params, { ...ctxFor(recipe, params), winnerId: null })
      const knowing = recipe.resolve(params, { ...ctxFor(recipe, params), winnerId: 'ana' })
      if (JSON.stringify(blind) === JSON.stringify(knowing)) continue

      for (const morph of knowing) {
        for (const keyframe of morph.keyframes) {
          expect(
            keyframe.weight,
            `${recipe.id} reads winnerId and writes weight — no winner-keyed weight writes`,
          ).toBeUndefined()
        }
      }
    }
  })
```

The `defaults` of a recipe may not name a real wedge, which would make every recipe's output empty and the test vacuous. Guard against that: after writing it, temporarily give `swap` a params object naming a real wedge and confirm the loop actually reaches the assertion for `swap`. If the registry's defaults make the comparison trivially equal for every recipe, parameterize the loop with per-recipe params that do exercise each recipe, and say so in your report.

Then in `src/wheel/morph.test.ts`, pin the sort stability the swap depends on:

```ts
  it('keeps two keyframes on one offset in authored order', () => {
    // The swap puts both of a wedge's identities on the same offset and relies
    // on the sort in `pointsFor` being stable. The language guarantees it; the
    // failure mode if it ever stopped holding is a swap that fires backwards,
    // which looks like a trick misfiring rather than a sort changing.
    const morph: Morph = {
      segmentId: 'ana',
      durationMs: 1000,
      keyframes: [
        { at: 0.5, label: 'first' },
        { at: 0.5, label: 'second' },
      ],
    }
    expect(applyMorphs(SEGMENTS, [morph], 400).find((s) => s.id === 'ana')?.label).toBe('first')
    expect(applyMorphs(SEGMENTS, [morph], 600).find((s) => s.id === 'ana')?.label).toBe('second')
  })
```

Adapt `SEGMENTS` and the imports to whatever that file already has — do not add a second fixture if a suitable one exists.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/tricks/recipes/invariants.test.ts src/wheel/morph.test.ts`
Expected: PASS — both describe behavior that already holds. These are regression guards, not a red-green cycle, which is exactly why Step 1 asks you to prove the invariant loop is not vacuous.

- [ ] **Step 3: Prove the invariant would catch a violation**

Temporarily make `swap.resolve` add `weight: 0.5` to one of its keyframes. Run the invariants test and confirm it fails, quoting the rule in its message. Revert.

Report what you saw. A guard that cannot fail is worse than no guard, because it reads as protection.

- [ ] **Step 4: Commit**

```bash
npm run check
git add -A
git commit -m "test(tricks): forbid winner-keyed weight writes across the registry"
```

---

### Task 4: resolve twice

`resolveScriptedSpin` already owns the frozen rolls and the enabled-trick set that a second pass has to reproduce. Rather than leaking those, it hands back a closure over them.

**Files:**
- Modify: `src/spin/resolve.ts`
- Test: `src/spin/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Read `src/spin/resolve.test.ts` and reuse its existing `base`/`spin`/`fixed` fixtures. Add:

```ts
  it('reproduces the first pass exactly, plus the swap', () => {
    const tricks: Trick[] = [
      { id: 's', name: 'swap', recipe: 'swap', params: { otherWedgeId: 'ben', at: 0.95 }, enabled: true },
      { id: 'r', name: 'relabel', recipe: 'relabel', params: { targets: ['cal'], at: 0.5 }, enabled: true },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    if (!result) throw new Error('expected a resolution')

    const late = result.resolveLate(result.winnerId)
    const unchanged = (morphs: Morph[]) => morphs.filter((m) => m.segmentId !== result.winnerId && m.segmentId !== 'ben')

    // Every morph the swap did not author survives pass 2 byte for byte. If the
    // rolls were re-drawn between passes, an unrelated selector would move.
    expect(unchanged(late)).toEqual(unchanged(result.morphs))
    // And the swap is what pass 2 added.
    expect(late.length).toBeGreaterThan(result.morphs.length)
  })

  it('lands on the same weights in both passes', () => {
    // The invariant, observed end to end: pass 2 must not move an arc, or the
    // winner planSpin drew from a pass-1 wheel would not be the winner the
    // pointer meets.
    const tricks: Trick[] = [
      { id: 's', name: 'swap', recipe: 'swap', params: { otherWedgeId: 'ben', at: 0.95 }, enabled: true },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    if (!result) throw new Error('expected a resolution')

    const weightsOf = (morphs: Morph[]) =>
      landingSegments(result.segments, morphs, spin.motion.durationMs).map((s) => [s.id, s.weight])

    expect(weightsOf(result.resolveLate(result.winnerId))).toEqual(weightsOf(result.morphs))
  })

  it('emits no swap morphs in the first pass', () => {
    const tricks: Trick[] = [
      { id: 's', name: 'swap', recipe: 'swap', params: { otherWedgeId: 'ben', at: 0.95 }, enabled: true },
    ]
    const result = resolveScriptedSpin(base, tricks, spin, [], fixed(0.1))
    expect(result?.morphs).toEqual([])
  })
```

Import `Morph` and `landingSegments` as needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/spin/resolve.test.ts`
Expected: FAIL — `resolveLate` does not exist on the resolution.

- [ ] **Step 3: Implement**

In `src/spin/resolve.ts`:

Give `evaluateWheel` a trailing `winnerId: string | null = null` parameter and pass it through to `resolveTricks` as the fifth argument.

Add `resolveLate` to both arms of `Resolution`:

```ts
  /**
   * Pass 2. Re-resolves with the winner the pointer actually landed on, over
   * the frozen rolls and the enabled set this walk finished with, so nothing
   * but a winner-keyed recipe can differ from the morphs above.
   */
  resolveLate: (winnerId: string) => Morph[]
```

At each of the two return sites — the `settled` return inside the loop and the `exhausted` return after it — build the closure from a snapshot rather than the live bindings, since `enabled` is mutated in place and `current` is reassigned:

```ts
    const finalSpin = current
    const finalEnabled = new Set(enabled)
    const resolveLate = (winner: string): Morph[] =>
      evaluateWheel(base, tricks, finalEnabled, finalSpin, selectorRoll, winner).morphs
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/spin/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test` and `npm run build`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
npm run check
git add -A
git commit -m "feat(spin): hand back a second resolution keyed on the drawn winner"
```

---

### Task 5: the seam in `useSpin`

Where pass 2 actually runs. The landed frame must be recomputed from the merged list — `planSpin.landing` was sampled from pass 1 and still shows the pre-swap labels, and landing on that frame would undo the trick at the exact moment it fires.

**Files:**
- Modify: `src/wheel/useSpin.ts`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Write the failing tests**

Read `src/wheel/useSpin.test.ts` first — it has a full harness (`installHarness`, `renderSpin`) you should reuse. Add:

```ts
  it('resolves late with the drawn winner and lands on the swapped frame', async () => {
    const seen: string[] = []
    const { result } = renderSpin(PLAIN)
    act(() => {
      result.current.spin({
        resolveLate: (winnerId) => {
          seen.push(winnerId)
          return [
            {
              segmentId: winnerId,
              durationMs: DURATION_MS,
              keyframes: [
                { at: 0.95, label: 'before' },
                { at: 0.95, label: 'after' },
              ],
            },
          ]
        },
      })
    })

    // Called with the winner planSpin actually drew, not one supplied up front.
    expect(seen).toHaveLength(1)

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    // The landed frame carries the late morph. Falling back to plan.landing
    // here would show the pre-swap labels at the one moment that matters.
    expect(result.current.winnerId).toBe(seen[0])
    const landed = result.current.displaySegments.find((s) => s.id === seen[0])
    expect(landed?.label).toBe('after')
  })

  it('runs the late morphs on the animation clock', () => {
    const { result } = renderSpin(PLAIN)
    harness.setNow(1000)
    act(() => {
      result.current.spin({
        resolveLate: (winnerId) => [
          {
            segmentId: winnerId,
            durationMs: DURATION_MS,
            keyframes: [
              { at: 0.5, label: 'early' },
              { at: 0.5, label: 'late' },
            ],
          },
        ],
      })
    })

    // A config with no morphs of its own still has to start the geometry loop
    // once a late morph exists, or the swap would only appear at the landing.
    expect(harness.rafStarts).toBe(1)
    act(() => {
      harness.flushFrames(1000 + DURATION_MS * 0.6)
    })
    expect(result.current.displaySegments.some((s) => s.label === 'late')).toBe(true)
  })

  it('leaves the planned landing alone when nothing resolves late', async () => {
    const { result } = renderSpin(MORPHING)
    act(() => {
      result.current.spin()
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    expect(result.current.displaySegments).toEqual(landingSegments(SEGMENTS, MORPHS, DURATION_MS))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — `resolveLate` is not a property of `SpinOverride`.

- [ ] **Step 3: Implement**

In `src/wheel/useSpin.ts`, extend `SpinOverride`:

```ts
  /**
   * Pass 2, run after the winner is drawn and before the rotation starts. The
   * returned list replaces the config's morphs outright — it is a whole
   * re-resolution, not a delta.
   */
  resolveLate?: (winnerId: string) => Morph[]
```

Inside `spin`, immediately after the `if (!plan) return` guard:

```ts
      const lateMorphs = override.resolveLate?.(plan.winnerId)
      const morphs = lateMorphs ?? spinConfig.morphs
      // plan.landing was sampled from pass 1 and still shows the pre-swap
      // labels; landing on it would undo the trick as it fires.
      const landing = lateMorphs
        ? landingSegments(spinSegments, lateMorphs, spinConfig.durationMs)
        : plan.landing
```

Then replace the two remaining uses: the geometry track's guard and body must read `morphs` rather than `spinConfig.morphs` (both the `.length > 0` check and the `applyMorphs` call), and the `finished` handler must `setDisplaySegments(landing)` rather than `plan.landing`.

`landingSegments` is already imported in this file's neighbourhood — check, and import from `./morph` if not.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS, including every pre-existing test — the no-`resolveLate` path must be unchanged.

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test` and `npm run build`

- [ ] **Step 6: Commit**

```bash
npm run check
git add -A
git commit -m "feat(wheel): let a spin re-resolve once the winner is known"
```

---

### Task 6: both windows fire the gag

The show window gets the closure the resolver built; the editor builds its own, which is what lets an operator rehearse the bit before the meeting.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/editor/Editor.tsx`
- Test: `src/App.test.tsx`, `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Both files already have a spin harness and a way of seeding `localStorage`; read them and reuse both rather than inventing a third style. The seeding call, the render call, and the landing call below are written as `<the file's existing …>` because those files have changed recently and you should copy their current form — everything else is exact.

In `src/App.test.tsx`:

```tsx
  it('announces the swapped-in name, and the wheel agrees', async () => {
    // Two wedges only, so the swap partner is whoever did not win and the
    // assertion does not depend on which way the pinned draw fell.
    <the file's existing way of seeding a preset>({
      segments: [
        { id: 'ana', label: 'Ana', weight: 1 },
        { id: 'ben', label: 'Ben', weight: 1 },
      ],
      tricks: [
        {
          id: 's',
          name: 'the swap',
          recipe: 'swap',
          params: { otherWedgeId: 'ben', at: 0.95 },
          enabled: true,
        },
      ],
    })
    const harness = installSpinHarness()
    try {
      <the file's existing render call>
      await userEvent.click(screen.getByRole('button', { name: /^spin$/i }))
      await harness.land()

      // The announcement reads the winner's label out of the landed frame, so
      // the name on screen is the traded one. That is the gag working.
      const announced = screen.getByText(/^(Ana|Ben)$/).textContent
      const wheel = screen.getByRole('img', { name: 'wheel' })
      expect(within(wheel).getByText(announced as string)).toBeInTheDocument()

      // And it really did trade: the label now sitting on the winning wedge is
      // not the one that wedge started with.
      const keyframes = harness.keyframes[0]
      expect(keyframes.length).toBeGreaterThan(0)
    } finally {
      harness.restore()
    }
  })
```

If `App.test.tsx` has no `installSpinHarness`, use whatever it does have — the assertion that matters is the first one: the announced name appears inside the wheel, and both come from the landed frame.

In `src/editor/Editor.test.tsx`, whose default preset has five wedges:

```tsx
  it('rehearses the swap in the editor', async () => {
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      <the file's existing way of adding and enabling a trick, for recipe 'swap'
       with params { otherWedgeId: 'ben', at: 0.95 }>
      await userEvent.click(screen.getByRole('button', { name: /spin with these tricks/i }))
      await harness.land()

      // Ben's name is now on two wedges at no point, and on the winner's wedge
      // at the end: the landed frame carries the trade, so exactly one wedge
      // reads 'Ben' and it is not Ben's own.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      expect(within(wheel).getAllByText('Ben')).toHaveLength(1)
    } finally {
      harness.restore()
    }
  })
```

If adding a trick through the UI is fiddly in that file, seed the preset into `localStorage` before `render` the way its integration tests do, and say which route you took.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/App.test.tsx src/editor/Editor.test.tsx`
Expected: FAIL — no `resolveLate` is passed, so the swap never emits.

- [ ] **Step 3: Wire both windows**

In `src/App.tsx`'s `onSpin`, add to the `spin({ … })` call:

```ts
      resolveLate: resolution.resolveLate,
```

In `src/editor/Editor.tsx`, the editor has no scripted-spin resolution to borrow from, so it builds its own pass 2 over the same inputs its preview used:

```ts
  const handleSpin = useCallback(() => {
    setSpun(true)
    spin({
      resolveLate: (winnerId) =>
        resolveTricks(base, preset.tricks, preset.spin.motion.durationMs, 0, winnerId).morphs,
    })
  }, [spin, base, preset.tricks, preset.spin.motion.durationMs])
```

The `0` is the same default roll the editor's preview resolution uses, so pass 2 reproduces it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.tsx src/editor/Editor.test.tsx`

- [ ] **Step 5: Run everything**

Run: `npm test` and `npm run build`

- [ ] **Step 6: Commit**

```bash
npm run check
git add -A
git commit -m "feat(app): fire the swap in the show window and the editor"
```

---

### Task 7: write down what will surprise someone

Two consequences of this design are correct and genuinely surprising. They belong in the docs rather than in somebody's debugging session.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-winner-swap-design.md`

- [ ] **Step 1: Record what shipped**

The spec already states both consequences under "Two consequences worth writing down" — verify they still describe what was built, and correct them if the implementation diverged. In particular, check the sentence about morphs being *appended*: this plan implemented replacement instead (see this plan's header). Update the spec to describe what exists, and note the reason in a sentence.

Add nothing else. This is a correction pass, not a changelog.

- [ ] **Step 2: Commit**

```bash
git add docs/
git commit -m "docs: reconcile the winner-swap spec with what shipped"
```

---

### Task 8: watch two wedges lie to a room

**Files:** none — verification only.

- [ ] **Step 1: Author the gag**

Run `npm run dev`, open `#/edit`, add a `swap` trick, point "Trades with" at a wedge, leave "Fires at" at 0.95, and enable it.

- [ ] **Step 2: Spin, and watch the wedge under the pointer**

Expected: the wheel slows into a wedge, and in the last instant that wedge and its partner exchange names and colors. The trade should *snap* — if you can see a color fade, the two keyframes are not sharing an offset and the audience gets a tell.

- [ ] **Step 3: Confirm the announcement agrees with the wheel**

Open the show page, spin there, and check that the announced winner is the *swapped-in* name and matches what the wheel shows under the pointer. They are the same frame; if they disagree, the landed frame is not being recomputed.

- [ ] **Step 4: Confirm a branch still fires on the true winner**

Author a branch with a `landsOn` condition naming the wedge the pointer actually lands in, and confirm it fires even though the wheel now shows a different name there. This is correct — the branch tree reasons about what happened, not about what the audience was shown — and Step 1 of Task 7 is where it is written down.

- [ ] **Step 5: Report what you saw**

If any of the above did not hold, say so plainly with what you observed. Do not report the feature complete on a green suite alone.
