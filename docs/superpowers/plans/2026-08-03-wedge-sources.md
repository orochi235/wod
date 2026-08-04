# Wedge Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose three kinds of wedge — external (feed-driven), static (editor-authored), and computed (trick-provided) — into the one flat `Segment[]` the wheel already takes, and ship a simulated meeting feed to drive it.

**Architecture:** A new `composeBase()` merges statics, feed items, and per-item overrides into a `Composition` (`{ segments, origins }`). `resolveTricks()` takes that `Composition` instead of a bare array and appends computed wedges. Provenance lives in a derived `Map<string, Origin>`, never on `Segment` — the wheel's types are untouched. Tricks and branches reach external wedges through reserved `@`-prefixed pseudo-ids in the `string[]` target lists they already use. Feed *config* persists in the preset; feed *items* travel on a `BroadcastChannel` and never reach `localStorage`.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Biome. Design spec: `docs/superpowers/specs/2026-08-03-wedge-sources-design.md`.

**Commands:** `npm test` runs the suite once. `npx vitest run <path>` runs one file. `npm run build` typechecks (`tsc --noEmit`) then builds. `npm run check` runs Biome with `--write`.

**Conventions in this codebase, which you should follow:**
- Parsers in `src/preset/storage.ts` are defensive: malformed stored data is dropped or defaulted, never thrown on. Loading must never crash.
- Comments explain *why*, not *what*, and only where the reason is non-obvious. Do not narrate code.
- Tests are colocated: `foo.ts` → `foo.test.ts`.
- Run `npm run check` before committing; Biome will reformat.

---

### Task 1: Feed contract, origins, and `composeBase`

The pure merge of statics and feed items. No transport, no React, no tricks.

**Files:**
- Create: `src/feed/types.ts`
- Create: `src/compose/types.ts`
- Create: `src/compose/compose.ts`
- Create: `src/compose/compose.test.ts`

- [ ] **Step 1: Write the type modules**

Create `src/feed/types.ts`:

```ts
import type { Media, Reveal } from '../wheel/types'

/** One item from an external feed. The feed owns identity and label; nothing else. */
export type FeedItem = { id: string; label: string }

export type Unsubscribe = () => void

export type Feed = {
  id: string
  subscribe(cb: (items: FeedItem[]) => void): Unsubscribe
}

/** Applied to every item a feed produces, unless an override says otherwise. */
export type FeedDefaults = {
  weight: number
  /** Absent means palette-assigned, exactly as for a static segment. */
  color?: string
}

export type FeedConfigBase = {
  id: string
  defaults: FeedDefaults
  /** Static segment id this feed's block follows. Absent means after all statics. */
  insertAfter?: string
}

export type SimulatedFeedConfig = FeedConfigBase & {
  kind: 'simulated'
  /** Names available to join. */
  pool: string[]
  autochurn: { intervalMs: number; targetSize: number; volatility: number }
}

/** A union of one. The second member is the Meet adapter, deliberately not built yet. */
export type FeedConfig = SimulatedFeedConfig

/**
 * Sparse overlay on an external item, keyed by FeedItem.id. An absent field
 * means "use the feed default". Overrides outlive the item they describe, so a
 * joke survives its target leaving the room.
 */
export type ItemOverride = {
  excluded?: boolean
  label?: string
  weight?: number
  color?: string
  media?: Media
  reveal?: Reveal
}
```

Create `src/compose/types.ts`:

```ts
import type { Segment } from '../wheel/types'

/**
 * Derived from which list a wedge came from, never stored on the segment.
 * Storing it would let an imported preset claim a static wedge is external
 * with nothing to catch it.
 */
export type Origin =
  | { kind: 'static' }
  | { kind: 'external'; feedId: string; itemId: string }
  | { kind: 'computed'; trickId: string }

export type Composition = {
  segments: Segment[]
  origins: Map<string, Origin>
}
```

- [ ] **Step 2: Write the failing test**

Create `src/compose/compose.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FeedConfig, FeedItem, ItemOverride } from '../feed/types'
import type { Segment } from '../wheel/types'
import { composeBase, wedgeId } from './compose'

const statics: Segment[] = [
  { id: 'seg1', label: 'Spin again', weight: 1 },
  { id: 'seg2', label: 'Free beer', weight: 0.5 },
]

const roster: FeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: [],
  autochurn: { intervalMs: 2000, targetSize: 4, volatility: 0.3 },
}

const items: FeedItem[] = [
  { id: 'ana', label: 'Ana' },
  { id: 'ben', label: 'Ben' },
]

function compose(overrides: Record<string, ItemOverride> = {}, feed: FeedConfig = roster) {
  return composeBase({ statics, feeds: [feed], items: { sim: items }, overrides })
}

describe('composeBase', () => {
  it('namespaces external ids by feed', () => {
    expect(wedgeId('sim', 'ana')).toBe('sim:ana')
    expect(compose().segments.map((s) => s.id)).toEqual(['seg1', 'seg2', 'sim:ana', 'sim:ben'])
  })

  it('gives external wedges the feed defaults', () => {
    const feed: FeedConfig = { ...roster, defaults: { weight: 3, color: '#abcdef' } }
    const ana = compose({}, feed).segments.find((s) => s.id === 'sim:ana')
    expect(ana).toEqual({ id: 'sim:ana', label: 'Ana', weight: 3, color: '#abcdef' })
  })

  it('leaves color absent when the feed sets none, so the palette assigns it', () => {
    const ana = compose().segments.find((s) => s.id === 'sim:ana')
    expect(ana).not.toHaveProperty('color')
  })

  it('applies an override field by field', () => {
    const composed = compose({ ana: { label: 'ANA!', weight: 9, color: '#ff0000' } })
    expect(composed.segments.find((s) => s.id === 'sim:ana')).toEqual({
      id: 'sim:ana',
      label: 'ANA!',
      weight: 9,
      color: '#ff0000',
    })
  })

  it('drops an excluded item entirely', () => {
    const composed = compose({ ana: { excluded: true } })
    expect(composed.segments.map((s) => s.id)).toEqual(['seg1', 'seg2', 'sim:ben'])
    expect(composed.origins.has('sim:ana')).toBe(false)
  })

  it('collapses a negative or non-finite override weight to zero', () => {
    const composed = compose({ ana: { weight: -5 }, ben: { weight: Number.NaN } })
    expect(composed.segments.find((s) => s.id === 'sim:ana')?.weight).toBe(0)
    expect(composed.segments.find((s) => s.id === 'sim:ben')?.weight).toBe(0)
  })

  it('lets a static wedge win an id collision', () => {
    const composed = composeBase({
      statics: [{ id: 'sim:ana', label: 'Authored', weight: 7 }],
      feeds: [roster],
      items: { sim: items },
      overrides: {},
    })
    expect(composed.segments.filter((s) => s.id === 'sim:ana')).toHaveLength(1)
    expect(composed.segments[0].label).toBe('Authored')
    expect(composed.origins.get('sim:ana')).toEqual({ kind: 'static' })
  })

  it('places a feed block after its insertAfter anchor', () => {
    const composed = compose({}, { ...roster, insertAfter: 'seg1' })
    expect(composed.segments.map((s) => s.id)).toEqual(['seg1', 'sim:ana', 'sim:ben', 'seg2'])
  })

  it('appends when insertAfter names a segment that is not there', () => {
    const composed = compose({}, { ...roster, insertAfter: 'nope' })
    expect(composed.segments.map((s) => s.id)).toEqual(['seg1', 'seg2', 'sim:ana', 'sim:ben'])
  })

  it('reports an origin for every wedge', () => {
    const composed = compose()
    expect(composed.origins.get('seg1')).toEqual({ kind: 'static' })
    expect(composed.origins.get('sim:ben')).toEqual({
      kind: 'external',
      feedId: 'sim',
      itemId: 'ben',
    })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/compose/compose.test.ts`
Expected: FAIL — `Failed to resolve import "./compose"`.

- [ ] **Step 4: Implement `composeBase`**

> **Superseded by review.** The version below shipped as `7d295e7` and then took
> three fixes in a follow-up commit: `input.items[feed.id]` needs an
> `Array.isArray` guard (a feed id of `constructor` or `__proto__` resolves
> through the prototype chain and throws, the same hazard `getRecipe` documents);
> the two-phase block build buys nothing and its comment asserts an invariant
> that is not real, so the loops are fused; and `input.overrides[item.id]` uses
> `Object.hasOwn`. Read the committed `src/compose/compose.ts`, not this block.

Create `src/compose/compose.ts`:

```ts
import type { FeedConfig, FeedItem, ItemOverride } from '../feed/types'
import type { Segment } from '../wheel/types'
import type { Composition, Origin } from './types'

export type ComposeInput = {
  statics: Segment[]
  feeds: FeedConfig[]
  /** Latest items per feed id. A feed with nothing published contributes nothing. */
  items: Record<string, FeedItem[]>
  overrides: Record<string, ItemOverride>
}

export function wedgeId(feedId: string, itemId: string): string {
  return `${feedId}:${itemId}`
}

/** Matches readSegments: anything not a usable number is zero, never NaN on the wheel. */
function safeWeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function toSegment(feed: FeedConfig, item: FeedItem, override: ItemOverride | undefined): Segment {
  const segment: Segment = {
    id: wedgeId(feed.id, item.id),
    label: override?.label ?? item.label,
    weight: safeWeight(override?.weight ?? feed.defaults.weight),
  }
  const color = override?.color ?? feed.defaults.color
  if (color !== undefined) segment.color = color
  if (override?.media !== undefined) segment.media = override.media
  if (override?.reveal !== undefined) segment.reveal = override.reveal
  return segment
}

/**
 * Merges statics and feed items into the flat list the wheel takes, plus a
 * derived origin per wedge. Computed wedges are appended later by resolveTricks.
 *
 * Statics claim their ids first, so a feed can never displace an authored wedge.
 * A repeated id would make the pointer and the announced winner disagree, which
 * is the same rule readSegments enforces on stored data.
 */
export function composeBase(input: ComposeInput): Composition {
  const origins = new Map<string, Origin>()
  const statics: Segment[] = []
  for (const segment of input.statics) {
    if (origins.has(segment.id)) continue
    statics.push(segment)
    origins.set(segment.id, { kind: 'static' })
  }

  // Blocks are built before any are placed, so insertAfter reads against the
  // authored static order rather than against whatever an earlier feed inserted.
  const blocks = input.feeds.map((feed) => {
    const block: Segment[] = []
    for (const item of input.items[feed.id] ?? []) {
      const override = input.overrides[item.id]
      if (override?.excluded) continue
      const id = wedgeId(feed.id, item.id)
      if (origins.has(id)) continue
      block.push(toSegment(feed, item, override))
      origins.set(id, { kind: 'external', feedId: feed.id, itemId: item.id })
    }
    return { after: feed.insertAfter, block }
  })

  const staticIds = new Set(statics.map((segment) => segment.id))
  const anchored = new Map<string, Segment[]>()
  const appended: Segment[] = []
  for (const { after, block } of blocks) {
    // An anchor naming a segment that is not there degrades to appending rather
    // than dropping the block: a missing wedge must never cost you the roster.
    if (after !== undefined && staticIds.has(after)) {
      const existing = anchored.get(after)
      if (existing) existing.push(...block)
      else anchored.set(after, [...block])
    } else {
      appended.push(...block)
    }
  }

  const segments: Segment[] = []
  for (const segment of statics) {
    segments.push(segment)
    const block = anchored.get(segment.id)
    if (block) segments.push(...block)
  }
  segments.push(...appended)

  return { segments, origins }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/compose/compose.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/feed/types.ts src/compose/types.ts src/compose/compose.ts src/compose/compose.test.ts
git commit -m "feat(compose): merge statics and feed items into one wheel"
```

---

### Task 2: Thread `Composition` through `resolveTricks`

`resolveTricks` currently takes a bare `Segment[]`. It takes a `Composition` now, and returns one enriched with computed origins. Every call site changes.

**Files:**
- Modify: `src/tricks/types.ts` (`RecipeContext`)
- Modify: `src/tricks/resolve.ts`
- Modify: `src/tricks/conflicts.ts:12-26`
- Modify: `src/spin/resolve.ts:64-140`
- Modify: `src/App.tsx:18-62`
- Modify: `src/editor/Editor.tsx:27-35`
- Test: `src/tricks/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/tricks/resolve.test.ts` (keep the existing `people`, `beerTakeover`, `grayEveryone` fixtures; you will also update existing calls in Step 4):

```ts
import { composeBase } from '../compose/compose'

describe('resolveTricks origins', () => {
  const base = composeBase({ statics: people, feeds: [], items: {}, overrides: {} })

  it('marks a trick-provided wedge as computed', () => {
    const result = resolveTricks(base, [beerTakeover], 1000)
    expect(result.origins.get('beer:wedge')).toEqual({ kind: 'computed', trickId: 'beer' })
  })

  it('carries the base origins through untouched', () => {
    const result = resolveTricks(base, [beerTakeover], 1000)
    expect(result.origins.get('ana')).toEqual({ kind: 'static' })
  })

  it('reports no computed origin for a disabled trick', () => {
    const result = resolveTricks(base, [{ ...beerTakeover, enabled: false }], 1000)
    expect(result.origins.has('beer:wedge')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/tricks/resolve.test.ts`
Expected: FAIL — `resolveTricks` rejects a `Composition` argument and its result has no `origins`.

- [ ] **Step 3: Change `RecipeContext`**

In `src/tricks/types.ts`, replace the `RecipeContext` declaration with:

```ts
/** All segments including provided wedges, plus what a recipe needs to resolve. */
export type RecipeContext = {
  trickId: string
  segments: Segment[]
  origins: Map<string, Origin>
  durationMs: number
  /**
   * The resolution's frozen roll. Selectors draw from it rather than from a
   * fresh random, so re-evaluating at a deeper branch level cannot silently
   * reshuffle what an unrelated trick picked.
   */
  roll: number
}
```

Add to the imports at the top of that file:

```ts
import type { Origin } from '../compose/types'
```

`src/compose/types.ts` imports nothing from `tricks/`, so this is a type-only edge with no runtime cycle.

- [ ] **Step 4: Rewrite `resolveTricks`**

Replace the body of `src/tricks/resolve.ts` above `wedgeOwners` with:

```ts
import type { Composition, Origin } from '../compose/types'
import type { Morph, Segment } from '../wheel/types'
import { getRecipe } from './registry'
import type { Trick } from './types'

export type ResolvedTricks = Composition & {
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
  base: Composition,
  tricks: Trick[],
  durationMs: number,
  roll = 0,
): ResolvedTricks {
  const active = tricks.filter((trick) => trick.enabled && getRecipe(trick.recipe) !== null)

  // Pass 1: provide.
  const segments: Segment[] = [...base.segments]
  const origins = new Map<string, Origin>(base.origins)
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    for (const segment of recipe.provides(trick.params, trick.id)) {
      // Same dedupe rule composeBase applies: one id, one arc.
      if (origins.has(segment.id)) continue
      segments.push(segment)
      origins.set(segment.id, { kind: 'computed', trickId: trick.id })
    }
  }

  // Pass 2: resolve.
  const morphs: Morph[] = []
  for (const trick of active) {
    const recipe = getRecipe(trick.recipe)
    if (!recipe) continue
    morphs.push(
      ...recipe.resolve(trick.params, {
        trickId: trick.id,
        segments,
        origins,
        durationMs,
        roll,
      }),
    )
  }

  return { segments, origins, morphs }
}
```

Leave `wedgeOwners` exactly as it is.

- [ ] **Step 5: Update the four call sites**

In `src/tricks/conflicts.ts`, change the signature and the two lines that use it:

```ts
export function findConflicts(base: Composition, tricks: Trick[], durationMs: number): Conflict[] {
  const resolved = resolveTricks(base, tricks, durationMs)
```

and the context construction inside the loop:

```ts
    const ctx = {
      trickId: trick.id,
      segments: resolved.segments,
      origins: resolved.origins,
      durationMs,
      roll: 0,
    }
```

Add `import type { Composition } from '../compose/types'` and drop the now-unused `Segment` import.

In `src/spin/resolve.ts`, change `evaluateWheel` and `resolveScriptedSpin` to carry a `Composition` and the frozen roll:

```ts
function evaluateWheel(
  base: Composition,
  tricks: Trick[],
  enabled: Set<string>,
  spin: ScriptedSpin,
  roll: number,
): WheelState {
  const active = tricks
    .filter((trick) => enabled.has(trick.id))
    .map((trick) => ({ ...trick, enabled: true }))
  const { segments: withWedges, morphs } = resolveTricks(base, active, spin.motion.durationMs, roll)
  const landing = landingSegments(withWedges, morphs, spin.motion.durationMs)
  return { withWedges, morphs, landing }
}
```

Change `resolveScriptedSpin`'s first parameter from `segments: Segment[]` to `base: Composition`, and pass `base` and `roll` at both `evaluateWheel` call sites (lines 108 and 129). Add `import type { Composition } from '../compose/types'`. The `Segment` import stays — `Resolution` still uses it.

In `src/App.tsx`, build the base before resolving:

```ts
  const base = useMemo(
    () => composeBase({ statics: preset.segments, feeds: [], items: {}, overrides: {} }),
    [preset.segments],
  )

  const resolved = useMemo(
    () => resolveTricks(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )
```

and pass `base` as the first argument to `resolveScriptedSpin` in `onSpin`, replacing `preset.segments`. Add `import { composeBase } from './compose/compose'`.

In `src/editor/Editor.tsx`, make the same two changes:

```ts
  const base = useMemo(
    () => composeBase({ statics: preset.segments, feeds: [], items: {}, overrides: {} }),
    [preset.segments],
  )

  const resolved = useMemo(
    () => resolveTricks(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )

  const conflicts = useMemo(
    () => findConflicts(base, preset.tricks, preset.spin.motion.durationMs),
    [base, preset.tricks, preset.spin.motion.durationMs],
  )
```

Add `import { composeBase } from '../compose/compose'`.

Feeds stay empty here. Task 10 wires the real items in.

- [ ] **Step 6: Update existing tests to the new signature**

In `src/tricks/resolve.test.ts`, `src/tricks/conflicts.test.ts`, `src/spin/resolve.test.ts`, and `src/tricks/recipes/*.test.ts`, wrap every bare `Segment[]` passed to `resolveTricks`, `findConflicts`, or `resolveScriptedSpin` in `composeBase({ statics: <array>, feeds: [], items: {}, overrides: {} })`. Recipe tests that construct a `RecipeContext` literal need `origins: new Map()` and `roll: 0` added.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, all files.

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
npm run check
git add -A
git commit -m "refactor(tricks): resolve against a Composition, not a bare list"
```

---

### Task 3: Hold the landed wheel against a composition swap

`useSpin` releases a pending segment swap the moment `isSpinning` goes false — which is one render after it sets `displaySegments` to the morphed landing. Today that only fires when the preset changes. Once a live feed exists, any join or leave during a spin makes it certain, and the punchline is wiped as it lands.

**Files:**
- Modify: `src/wheel/useSpin.ts:52-61`
- Test: `src/wheel/useSpin.test.ts`

**This task changes existing behavior, and one existing test asserts the old one.**
`src/wheel/useSpin.test.ts:320` — "applies a segment swap that arrived mid-spin
once the wheel lands" — expects the swap to land the instant the animation
finishes. After this task it lands at the *next spin* instead. That test is
rewritten here, not deleted: the queueing it proves still matters, only the
release point moves.

The consequence is deliberate. The app already holds a result on screen until
the operator spins again (`App` keeps the winner label; the editor keeps `spun`).
Holding the geometry to match means a late joiner appears as the wheel starts
turning rather than popping in while everyone is reading the result.

- [ ] **Step 1: Rewrite the existing test and add its pair**

In `src/wheel/useSpin.test.ts`, replace the test at line 320 with these two.
They use the file's existing `renderSpin` helper and `harness`, so nothing new
is introduced:

```ts
  it('holds a segment swap that arrived mid-spin until the next spin', async () => {
    const swapped: Segment[] = [
      { id: 'zed', label: 'Zed', weight: 1 },
      { id: 'yan', label: 'Yan', weight: 3 },
    ]
    const { result, rerender } = renderSpin(PLAIN)

    act(() => {
      result.current.spin()
    })
    expect(result.current.isSpinning).toBe(true)

    rerender({ segs: swapped })
    // Still mid-spin, so the wheel must not change under the pointer yet.
    expect(result.current.displaySegments).toEqual(SEGMENTS)

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    // Landed, and still holding: releasing here would overwrite plan.landing on
    // the next render, which is the whole payoff when weights morph.
    expect(result.current.isSpinning).toBe(false)
    expect(result.current.landed).toBe(true)
    expect(result.current.displaySegments).toEqual(SEGMENTS)

    act(() => {
      result.current.spin()
    })
    expect(result.current.displaySegments).toEqual(swapped)
  })

  it('keeps the morphed landing when a swap arrives mid-spin', async () => {
    const { result, rerender } = renderSpin(MORPHING)

    act(() => {
      result.current.spin()
    })
    rerender({ segs: [...SEGMENTS] })

    await act(async () => {
      harness.animateCalls[0].finish()
    })

    // The sliver swallowed the wheel. A new-but-equal array must not undo that.
    const beer = result.current.displaySegments.find((segment) => segment.id === 'beer')
    expect(beer?.weight).toBe(1)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL on both — `result.current.landed` is undefined, and the swap has already been applied at landing.

- [ ] **Step 3: Widen the resync gate**

In `src/wheel/useSpin.ts`, add a ref beside the existing ones:

```ts
  // A spin owns the geometry until the next one starts. Releasing at the end of
  // the animation would let a pending swap overwrite plan.landing on the very
  // next render — with a live feed, any join or leave during a spin.
  const landedRef = useRef(false)
```

Replace the resync effect with:

```ts
  useEffect(() => {
    // Resync only when the caller actually swaps the array, and never while a
    // spin owns the geometry — that would wipe the landed state, which is the
    // whole visual payoff when weights morph. The ref is deliberately NOT
    // advanced while held, so this effect re-runs and applies the pending swap
    // once the wheel is released.
    if (lastSegmentsRef.current === segments) return
    if (isSpinning || landed) return
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
  }, [segments, isSpinning, landed])
```

Add the state that drives it, beside `isSpinning`:

```ts
  const [landed, setLanded] = useState(false)
```

In `spin`, immediately after `setIsSpinning(true)`, release the hold:

```ts
      landedRef.current = false
      setLanded(false)
```

In the `animation.finished.then` block, after `setWinnerId(plan.winnerId)`, take it:

```ts
          landedRef.current = true
          setLanded(true)
```

`landedRef` exists so the `.catch` path can read the current value without a stale closure; set it to `false` there too, next to `setIsSpinning(false)`:

```ts
          landedRef.current = false
          setLanded(false)
```

Add `landed` to `UseSpinResult` so the editor can stop tracking `spun` by hand later:

```ts
  /** True from the moment a spin lands until the next one starts. */
  landed: boolean
```

and include it in the returned object.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts
git commit -m "fix(wheel): hold the landing against a segment swap"
```

---

### Task 4: Preset v3 — feeds and overrides

**Files:**
- Modify: `src/preset/types.ts`
- Modify: `src/preset/storage.ts`
- Modify: `src/preset/defaults.ts`
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/preset/storage.test.ts`:

```ts
describe('v3 feeds and overrides', () => {
  it('migrates a v2 preset by adding empty feeds and overrides', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 2, name: 'old', segments: [], tricks: [], branches: [] }),
    )
    expect(preset.version).toBe(3)
    expect(preset.feeds).toEqual([])
    expect(preset.overrides).toEqual({})
  })

  it('reads a simulated feed', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'standup',
        segments: [],
        tricks: [],
        branches: [],
        feeds: [
          {
            kind: 'simulated',
            id: 'sim',
            defaults: { weight: 2, color: '#123456' },
            insertAfter: 'seg1',
            pool: ['Ana', 'Ben', 7],
            autochurn: { intervalMs: 500, targetSize: 3, volatility: 0.8 },
          },
        ],
      }),
    )
    expect(preset.feeds).toEqual([
      {
        kind: 'simulated',
        id: 'sim',
        defaults: { weight: 2, color: '#123456' },
        insertAfter: 'seg1',
        pool: ['Ana', 'Ben'],
        autochurn: { intervalMs: 500, targetSize: 3, volatility: 0.8 },
      },
    ])
  })

  it('defaults a malformed feed rather than dropping the preset', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        feeds: [
          { kind: 'simulated', id: 'sim' },
          { kind: 'simulated', id: 'sim' },
          { kind: 'nonsense', id: 'x' },
          'garbage',
        ],
      }),
    )
    expect(preset.feeds).toHaveLength(1)
    expect(preset.feeds[0].defaults.weight).toBe(1)
    expect(preset.feeds[0].pool).toEqual([])
    expect(preset.feeds[0].autochurn.intervalMs).toBeGreaterThan(0)
  })

  it('keeps usable override fields and drops the rest', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        overrides: {
          ana: { excluded: true, label: 'ANA', weight: -3, color: '#ff0000' },
          ben: { weight: 'lots' },
          cal: 'garbage',
        },
      }),
    )
    expect(preset.overrides.ana).toEqual({
      excluded: true,
      label: 'ANA',
      weight: 0,
      color: '#ff0000',
    })
    expect(preset.overrides).not.toHaveProperty('ben')
    expect(preset.overrides).not.toHaveProperty('cal')
  })

  it('round-trips an override for an item that is not present', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        overrides: { absent: { color: '#00ff00' } },
      }),
    )
    expect(parsePreset(JSON.stringify(preset)).overrides.absent).toEqual({ color: '#00ff00' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — `preset.feeds` is undefined and `version` is 2.

- [ ] **Step 3: Update `Preset`**

In `src/preset/types.ts`, add the import and the two fields:

```ts
import type { FeedConfig, ItemOverride } from '../feed/types'
```

```ts
export type Preset = {
  version: 3
  name: string
  /** Statics. Feed items and trick wedges join these at compose time. */
  segments: Segment[]
  feeds: FeedConfig[]
  /** Keyed by FeedItem.id, not by wedge id: an override outlives its feed. */
  overrides: Record<string, ItemOverride>
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
}
```

- [ ] **Step 4: Add the parsers**

In `src/preset/storage.ts`, add above `parsePreset`:

```ts
function readFeedDefaults(value: unknown): FeedDefaults {
  const raw = isRecord(value) ? value : {}
  const defaults: FeedDefaults = {
    weight:
      typeof raw.weight === 'number' && Number.isFinite(raw.weight) ? Math.max(0, raw.weight) : 1,
  }
  if (typeof raw.color === 'string') defaults.color = raw.color
  return defaults
}

/**
 * A feed id has to be unique: composeBase namespaces wedge ids by it, so two
 * feeds sharing one would collide item for item and silently lose a roster.
 */
function readFeeds(value: unknown): FeedConfig[] {
  if (!Array.isArray(value)) return []
  const feeds: FeedConfig[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (entry.kind !== 'simulated' || typeof entry.id !== 'string') continue
    if (feeds.some((feed) => feed.id === entry.id)) continue

    const autochurn = isRecord(entry.autochurn) ? entry.autochurn : {}
    const feed: FeedConfig = {
      kind: 'simulated',
      id: entry.id,
      defaults: readFeedDefaults(entry.defaults),
      pool: Array.isArray(entry.pool)
        ? entry.pool.filter((name): name is string => typeof name === 'string')
        : [],
      autochurn: {
        intervalMs: readPositive(autochurn.intervalMs, 2000),
        targetSize: readTurns(autochurn.targetSize, 6),
        volatility: readUnitValue(autochurn.volatility, 0.3),
      },
    }
    if (typeof entry.insertAfter === 'string') feed.insertAfter = entry.insertAfter
    feeds.push(feed)
  }
  return feeds
}

/** Clamped to 0..1. A volatility outside that range is not a slower simulation, it is a broken one. */
function readUnitValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

/**
 * `media` and `reveal` are deliberately not read, matching readSegments: the
 * wheel renders neither yet, so parsing them would be dead code that has to be
 * kept correct. They stay on ItemOverride so the shape is ready when it ships.
 */
function readOverrides(value: unknown): Record<string, ItemOverride> {
  if (!isRecord(value)) return {}
  const overrides: Record<string, ItemOverride> = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue
    const override: ItemOverride = {}
    if (raw.excluded === true) override.excluded = true
    if (typeof raw.label === 'string') override.label = raw.label
    if (typeof raw.weight === 'number' && Number.isFinite(raw.weight)) {
      override.weight = Math.max(0, raw.weight)
    }
    if (typeof raw.color === 'string') override.color = raw.color
    // An override with nothing usable left is indistinguishable from no
    // override, and keeping it would show an empty row in the editor forever.
    if (Object.keys(override).length > 0) overrides[id] = override
  }
  return overrides
}
```

Add `import type { FeedConfig, FeedDefaults, ItemOverride } from '../feed/types'` at the top.

Then in `parsePreset`, widen the version gate and return the new fields:

```ts
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) return DEFAULT_PRESET
```

```ts
  return {
    version: 3,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    feeds: readFeeds(data.feeds),
    overrides: readOverrides(data.overrides),
    tricks: readTricks(data.tricks, segments),
    spin,
    branches: readBranches(data.branches),
  }
```

v1 and v2 have neither field, so `readFeeds(undefined)` and `readOverrides(undefined)` return the empty values and the migration needs no special case.

- [ ] **Step 5: Update the default preset**

In `src/preset/defaults.ts`, change `version: 2` to `version: 3` and add, after `segments`:

```ts
  feeds: [
    {
      kind: 'simulated',
      id: 'sim',
      defaults: { weight: 1 },
      pool: ['Ana', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus'],
      autochurn: { intervalMs: 2500, targetSize: 5, volatility: 0.25 },
    },
  ],
  overrides: {},
```

The five hardcoded name segments stay: they are statics, and having both on the wheel is the whole point of the feature.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS.

Run: `npm test` and `npm run build`
Expected: PASS, no type errors. Any test asserting `version: 2` needs updating to `3`.

- [ ] **Step 7: Commit**

```bash
npm run check
git add -A
git commit -m "feat(preset): store feeds and item overrides at v3"
```

---

### Task 5: `@` selectors

Three recipes each carry a private `resolveTargets` with identical bodies. Replace all three with one shared implementation that understands selector tokens.

**Files:**
- Create: `src/tricks/targets.ts`
- Create: `src/tricks/targets.test.ts`
- Modify: `src/tricks/recipes/recolor.ts:14-18,64-69`
- Modify: `src/tricks/recipes/vanish.ts:6-10,57-62`
- Modify: `src/tricks/recipes/relabel.ts:5-9,48-53`

- [ ] **Step 1: Write the failing test**

Create `src/tricks/targets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Origin } from '../compose/types'
import type { Segment } from '../wheel/types'
import { isSelectorToken, resolveTargets } from './targets'

const segments: Segment[] = [
  { id: 'seg1', label: 'Spin again', weight: 1 },
  { id: 'sim:ana', label: 'Ana', weight: 1 },
  { id: 'sim:ben', label: 'Ben', weight: 0 },
  { id: 'beer:wedge', label: 'Free beer', weight: 0 },
]

const origins = new Map<string, Origin>([
  ['seg1', { kind: 'static' }],
  ['sim:ana', { kind: 'external', feedId: 'sim', itemId: 'ana' }],
  ['sim:ben', { kind: 'external', feedId: 'sim', itemId: 'ben' }],
  ['beer:wedge', { kind: 'computed', trickId: 'beer' }],
])

const ctx = { segments, origins, roll: 0 }
const ids = (result: Segment[]) => result.map((segment) => segment.id)

describe('resolveTargets', () => {
  it('treats an empty list as every wedge, as the recipes always have', () => {
    expect(ids(resolveTargets([], ctx))).toEqual(['seg1', 'sim:ana', 'sim:ben', 'beer:wedge'])
  })

  it('resolves concrete ids', () => {
    expect(ids(resolveTargets(['sim:ana'], ctx))).toEqual(['sim:ana'])
  })

  it('ignores an id that is not on the wheel', () => {
    expect(ids(resolveTargets(['gone'], ctx))).toEqual([])
  })

  it('expands each origin token', () => {
    expect(ids(resolveTargets(['@static'], ctx))).toEqual(['seg1'])
    expect(ids(resolveTargets(['@external'], ctx))).toEqual(['sim:ana', 'sim:ben'])
    expect(ids(resolveTargets(['@computed'], ctx))).toEqual(['beer:wedge'])
  })

  it('makes @all the union of the other three', () => {
    expect(ids(resolveTargets(['@all'], ctx))).toEqual(
      ids(resolveTargets(['@static', '@external', '@computed'], ctx)),
    )
  })

  it('selects zero-weight wedges, which is what lets a trick grow one', () => {
    expect(ids(resolveTargets(['@external'], ctx))).toContain('sim:ben')
  })

  it('composes a token with a concrete id, in wheel order and deduped', () => {
    expect(ids(resolveTargets(['@external', 'seg1', 'sim:ana'], ctx))).toEqual([
      'seg1',
      'sim:ana',
      'sim:ben',
    ])
  })

  it('picks a stable external wedge from the roll', () => {
    expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll: 0 }))).toEqual(['sim:ana'])
    expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll: 0.9 }))).toEqual(['sim:ben'])
    // The same roll must give the same answer however many times it is asked,
    // because evaluateWheel re-resolves once per branch depth.
    expect(ids(resolveTargets(['@randomExternal'], { ...ctx, roll: 0.9 }))).toEqual(['sim:ben'])
  })

  it('resolves @randomExternal to nothing when no feed has published', () => {
    expect(resolveTargets(['@randomExternal'], { segments: [], origins: new Map(), roll: 0 })).toEqual([])
  })

  it('recognizes exactly the five tokens', () => {
    expect(isSelectorToken('@external')).toBe(true)
    expect(isSelectorToken('@nonsense')).toBe(false)
    expect(isSelectorToken('seg1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/tricks/targets.test.ts`
Expected: FAIL — `Failed to resolve import "./targets"`.

- [ ] **Step 3: Implement the shared resolver**

Create `src/tricks/targets.ts`:

```ts
import type { Origin } from '../compose/types'
import type { Segment } from '../wheel/types'

/**
 * Selectors ride as reserved ids inside the string arrays tricks and branches
 * already store, so nothing migrates. Id generation never emits '@', so a real
 * wedge cannot collide with one.
 */
export const SELECTOR_TOKENS = [
  '@all',
  '@static',
  '@external',
  '@computed',
  '@randomExternal',
] as const

export type SelectorToken = (typeof SELECTOR_TOKENS)[number]

export function isSelectorToken(id: string): id is SelectorToken {
  return (SELECTOR_TOKENS as readonly string[]).includes(id)
}

export type TargetContext = {
  segments: Segment[]
  origins: Map<string, Origin>
  /** The resolution's frozen roll. See resolveScriptedSpin. */
  roll: number
}

function byOrigin(ctx: TargetContext, kind: Origin['kind']): Segment[] {
  // A wedge with no recorded origin is treated as static: that is what an
  // unrecorded wedge was before feeds existed, and guessing 'external' would
  // put it in the path of tricks aimed at the roster.
  return ctx.segments.filter((segment) => (ctx.origins.get(segment.id)?.kind ?? 'static') === kind)
}

/**
 * Expands selector tokens and concrete ids into wedges. Empty means every
 * wedge, which is the convention the recipes used before selectors existed.
 *
 * Weight is irrelevant here: a wedge sitting at zero is still on the wheel and
 * still selectable, which is exactly what lets a trick grow one.
 */
export function resolveTargets(ids: string[], ctx: TargetContext): Segment[] {
  if (ids.length === 0) return ctx.segments

  const picked = new Set<string>()
  const add = (segments: Segment[]) => {
    for (const segment of segments) picked.add(segment.id)
  }

  for (const id of ids) {
    switch (id) {
      case '@all':
        add(ctx.segments)
        break
      case '@static':
        add(byOrigin(ctx, 'static'))
        break
      case '@external':
        add(byOrigin(ctx, 'external'))
        break
      case '@computed':
        add(byOrigin(ctx, 'computed'))
        break
      case '@randomExternal': {
        const candidates = byOrigin(ctx, 'external')
        if (candidates.length === 0) break
        // Math.min guards a roll of exactly 1, which Rng promises never to
        // return but a hand-supplied one might.
        const index = Math.min(candidates.length - 1, Math.floor(ctx.roll * candidates.length))
        picked.add(candidates[index].id)
        break
      }
      default: {
        if (ctx.segments.some((segment) => segment.id === id)) picked.add(id)
      }
    }
  }

  // Wheel order, not selection order: morphs read better when they follow the
  // order the wedges actually appear in.
  return ctx.segments.filter((segment) => picked.has(segment.id))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/tricks/targets.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Adopt it in all three recipes**

In `src/tricks/recipes/recolor.ts`, delete the private `resolveTargets` function and import the shared one:

```ts
import { isSelectorToken, resolveTargets } from '../targets'
```

Change both call sites from `resolveTargets(params, ctx.segments)` to:

```ts
resolveTargets(readStringArray(params, 'targets'), ctx)
```

and change `validate` so tokens are not reported as unknown wedges:

```ts
  validate(params: TrickParams, segments: Segment[]): string | null {
    // A token resolving to nothing is the normal state while authoring with no
    // meeting running. Reporting it would badge every preset as broken.
    const missing = readStringArray(params, 'targets').filter(
      (id) => !isSelectorToken(id) && !segments.some((segment) => segment.id === id),
    )
    if (missing.length > 0) return `unknown wedge: ${missing.join(', ')}`

    // lerpColor only understands hex. A named CSS color parses as nothing, so
    // it holds the start color for the whole spin and then cuts to the target
    // on the final frame — a fade that never fades. Better to refuse it.
    const toColor = readString(params, 'toColor', '#888888')
    return parseHex(toColor) ? null : `not a hex color: ${toColor}`
  },
```

Make the identical three changes in `src/tricks/recipes/vanish.ts` and `src/tricks/recipes/relabel.ts` (their `validate` bodies are the two-line `missing` check followed by `return missing.length === 0 ? null : ...` — add the `!isSelectorToken(id) &&` guard to the filter).

- [ ] **Step 6: Add the tokens to the editor's multi-select**

In `src/editor/RecipeForm.tsx`, in the `case 'segments':` branch, render the tokens above the wedges:

```tsx
              {SELECTOR_TOKENS.map((token) => (
                <option key={token} value={token}>
                  {SELECTOR_LABELS[token]}
                </option>
              ))}
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.label}
                </option>
              ))}
```

and add at the top of the file:

```ts
import { SELECTOR_TOKENS, type SelectorToken } from '../tricks/targets'

/** Operator-facing wording. The tokens themselves are internal. */
const SELECTOR_LABELS: Record<SelectorToken, string> = {
  '@all': 'Everything on the wheel',
  '@static': 'All authored wedges',
  '@external': 'Everyone in the meeting',
  '@computed': 'All trick wedges',
  '@randomExternal': 'One random attendee',
}
```

- [ ] **Step 7: Run the full suite**

Run: `npm test` then `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
npm run check
git add -A
git commit -m "feat(tricks): aim at wedges by origin, not just by id"
```

---

### Task 6: The feed bus

**Files:**
- Create: `src/feed/bus.ts`
- Create: `src/feed/bus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/feed/bus.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { publishFeed, subscribeFeed } from './bus'

/** BroadcastChannel delivers on a later turn of the event loop. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('feed bus', () => {
  it('delivers a published roster to a subscriber', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })
    await flush()

    expect(seen).toHaveBeenCalledWith({ feedId: 'sim', items: [{ id: 'ana', label: 'Ana' }] })
    stop()
  })

  it('stops delivering after unsubscribe', async () => {
    const seen = vi.fn()
    subscribeFeed(seen)()

    publishFeed({ feedId: 'sim', items: [] })
    await flush()

    expect(seen).not.toHaveBeenCalled()
  })

  it('drops a malformed message rather than passing it on', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)

    publishFeed({ feedId: 'sim', items: [{ id: 'ok', label: 'OK' }] })
    // Shapes a hand-crafted or future-version sender could produce.
    publishFeed({ feedId: 7, items: [] } as never)
    publishFeed({ feedId: 'sim', items: [{ id: 'x' }] } as never)
    await flush()

    expect(seen).toHaveBeenCalledTimes(1)
    stop()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/feed/bus.test.ts`
Expected: FAIL — `Failed to resolve import "./bus"`.

- [ ] **Step 3: Implement the bus**

Create `src/feed/bus.ts`:

```ts
import type { FeedItem } from './types'

export const FEED_CHANNEL = 'wod:feed'

export type FeedMessage = { feedId: string; items: FeedItem[] }

/**
 * Feed items ride a channel rather than localStorage on purpose. The parent
 * spec's whole pitch is that attendee names are read by the browser and stay
 * there; writing them to a well-known storage key weakens that for no gain.
 */
let publisher: BroadcastChannel | null = null

function channel(): BroadcastChannel | null {
  if (publisher) return publisher
  try {
    publisher = new BroadcastChannel(FEED_CHANNEL)
  } catch {
    // No BroadcastChannel. The show window simply never learns the roster,
    // which degrades to statics only rather than breaking anything.
    return null
  }
  return publisher
}

function readMessage(value: unknown): FeedMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.feedId !== 'string' || !Array.isArray(raw.items)) return null

  const items: FeedItem[] = []
  for (const entry of raw.items) {
    if (typeof entry !== 'object' || entry === null) return null
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.label !== 'string') return null
    items.push({ id: item.id, label: item.label })
  }
  return { feedId: raw.feedId, items }
}

export function publishFeed(message: FeedMessage): void {
  channel()?.postMessage(message)
}

export function subscribeFeed(onMessage: (message: FeedMessage) => void): () => void {
  let listener: BroadcastChannel
  try {
    listener = new BroadcastChannel(FEED_CHANNEL)
  } catch {
    return () => {}
  }
  const handler = (event: MessageEvent) => {
    const message = readMessage(event.data)
    if (message) onMessage(message)
  }
  listener.addEventListener('message', handler)
  return () => {
    listener.removeEventListener('message', handler)
    listener.close()
  }
}
```

A malformed `items` entry rejects the whole message rather than being skipped: a partial roster silently missing a person is worse on screen than no update at all.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/feed/bus.test.ts`
Expected: PASS, 3 tests.

If `BroadcastChannel` is not defined under jsdom, add `globalThis.BroadcastChannel ??= (await import('node:worker_threads')).BroadcastChannel as never` to `src/vitest.setup.ts` — Node 22 provides it globally, so this should not be needed.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/feed/bus.ts src/feed/bus.test.ts
git commit -m "feat(feed): carry rosters on a channel, never in storage"
```

---

### Task 7: Simulated meeting churn

Pure functions only. The ticker and the UI come next.

**Files:**
- Create: `src/feed/simulated.ts`
- Create: `src/feed/simulated.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/feed/simulated.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Rng } from '../wheel/selection'
import type { SimulatedFeedConfig } from './types'
import { churn, itemsFor } from './simulated'

const config: SimulatedFeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: ['Ana', 'Ben', 'Cal', 'Dee'],
  autochurn: { intervalMs: 1000, targetSize: 2, volatility: 0.5 },
}

/** Replays a fixed sequence, then repeats the last value. */
function rolls(...values: number[]): Rng {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('churn', () => {
  it('adds one person when below target', () => {
    expect(churn(config, [], rolls(0))).toEqual(['Ana'])
  })

  it('removes one person when above target', () => {
    expect(churn(config, ['Ana', 'Ben', 'Cal'], rolls(0))).toEqual(['Ben', 'Cal'])
  })

  it('converges on the target size', () => {
    const rng = rolls(0.1, 0.9, 0.4, 0.7)
    let present: string[] = []
    for (let i = 0; i < 10; i++) present = churn(config, present, rng)
    expect(present).toHaveLength(2)
  })

  it('saturates at the pool when the target exceeds it', () => {
    const small: SimulatedFeedConfig = {
      ...config,
      pool: ['Ana'],
      autochurn: { ...config.autochurn, targetSize: 5 },
    }
    let present: string[] = []
    for (let i = 0; i < 5; i++) present = churn(small, present, rolls(0))
    expect(present).toEqual(['Ana'])
  })

  it('holds steady at target when the volatility roll does not clear', () => {
    expect(churn(config, ['Ana', 'Ben'], rolls(0.99))).toEqual(['Ana', 'Ben'])
  })

  it('swaps one person for another when it does clear', () => {
    const next = churn(config, ['Ana', 'Ben'], rolls(0.1, 0, 0))
    expect(next).toHaveLength(2)
    expect(next).not.toEqual(['Ana', 'Ben'])
  })

  it('drops anyone no longer in the pool', () => {
    expect(churn(config, ['Ana', 'Zed'], rolls(0.99))).toEqual(['Ana'])
  })
})

describe('itemsFor', () => {
  it('derives a stable id from the name, so overrides survive a rejoin', () => {
    expect(itemsFor(['Ana Lovelace'])).toEqual([{ id: 'ana-lovelace', label: 'Ana Lovelace' }])
    expect(itemsFor(['Ana Lovelace'])[0].id).toBe(itemsFor(['Ana Lovelace'])[0].id)
  })

  it('disambiguates two names that slugify the same', () => {
    expect(itemsFor(['Ana!', 'Ana?']).map((item) => item.id)).toEqual(['ana', 'ana-2'])
  })

  it('never emits an empty id', () => {
    expect(itemsFor(['!!!'])[0].id).toBe('item')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/feed/simulated.test.ts`
Expected: FAIL — `Failed to resolve import "./simulated"`.

- [ ] **Step 3: Implement churn and item derivation**

Create `src/feed/simulated.ts`:

```ts
import type { Rng } from '../wheel/selection'
import type { FeedItem, SimulatedFeedConfig } from './types'

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

/**
 * One tick of the simulated meeting. At most one person moves per tick, so the
 * roster reads as people arriving and leaving rather than as a list being
 * regenerated — which is what makes it useful for finding the races a real
 * meeting would produce.
 */
export function churn(
  config: SimulatedFeedConfig,
  present: string[],
  rng: Rng,
): string[] {
  // Editing the pool must not leave ghosts in the room.
  const current = present.filter((name) => config.pool.includes(name))
  const absent = config.pool.filter((name) => !current.includes(name))
  const target = Math.min(Math.max(0, config.autochurn.targetSize), config.pool.length)

  if (current.length < target && absent.length > 0) return [...current, pick(absent, rng)]
  if (current.length > target) {
    const leaving = pick(current, rng)
    return current.filter((name) => name !== leaving)
  }

  // At size. Volatility decides how often anyone moves at all.
  if (rng() >= config.autochurn.volatility) return current
  if (current.length === 0 || absent.length === 0) return current
  const leaving = pick(current, rng)
  const joining = pick(absent, rng)
  return [...current.filter((name) => name !== leaving), joining]
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // An id is the override key, so it can never be empty — two unnameable
  // people would otherwise share one override.
  return slug === '' ? 'item' : slug
}

/**
 * Ids derive from the name rather than from a counter, so leaving and rejoining
 * returns the same id and whatever override was saved against it.
 */
export function itemsFor(present: string[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const name of present) {
    const base = slugify(name)
    let id = base
    let n = 2
    while (items.some((item) => item.id === id)) {
      id = `${base}-${n}`
      n += 1
    }
    items.push({ id, label: name })
  }
  return items
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/feed/simulated.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/feed/simulated.ts src/feed/simulated.test.ts
git commit -m "feat(feed): simulate a meeting filling and emptying"
```

---

### Task 8: The feed panel

The editor window owns the simulation clock and publishes to the bus.

**Files:**
- Create: `src/editor/FeedPanel.tsx`
- Create: `src/editor/FeedPanel.test.tsx`
- Modify: `src/editor/Editor.tsx`
- Modify: `src/editor/Editor.css`

- [ ] **Step 1: Write the failing test**

Create `src/editor/FeedPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SimulatedFeedConfig } from '../feed/types'
import { FeedPanel } from './FeedPanel'

const config: SimulatedFeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: ['Ana', 'Ben'],
  autochurn: { intervalMs: 1000, targetSize: 2, volatility: 0.3 },
}

describe('FeedPanel', () => {
  it('joins a name from the pool by hand', async () => {
    const onPresent = vi.fn()
    render(<FeedPanel config={config} present={[]} onPresent={onPresent} onChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Join Ana' }))

    expect(onPresent).toHaveBeenCalledWith(['Ana'])
  })

  it('removes someone already in the room', async () => {
    const onPresent = vi.fn()
    render(
      <FeedPanel config={config} present={['Ana', 'Ben']} onPresent={onPresent} onChange={vi.fn()} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ana' }))

    expect(onPresent).toHaveBeenCalledWith(['Ben'])
  })

  it('edits the pool', async () => {
    const onChange = vi.fn()
    render(<FeedPanel config={config} present={[]} onPresent={vi.fn()} onChange={onChange} />)

    const pool = screen.getByLabelText('Name pool')
    await userEvent.clear(pool)
    await userEvent.type(pool, 'Cal{enter}Dee')

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pool: ['Cal', 'Dee'] }))
  })

  it('churns on a tick while running', async () => {
    vi.useFakeTimers()
    const onPresent = vi.fn()
    render(<FeedPanel config={config} present={[]} onPresent={onPresent} onChange={vi.fn()} />)

    // The run toggle is uncontrolled: the panel owns whether the clock ticks.
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole('checkbox', { name: 'Run' }),
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(onPresent).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/FeedPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./FeedPanel"`.

- [ ] **Step 3: Implement the panel**

Create `src/editor/FeedPanel.tsx`:

```tsx
import { PropertyPanel, PropertyRow } from '@weasel-js/labkit'
import { useEffect, useRef, useState } from 'react'
import { churn } from '../feed/simulated'
import type { SimulatedFeedConfig } from '../feed/types'
import { cryptoRng } from '../wheel/selection'

export type FeedPanelProps = {
  config: SimulatedFeedConfig
  present: string[]
  onPresent: (present: string[]) => void
  onChange: (config: SimulatedFeedConfig) => void
}

export function FeedPanel({ config, present, onPresent, onChange }: FeedPanelProps) {
  const [running, setRunning] = useState(false)

  // The tick reads the latest props without restarting the interval, which
  // would otherwise reset the clock on every roster change it causes.
  const latest = useRef({ config, present, onPresent })
  latest.current = { config, present, onPresent }

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const { config: current, present: room, onPresent: publish } = latest.current
      publish(churn(current, room, cryptoRng))
    }, config.autochurn.intervalMs)
    return () => window.clearInterval(id)
  }, [running, config.autochurn.intervalMs])

  const absent = config.pool.filter((name) => !present.includes(name))

  return (
    <PropertyPanel title="Simulated meeting">
      <PropertyRow label="Name pool">
        <textarea
          aria-label="Name pool"
          value={config.pool.join('\n')}
          onChange={(event) =>
            onChange({
              ...config,
              pool: event.target.value
                .split('\n')
                .map((name) => name.trim())
                .filter((name) => name !== ''),
            })
          }
        />
      </PropertyRow>

      <PropertyRow label="Run">
        <input
          type="checkbox"
          aria-label="Run"
          checked={running}
          onChange={(event) => setRunning(event.target.checked)}
        />
      </PropertyRow>

      <PropertyRow label="Target size">
        <input
          type="number"
          min={0}
          aria-label="Target size"
          value={config.autochurn.targetSize}
          onChange={(event) => {
            const size = Number.parseInt(event.target.value, 10)
            onChange({
              ...config,
              autochurn: {
                ...config.autochurn,
                targetSize: Number.isFinite(size) ? Math.max(0, size) : 0,
              },
            })
          }}
        />
      </PropertyRow>

      <ul className="feed-panel__roster">
        {present.map((name) => (
          <li key={name}>
            <span>{name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => onPresent(present.filter((other) => other !== name))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <ul className="feed-panel__pool">
        {absent.map((name) => (
          <li key={name}>
            <button type="button" aria-label={`Join ${name}`} onClick={() => onPresent([...present, name])}>
              + {name}
            </button>
          </li>
        ))}
      </ul>
    </PropertyPanel>
  )
}
```

`PropertyPanel` and `PropertyRow` both come from `@weasel-js/labkit` directly, as in `RecipeForm.tsx`.

- [ ] **Step 4: Add the styles**

Append to `src/editor/Editor.css`:

```css
.feed-panel__roster,
.feed-panel__pool {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.feed-panel__roster li {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
```

- [ ] **Step 5: Wire it into the editor**

In `src/editor/Editor.tsx`, hold the room and publish every change:

```ts
  const [present, setPresent] = useState<string[]>([])

  const feed = preset.feeds[0]

  // Items are derived, never stored: the preset keeps how to get a roster, not
  // who is in it.
  const items = useMemo(() => (feed ? { [feed.id]: itemsFor(present) } : {}), [feed, present])

  // The editor window owns the clock, so it is the window that publishes.
  useEffect(() => {
    if (!feed) return
    publishFeed({ feedId: feed.id, items: itemsOf(items, feed.id) })
  }, [feed, items])
```

`itemsOf` is a local helper, because a bare `items[feed.id]` is unsafe here for
the same reason it is in `composeBase` — a feed id of `constructor` or
`__proto__` resolves through the prototype chain to something that is not an
array. Put it at module scope in this file:

```ts
function itemsOf(items: Record<string, FeedItem[]>, feedId: string): FeedItem[] {
  const published = items[feedId]
  return Array.isArray(published) ? published : []
}
```

Pass `items` into `composeBase`:

```ts
  const base = useMemo(
    () =>
      composeBase({
        statics: preset.segments,
        feeds: preset.feeds,
        items,
        overrides: preset.overrides,
      }),
    [preset.segments, preset.feeds, preset.overrides, items],
  )
```

Render the panel in the left column, under `SegmentList`:

```tsx
          {feed ? (
            <FeedPanel
              config={feed}
              present={present}
              onPresent={setPresent}
              onChange={(next) =>
                update({ ...preset, feeds: preset.feeds.map((f) => (f.id === next.id ? next : f)) })
              }
            />
          ) : null}
```

Add the imports:

```ts
import { publishFeed } from '../feed/bus'
import { itemsFor } from '../feed/simulated'
import { FeedPanel } from './FeedPanel'
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/editor` then `npm test` and `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
npm run check
git add -A
git commit -m "feat(editor): drive a simulated meeting from the editor window"
```

---

### Task 9: The show window follows the roster

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/App.test.tsx`:

```tsx
describe('feed', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('puts published attendees on the wheel', async () => {
    render(<App />)

    publishFeed({ feedId: 'sim', items: [{ id: 'zoe', label: 'Zoe' }] })
    await flush()

    await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())
  })

  it('drops someone who leaves', async () => {
    render(<App />)

    publishFeed({ feedId: 'sim', items: [{ id: 'zoe', label: 'Zoe' }] })
    await flush()
    await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())

    publishFeed({ feedId: 'sim', items: [] })
    await flush()
    await waitFor(() => expect(screen.queryByText('Zoe')).not.toBeInTheDocument())
  })
})
```

The file currently imports `{ act, render, screen }` from `@testing-library/react`. Add `waitFor` to that import, and add:

```ts
import { publishFeed } from './feed/bus'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — "Zoe" never appears; `App` ignores the bus.

- [ ] **Step 3: Subscribe and compose**

In `src/App.tsx`, add the items state and the subscription:

```ts
  const [items, setItems] = useState<Record<string, FeedItem[]>>({})

  // The editor window owns the clock; this one only renders what arrives. With
  // no editor open the roster freezes, which is a comprehensible failure.
  useEffect(
    () =>
      subscribeFeed(({ feedId, items: published }) =>
        setItems((current) => ({ ...current, [feedId]: published })),
      ),
    [],
  )
```

and replace the `composeBase` call added in Task 2 with the real one:

```ts
  const base = useMemo(
    () =>
      composeBase({
        statics: preset.segments,
        feeds: preset.feeds,
        items,
        overrides: preset.overrides,
      }),
    [preset.segments, preset.feeds, preset.overrides, items],
  )
```

Add the imports:

```ts
import { subscribeFeed } from './feed/bus'
import type { FeedItem } from './feed/types'
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/App.test.tsx` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): follow the live roster between spins"
```

---

### Task 10: The overrides panel

**Files:**
- Create: `src/editor/OverridesPanel.tsx`
- Create: `src/editor/OverridesPanel.test.tsx`
- Modify: `src/editor/Editor.tsx`
- Modify: `src/editor/Editor.css`

- [ ] **Step 1: Write the failing test**

Create `src/editor/OverridesPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ItemOverride } from '../feed/types'
import { OverridesPanel } from './OverridesPanel'

const items = [
  { id: 'ana', label: 'Ana' },
  { id: 'ben', label: 'Ben' },
]

const overrides: Record<string, ItemOverride> = {
  cal: { color: '#00ff00' },
}

describe('OverridesPanel', () => {
  it('lists present items and known absentees separately', () => {
    render(<OverridesPanel items={items} overrides={overrides} onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Present' })).toHaveTextContent('Ana')
    expect(screen.getByRole('group', { name: 'Known' })).toHaveTextContent('cal')
  })

  it('excludes someone', async () => {
    const onChange = vi.fn()
    render(<OverridesPanel items={items} overrides={{}} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Exclude Ana' }))

    expect(onChange).toHaveBeenCalledWith({ ana: { excluded: true } })
  })

  it('keeps an override for someone who is not present', async () => {
    const onChange = vi.fn()
    render(<OverridesPanel items={items} overrides={overrides} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Exclude cal' }))

    expect(onChange).toHaveBeenCalledWith({ cal: { color: '#00ff00', excluded: true } })
  })

  it('deletes an override outright', async () => {
    const onChange = vi.fn()
    render(<OverridesPanel items={items} overrides={overrides} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Forget cal' }))

    expect(onChange).toHaveBeenCalledWith({})
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/OverridesPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./OverridesPanel"`.

- [ ] **Step 3: Implement the panel**

Create `src/editor/OverridesPanel.tsx`:

```tsx
import { PropertyPanel } from '@weasel-js/labkit'
import type { FeedItem, ItemOverride } from '../feed/types'

export type OverridesPanelProps = {
  items: FeedItem[]
  overrides: Record<string, ItemOverride>
  onChange: (overrides: Record<string, ItemOverride>) => void
}

function Row({
  id,
  label,
  override,
  onPatch,
  onForget,
}: {
  id: string
  label: string
  override: ItemOverride
  onPatch: (patch: ItemOverride) => void
  onForget: () => void
}) {
  return (
    <li className="overrides__row">
      <span className="overrides__label">{label}</span>
      <input
        type="checkbox"
        aria-label={`Exclude ${label}`}
        checked={override.excluded === true}
        onChange={(event) => onPatch({ excluded: event.target.checked })}
      />
      <input
        type="number"
        min={0}
        step={0.5}
        aria-label={`Weight of ${label}`}
        value={override.weight ?? ''}
        placeholder="default"
        onChange={(event) => {
          const weight = Number.parseFloat(event.target.value)
          onPatch({ weight: Number.isFinite(weight) ? Math.max(0, weight) : undefined })
        }}
      />
      <input
        type="color"
        aria-label={`Color of ${label}`}
        value={override.color ?? '#888888'}
        onChange={(event) => onPatch({ color: event.target.value })}
      />
      <button type="button" aria-label={`Forget ${id}`} onClick={onForget}>
        ×
      </button>
    </li>
  )
}

export function OverridesPanel({ items, overrides, onChange }: OverridesPanelProps) {
  // Everything with a saved override that is not in the room. This is what makes
  // a joke editable at 11pm with no meeting running.
  const known = Object.keys(overrides).filter((id) => !items.some((item) => item.id === id))

  const forget = (id: string) => {
    const next = { ...overrides }
    delete next[id]
    onChange(next)
  }

  const patch = (id: string, next: ItemOverride) => {
    const merged: ItemOverride = { ...overrides[id], ...next }
    // An undefined field means "use the feed default", so it is removed rather
    // than stored — otherwise clearing a weight would pin it at undefined.
    for (const key of Object.keys(merged) as (keyof ItemOverride)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    // An override with nothing left in it is the same as no override, and
    // keeping it would leave a dead row in the Known list forever.
    if (Object.keys(merged).length === 0) {
      forget(id)
      return
    }
    onChange({ ...overrides, [id]: merged })
  }

  return (
    <PropertyPanel title="Attendees">
      <fieldset aria-label="Present">
        <legend>Present</legend>
        <ul className="overrides__list">
          {items.map((item) => (
            <Row
              key={item.id}
              id={item.id}
              label={item.label}
              override={overrides[item.id] ?? {}}
              onPatch={(next) => patch(item.id, next)}
              onForget={() => forget(item.id)}
            />
          ))}
        </ul>
      </fieldset>

      <fieldset aria-label="Known">
        <legend>Known</legend>
        <ul className="overrides__list">
          {known.map((id) => (
            <Row
              key={id}
              id={id}
              label={id}
              override={overrides[id]}
              onPatch={(next) => patch(id, next)}
              onForget={() => forget(id)}
            />
          ))}
        </ul>
      </fieldset>
    </PropertyPanel>
  )
}
```

Absentees are labelled by id because that is the only thing still known about them — the label came from the feed and left with them.

- [ ] **Step 4: Add the styles**

Append to `src/editor/Editor.css`:

```css
.overrides__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.overrides__row {
  display: grid;
  grid-template-columns: 1fr auto 4rem 2rem 1.5rem;
  align-items: center;
  gap: 0.25rem;
}

.overrides__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 5: Wire it in**

In `src/editor/Editor.tsx`, render it in the right column under `TrickLibrary`:

```tsx
          <OverridesPanel
            items={feed ? itemsOf(items, feed.id) : []}
            overrides={preset.overrides}
            onChange={(overrides) => update({ ...preset, overrides })}
          />
```

Add `import { OverridesPanel } from './OverridesPanel'`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/editor` then `npm test` and `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
npm run check
git add -A
git commit -m "feat(editor): override attendees, present or not"
```

---

### Task 11: End-to-end churn during a spin

The one test that proves the whole thing holds together.

**Files:**
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write the test**

Append to `src/App.test.tsx`:

```tsx
describe('churn during a spin', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('queues a roster change until the wheel is at rest', async () => {
    render(<App />)

    publishFeed({ feedId: 'sim', items: [{ id: 'zoe', label: 'Zoe' }] })
    await flush()
    await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Spin' }))

    // Someone leaves mid-flight. The wheel must not reindex under the animation.
    publishFeed({ feedId: 'sim', items: [] })
    await flush()
    expect(screen.getByText('Zoe')).toBeInTheDocument()

    // The queued change lands once the wheel is released.
    await userEvent.click(screen.getByRole('button', { name: 'Spin' }))
    await waitFor(() => expect(screen.queryByText('Zoe')).not.toBeInTheDocument())
  })
})
```

The default preset's spin runs 4500ms, which would make this test crawl. Seed a short one first, matching how the existing tests in this file already seed:

```tsx
    const quick = {
      ...DEFAULT_PRESET,
      spin: { ...DEFAULT_PRESET.spin, motion: { ...DEFAULT_PRESET.spin.motion, durationMs: 20 } },
    }
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(quick))
```

Place it before `render(<App />)`. `DEFAULT_PRESET` and `PRESET_KEY` are already imported in this file. Add `import userEvent from '@testing-library/user-event'`.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS. If the mid-spin assertion fails, Task 3's gate is not holding; if the final assertion fails, the pending swap is being dropped rather than queued.

- [ ] **Step 3: Run everything**

Run: `npm test` then `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
npm run check
git add src/App.test.tsx
git commit -m "test(app): pin roster churn against an in-flight spin"
```

---

## Not in this plan

Carried from the spec's "Noted, not scoped", so nobody builds them by accident:

- **The Meet adapter.** OAuth PKCE, polling, the liveness probe. `FeedConfig` is a union of one specifically so this can be added as a second member.
- **The flip trick.** The winning wedge flips in place to show a different item on its back. It is a `provides()` recipe plus a reveal-time transform, and it is the one place a `@winner` selector would be coherent.
- **Reveals and media on overrides.** The fields exist on `ItemOverride` but are deliberately not parsed by `readOverrides`, matching `readSegments`, until the wheel renders them.
- **Round state.** Draw removal, pick-N, full ordering, repeat-avoidance.
- **A huge weight overflows the normalizer to `NaN`.** Found reviewing Task 4.
  `readSegments` and `readFeedDefaults` both reject `Infinity` and `NaN` but
  accept `1e308`; three such weights sum to `Infinity`, and `arcs()` then emits
  `NaN` start and end angles, which renders nothing and breaks pointer
  resolution. Pre-existing, and `composeBase` mirrors `readSegments`
  deliberately, so capping in one parser alone would break that stated symmetry.
  The fix belongs in `normalizeWeights` / `arcs`, where it can be made once.
- **`wedgeOwners` does not apply the dedupe rule.** Found reviewing Task 2. When
  a static wedge and a trick wedge collide on an id, `resolveTricks` correctly
  drops the computed one, but `wedgeOwners` still reports the trick as owner, so
  `SegmentList` renders a ghost row for a wedge that is not on the wheel. Not
  reachable through the UI today — static ids are `seg{n}` and trick ids contain
  no colon — so it needs an imported preset. Worth revisiting once operators can
  choose a `feedId`, because composed `${feedId}:${itemId}` ids widen the
  namespace that `${trickId}:wedge` can collide with.
- **The feed-unavailable banner.** The spec's error handling calls for one when
  a feed never publishes. With a simulated feed the editor *is* the publisher,
  so there is nothing to warn about yet; the banner arrives with the adapter
  that can actually fail. Until then an unpublished feed degrades silently to
  statics only, which is the behavior the spec asks for.
