# Scripted Spins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author a spin as one unit that owns both who wins and how the wheel travels there, with a branch tree that can redirect the spin based on where it would have landed.

**Architecture:** A new `ScriptedSpin` value (target + motion) plus a `BranchNode[]` tree live on the preset. A resolver walks the tree at spin time, re-evaluating the landing after each node, and compiles the result down to the `SpinConfig` the wheel already consumes — handing the winner back through the existing `forced()` strategy. `planSpin`, `Wheel`, and every recipe are untouched.

**Tech Stack:** TypeScript 5.7, React 19, Vite 6, Vitest 2, Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-01-scripted-spins-design.md`

**Scope:** Build-order steps 1–4 of the spec. Step 5 (editor UI for authoring trees) is deliberately excluded and gets its own plan. Tasks 1–5 change no user-visible behavior; all behavioral risk is in Tasks 6–8.

---

## File Structure

**Created:**
- `src/spin/resolve.ts` — the branch walk, the frozen roll, the `Resolution` union
- `src/spin/resolve.test.ts` — resolver tests

**Modified:**
- `src/wheel/geometry.ts:92-100` — `targetRotationDeg` → `restingRotationDeg`, revolutions removed
- `src/wheel/spin.ts:6-13,45-51` — `SpinPlan.targetRotationDeg` → `restingRotationDeg`
- `src/wheel/types.ts:40-46` — `SpinConfig` gains `direction`
- `src/wheel/useSpin.ts:69-140` — direction-aware delta, resting-angle sign fix, `SpinOverride`
- `src/preset/types.ts` — `ScriptedSpin`, `Motion`, `Target`, branch tree types, `Preset` v2
- `src/preset/defaults.ts` — default preset in v2 shape
- `src/preset/storage.ts:67-100` — v1→v2 migration, spin and branch parsing
- `src/App.tsx:16-34,47` — read `spin.motion`, resolve on click
- `src/editor/Editor.tsx:28-47` — read `spin.motion`

**Test files updated:** `src/wheel/geometry.test.ts`, `src/wheel/spin.test.ts`, `src/wheel/useSpin.test.ts`, `src/preset/storage.test.ts`

Run all tests with `npm test`. Run one file with `npx vitest run src/path/file.test.ts`.

---

### Task 1: Strip revolutions out of the geometry helper

`targetRotationDeg` bakes in `fullSpins * 360`, and `useSpin.ts:90` adds it again — the intervening `% 360` silently discards the first. Harmless while direction is fixed; actively misleading once it is not. The function is renamed because after this change it no longer returns the target rotation, only the resting angle.

**Files:**
- Modify: `src/wheel/geometry.ts:92-100`
- Modify: `src/wheel/spin.ts:1-13,45-51`
- Modify: `src/wheel/useSpin.ts:90`
- Test: `src/wheel/geometry.test.ts:182-198,238-241`
- Test: `src/wheel/spin.test.ts:61,65-69,80,106`

- [ ] **Step 1: Update the geometry tests to the new signature**

Replace the whole `describe('rotation mapping', …)` block at `src/wheel/geometry.test.ts:182-198`:

```ts
describe('rotation mapping', () => {
  it('is the exact inverse of the pointer mapping', () => {
    for (const turn of [0, 0.001, 0.25, 0.5, 0.75, 0.999]) {
      for (const spins of [0, 1, 5]) {
        // Revolutions are the animator's business now, but adding them back must
        // not disturb which turn the pointer reads.
        expect(pointerTurn(restingRotationDeg(turn) + spins * 360)).toBeCloseTo(turn, 9)
      }
    }
  })

  it('returns a resting angle inside a single revolution', () => {
    for (const turn of [0, 0.001, 0.25, 0.5, 0.75, 0.999]) {
      const deg = restingRotationDeg(turn)
      expect(deg).toBeGreaterThanOrEqual(0)
      expect(deg).toBeLessThan(360)
    }
  })

  it('rotates counter to the turn so the pointer meets it', () => {
    expect(restingRotationDeg(0.25)).toBe(270)
  })
})
```

Change the import at `src/wheel/geometry.test.ts:130`:

```ts
import { angleToSegment, pointerTurn, restingRotationDeg } from './geometry'
```

And the round-trip probe at `src/wheel/geometry.test.ts:239`:

```ts
            const recovered = pointerTurn(restingRotationDeg(probe) + spins * 360)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wheel/geometry.test.ts`
Expected: FAIL — `restingRotationDeg is not exported by ./geometry` (a TypeScript/import error, not an assertion failure).

- [ ] **Step 3: Rename and simplify the helper**

Replace `src/wheel/geometry.ts:92-100` entirely:

```ts
/**
 * The wheel rotates; the pointer is fixed at 12 o'clock. To bring wheel-local
 * `landingTurn` under the pointer, rotate by its complement.
 *
 * Revolutions are deliberately not included. The animator owns how many turns
 * to add and in which direction; baking them in here meant `useSpin` added them
 * a second time while an intervening `% 360` discarded the first.
 */
export function restingRotationDeg(landingTurn: number): number {
  const t = wrapTurn(landingTurn)
  return (360 - t * 360) % 360
}
```

- [ ] **Step 4: Run the geometry tests to verify they pass**

Run: `npx vitest run src/wheel/geometry.test.ts`
Expected: PASS

- [ ] **Step 5: Update `SpinPlan` and its producer**

In `src/wheel/spin.ts`, change the import on line 1:

```ts
import { arcs, restingRotationDeg } from './geometry'
```

Replace the `SpinPlan` type at `src/wheel/spin.ts:6-13`:

```ts
export type SpinPlan = {
  winnerId: string
  /** Wheel-local turn that will sit under the pointer when the wheel stops. */
  landingTurn: number
  /** Resting angle in [0, 360). Revolutions are added by the animator. */
  restingRotationDeg: number
  /** The segments as they will be at the moment of landing. */
  landing: Segment[]
}
```

Replace the return block at `src/wheel/spin.ts:45-51`:

```ts
  return {
    winnerId,
    landingTurn,
    restingRotationDeg: restingRotationDeg(landingTurn),
    landing,
  }
```

- [ ] **Step 6: Update the consumer in `useSpin`**

Replace `src/wheel/useSpin.ts:90`:

```ts
      const delta = config.fullSpins * 360 + ((((plan.restingRotationDeg - from) % 360) + 360) % 360)
```

- [ ] **Step 7: Update the spin tests**

In `src/wheel/spin.test.ts`, replace line 61:

```ts
      expect(angleToSegment(landing, pointerTurn(plan.restingRotationDeg))).toBe(plan.winnerId)
```

Replace the whole test at `src/wheel/spin.test.ts:65-69` — revolutions are no longer planSpin's concern, so this now pins the resting angle's range instead. Revolutions get their own assertion in Task 2's `useSpin` tests:

```ts
  it('reports a resting angle inside a single revolution', () => {
    const plan = planSpin(people, config, weightedRandom, lcg(5))
    expect(plan?.restingRotationDeg).toBeGreaterThanOrEqual(0)
    expect(plan?.restingRotationDeg).toBeLessThan(360)
  })
```

Replace line 80:

```ts
    expect(angleToSegment(landing, pointerTurn(plan.restingRotationDeg))).toBe(plan.winnerId)
```

Replace line 106:

```ts
    expect(angleToSegment(landing, pointerTurn(plan?.restingRotationDeg ?? 0))).toBe('beer')
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — all files. Behavior is unchanged; this is a pure rename plus moving the revolution arithmetic to its single real owner.

- [ ] **Step 9: Commit**

```bash
git add src/wheel/geometry.ts src/wheel/geometry.test.ts src/wheel/spin.ts src/wheel/spin.test.ts src/wheel/useSpin.ts
git commit -m "refactor(wheel): let the animator own revolutions

targetRotationDeg baked in fullSpins * 360 and useSpin added it a second
time, with an intervening % 360 silently discarding the first. Harmless
while every spin turned the same way; misleading once direction varies.
Renamed to restingRotationDeg because it no longer returns the target."
```

---

### Task 2: Counter-clockwise spins

`Motion.direction` is the one genuinely new wheel capability. Nothing in the current rotation math can express it, and adding it exposes a latent sign bug in the stored resting angle.

**Files:**
- Modify: `src/wheel/types.ts:40-46`
- Modify: `src/wheel/useSpin.ts:88-91,125`
- Modify: `src/App.tsx:21-29`, `src/editor/Editor.tsx:37-45`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/wheel/useSpin.test.ts`, inside the existing `describe('useSpin', …)`. This file already provides everything needed: `harness` (from `installHarness()` in `beforeEach`), `renderSpin(config)`, `degreesOf(keyframe)`, and the `PLAIN` config literal.

```ts
  it('adds the requested revolutions in the clockwise direction', () => {
    const { result } = renderSpin({ ...PLAIN, fullSpins: 6, direction: 'cw' })
    act(() => {
      result.current.spin()
    })
    const { keyframes } = harness.animateCalls[0]
    const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
    expect(travelled).toBeGreaterThanOrEqual(6 * 360)
    expect(travelled).toBeLessThan(7 * 360)
  })

  it('travels backwards for a counter-clockwise spin', () => {
    const { result } = renderSpin({ ...PLAIN, fullSpins: 6, direction: 'ccw' })
    act(() => {
      result.current.spin()
    })
    const { keyframes } = harness.animateCalls[0]
    const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
    expect(travelled).toBeLessThanOrEqual(-6 * 360)
    expect(travelled).toBeGreaterThan(-7 * 360)
  })

  it('keeps the stored resting angle positive across alternating directions', async () => {
    // Regression: `to % 360` keeps the sign of the dividend, so a ccw spin used
    // to store a negative resting angle and the NEXT spin started from a
    // nonsense origin. The first spin must FINISH — the resting angle is written
    // in the `finished` handler.
    const { result } = renderSpin({ ...PLAIN, direction: 'ccw' })
    act(() => {
      result.current.spin()
    })
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    act(() => {
      result.current.spin()
    })
    const start = degreesOf(harness.animateCalls[1].keyframes[0])
    expect(start).toBeGreaterThanOrEqual(0)
    expect(start).toBeLessThan(360)
  })
```

The `MORPHING` literal at `src/wheel/useSpin.test.ts:40-45` needs `direction: 'cw',` added once Step 3 lands; `PLAIN` spreads it, so it inherits.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — TypeScript rejects `direction` as an unknown property on `SpinConfig`.

- [ ] **Step 3: Add `direction` to `SpinConfig`**

Replace `src/wheel/types.ts:40-46`:

```ts
export type SpinConfig = {
  durationMs: number
  fullSpins: number
  /** Which way the wheel turns. The pointer is fixed either way. */
  direction: 'cw' | 'ccw'
  /** CSS easing string, handed to the Web Animations API. */
  easing: string
  morphs: Morph[]
}
```

Required, not optional: the compiler then enumerates every construction site rather than letting one silently default.

- [ ] **Step 4: Implement the direction-aware delta and fix the sign bug**

Replace `src/wheel/useSpin.ts:88-91`:

```ts
      // Continue from the resting angle: add the requested revolutions plus
      // however much more is needed to bring the winner under the pointer.
      const from = rotationRef.current
      const forward = (((plan.restingRotationDeg - from) % 360) + 360) % 360
      // The inner % 360 on the reverse case matters: without it a `forward` of
      // exactly zero becomes a spurious extra revolution.
      const delta =
        config.direction === 'ccw'
          ? -(config.fullSpins * 360 + ((360 - forward) % 360))
          : config.fullSpins * 360 + forward
      const to = from + delta
```

Replace `src/wheel/useSpin.ts:125`:

```ts
          // JavaScript's % keeps the sign of the dividend, so a counter-clockwise
          // spin would otherwise store a negative resting angle and the next spin
          // would start from a nonsense origin.
          rotationRef.current = ((to % 360) + 360) % 360
```

- [ ] **Step 5: Add `direction` to the two app construction sites**

`src/App.tsx:21-29`:

```tsx
  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.durationMs,
      fullSpins: preset.spin.fullSpins,
      direction: 'cw',
      easing: preset.spin.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )
```

`src/editor/Editor.tsx:37-45` — same addition of `direction: 'cw',` after the `fullSpins` line. These become preset-driven in Task 5; hardcoding `'cw'` here keeps this task behavior-neutral.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If other test files construct a `SpinConfig` literal, TypeScript will name them — add `direction: 'cw'` to each.

- [ ] **Step 7: Commit**

```bash
git add src/wheel/types.ts src/wheel/useSpin.ts src/wheel/useSpin.test.ts src/App.tsx src/editor/Editor.tsx
git commit -m "feat(wheel): spin counter-clockwise

Adds SpinConfig.direction and the reverse delta. Also fixes a latent sign
bug this exposes: the resting angle was stored as \`to % 360\`, which keeps
the sign of the dividend, so the first ccw spin would leave a negative
origin for the next one."
```

---

### Task 3: Preset v2 types

Pure type declarations plus the default preset. No behavior, no parsing yet.

**Files:**
- Modify: `src/preset/types.ts`
- Modify: `src/preset/defaults.ts`

- [ ] **Step 1: Replace the preset types**

Replace `src/preset/types.ts` entirely:

```ts
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'

export type Target = { kind: 'fair' } | { kind: 'forced'; segmentId: string }

export type Motion = {
  durationMs: number
  turns: number
  direction: 'cw' | 'ccw'
  /** CSS easing string, handed to the Web Animations API. */
  easing: string
}

/** What an operator authors. Compiled down to SpinConfig at spin time. */
export type ScriptedSpin = { target: Target; motion: Motion }

export type Condition = { kind: 'landsOn'; segmentIds: string[] }

export type SpinModifier = {
  target?: Target
  motion?: Partial<Motion>
  /** Deltas against each trick's own `enabled` flag, which stays the baseline. */
  enableTricks?: string[]
  disableTricks?: string[]
}

export type BranchAction =
  | { kind: 'replace'; spin: ScriptedSpin }
  | { kind: 'modify'; modifier: SpinModifier }

/**
 * A node acts, descends, or both. `do` alone is a leaf; `then` alone is pure
 * routing. Siblings are first-match-wins.
 *
 * Replacements are embedded inline rather than referenced by name, which is
 * what makes the walk a strict descent: depth is bounded by the authored tree,
 * so a cycle cannot be expressed and does not need detecting.
 */
export type BranchNode = {
  id: string
  when: Condition
  do?: BranchAction
  then?: BranchNode[]
}

export type Preset = {
  version: 2
  name: string
  segments: Segment[]
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
}
```

`SpinSettings` is deleted. It has no consumers outside `Preset` once Task 5 lands, and Task 4's migration is the only code that needs to understand the old shape.

- [ ] **Step 2: Update the default preset**

Replace `src/preset/defaults.ts:8-41` — only the `version` line and the trailing `spin` block change, plus the new `branches`:

```ts
export const DEFAULT_PRESET: Preset = {
  version: 2,
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
    target: { kind: 'fair' },
    motion: {
      durationMs: 4500,
      turns: 6,
      direction: 'cw',
      easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
    },
  },
  branches: [],
}
```

- [ ] **Step 3: Run the type check**

Run: `npx tsc --noEmit`
Expected: FAIL, with errors in `src/preset/storage.ts`, `src/App.tsx`, and `src/editor/Editor.tsx` — every site still reading `preset.spin.durationMs` and `preset.spin.fullSpins`. Tasks 4 and 5 fix these. This is the expected intermediate state; do not patch them here.

- [ ] **Step 4: Commit**

```bash
git add src/preset/types.ts src/preset/defaults.ts
git commit -m "feat(preset): add v2 types for scripted spins and branch trees

Types only. storage, App, and Editor are updated in the next two commits;
the tree does not type-check in between."
```

---

### Task 4: Storage — v1 to v2 migration

**Files:**
- Modify: `src/preset/storage.ts:67-100`
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('parsePreset', …)` block in `src/preset/storage.test.ts`:

```ts
  it('migrates a v1 preset to v2', () => {
    const v1 = {
      version: 1,
      name: 'standup',
      segments: [{ id: 'ana', label: 'Ana', weight: 1 }],
      tricks: [],
      spin: { durationMs: 4500, fullSpins: 6, easing: 'linear' },
    }
    const parsed = parsePreset(JSON.stringify(v1))
    expect(parsed.version).toBe(2)
    expect(parsed.spin).toEqual({
      target: { kind: 'fair' },
      motion: { durationMs: 4500, turns: 6, direction: 'cw', easing: 'linear' },
    })
    expect(parsed.branches).toEqual([])
  })

  it('preserves v1 spin behavior exactly through migration', () => {
    const v1 = {
      version: 1,
      name: 'standup',
      segments: [{ id: 'ana', label: 'Ana', weight: 1 }],
      tricks: [],
      spin: { durationMs: 1234, fullSpins: 3, easing: 'ease-in' },
    }
    const parsed = parsePreset(JSON.stringify(v1))
    expect(parsed.spin.motion.durationMs).toBe(1234)
    expect(parsed.spin.motion.turns).toBe(3)
    expect(parsed.spin.motion.easing).toBe('ease-in')
    expect(parsed.spin.motion.direction).toBe('cw')
  })

  it('rejects a negative duration in a v2 preset', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'fair' }, motion: { ...DEFAULT_PRESET.spin.motion, durationMs: -1 } },
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.spin.motion.durationMs).toBe(DEFAULT_PRESET.spin.motion.durationMs)
  })

  it('falls back to clockwise for an unknown direction', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'fair' }, motion: { ...DEFAULT_PRESET.spin.motion, direction: 'sideways' } },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.direction).toBe('cw')
  })

  it('reads a forced target', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'forced', segmentId: 'ana' }, motion: DEFAULT_PRESET.spin.motion },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.target).toEqual({ kind: 'forced', segmentId: 'ana' })
  })

  it('falls back to a fair target when the forced segment id is missing', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'forced' }, motion: DEFAULT_PRESET.spin.motion },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.target).toEqual({ kind: 'fair' })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — `storage.ts` does not compile against the v2 types yet.

- [ ] **Step 3: Implement the migration**

In `src/preset/storage.ts`, replace the import on line 5:

```ts
import type { Motion, Preset, ScriptedSpin, Target } from './types'
```

Add these helpers immediately after `readPositive` (after line 38):

```ts
function readTarget(value: unknown): Target {
  if (!isRecord(value)) return { kind: 'fair' }
  if (value.kind === 'forced' && typeof value.segmentId === 'string') {
    return { kind: 'forced', segmentId: value.segmentId }
  }
  return { kind: 'fair' }
}

/** Non-negative and finite, or the fallback. Zero turns is a legitimate spin. */
function readTurns(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function readMotion(value: unknown): Motion {
  const raw = isRecord(value) ? value : {}
  const fallback = DEFAULT_PRESET.spin.motion
  return {
    // Must be positive, not merely finite. Element.animate() throws
    // synchronously on a negative duration, so a hand-edited preset would crash
    // the wheel at spin time — the exact failure this module exists to prevent.
    durationMs: readPositive(raw.durationMs, fallback.durationMs),
    turns: readTurns(raw.turns, fallback.turns),
    direction: raw.direction === 'ccw' ? 'ccw' : 'cw',
    easing: typeof raw.easing === 'string' ? raw.easing : fallback.easing,
  }
}

/** The v1 shape: a flat spin block with `fullSpins`, no target, no branches. */
function migrateV1Spin(value: unknown): ScriptedSpin {
  const raw = isRecord(value) ? value : {}
  return {
    target: { kind: 'fair' },
    motion: readMotion({
      durationMs: raw.durationMs,
      turns: raw.fullSpins,
      direction: 'cw',
      easing: raw.easing,
    }),
  }
}
```

Replace `parsePreset` at `src/preset/storage.ts:67-100`:

```ts
export function parsePreset(raw: string | null): Preset {
  if (raw === null) return DEFAULT_PRESET

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PRESET
  }

  if (!isRecord(data)) return DEFAULT_PRESET
  if (data.version !== 1 && data.version !== 2) return DEFAULT_PRESET

  const segments = readSegments(data.segments)
  const spin =
    data.version === 1
      ? migrateV1Spin(data.spin)
      : {
          target: readTarget(isRecord(data.spin) ? data.spin.target : undefined),
          motion: readMotion(isRecord(data.spin) ? data.spin.motion : undefined),
        }

  return {
    version: 2,
    name: typeof data.name === 'string' ? data.name : DEFAULT_PRESET.name,
    segments,
    tricks: readTricks(data.tricks, segments),
    spin,
    branches: [],
  }
}
```

`branches` is hardcoded empty here; Task 6 replaces that line with real parsing.

- [ ] **Step 4: Run the storage tests**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS. `npx tsc --noEmit` still fails on `App.tsx` and `Editor.tsx` — that is Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/preset/storage.ts src/preset/storage.test.ts
git commit -m "feat(preset): migrate stored v1 presets to v2

A v1 preset loads as v2 with a fair target, clockwise direction, and no
branches, and must spin byte-identically. Branch parsing lands separately."
```

---

### Task 5: Read the scripted spin in the app and editor

Wiring only. Behavior is still unchanged: the target is fair and there are no branches, so this produces the same spins as before.

**Files:**
- Modify: `src/App.tsx:16-29`
- Modify: `src/editor/Editor.tsx:28-45,93`

- [ ] **Step 1: Update `App.tsx`**

Replace `src/App.tsx:16-29`:

```tsx
  const resolved = useMemo(
    () => resolveTricks(preset.segments, preset.tricks, preset.spin.motion.durationMs),
    [preset],
  )

  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.motion.durationMs,
      fullSpins: preset.spin.motion.turns,
      direction: preset.spin.motion.direction,
      easing: preset.spin.motion.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )
```

- [ ] **Step 2: Update `Editor.tsx`**

Replace the three `preset.spin.durationMs` reads at `src/editor/Editor.tsx:28`, `:33`, and `:93` with `preset.spin.motion.durationMs`, and the config memo at `:37-45`:

```tsx
  const spinConfig = useMemo(
    () => ({
      durationMs: preset.spin.motion.durationMs,
      fullSpins: preset.spin.motion.turns,
      direction: preset.spin.motion.direction,
      easing: preset.spin.motion.easing,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )
```

- [ ] **Step 3: Run the type check and the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: both PASS. Any remaining failures are test fixtures still building v1 presets — update them to the v2 shape shown in Task 3's `DEFAULT_PRESET`.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/editor/Editor.tsx
git commit -m "refactor(app): read motion off the scripted spin

No behavior change: the target is fair and branches are empty, so this
produces the same spins. The seam for branching now exists."
```

---

### Task 6: Parse the branch tree

**Files:**
- Modify: `src/preset/storage.ts`
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `describe('parsePreset', …)` in `src/preset/storage.test.ts`:

```ts
  it('reads a branch tree', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'escape',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          do: { kind: 'modify', modifier: { enableTricks: ['beer'] } },
        },
      ],
    }
    expect(parsePreset(JSON.stringify(raw)).branches).toEqual(raw.branches)
  })

  it('reads nested branch children', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'outer',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          then: [{ id: 'inner', when: { kind: 'landsOn', segmentIds: ['ben'] } }],
        },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches[0].then?.[0].id).toBe('inner')
  })

  it('drops a branch node with no usable condition', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        { id: 'bad', when: { kind: 'whenever' } },
        { id: 'good', when: { kind: 'landsOn', segmentIds: ['ana'] } },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches.map((n) => n.id)).toEqual(['good'])
  })

  it('drops a branch node with a non-string id', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [{ id: 7, when: { kind: 'landsOn', segmentIds: ['ana'] } }],
    }
    expect(parsePreset(JSON.stringify(raw)).branches).toEqual([])
  })

  it('drops an unusable action but keeps the node', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        { id: 'n', when: { kind: 'landsOn', segmentIds: ['ana'] }, do: { kind: 'detonate' } },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches).toHaveLength(1)
    expect(parsed.branches[0].do).toBeUndefined()
  })

  it('reads branches as empty when absent', () => {
    const { branches, ...withoutBranches } = DEFAULT_PRESET
    expect(parsePreset(JSON.stringify(withoutBranches)).branches).toEqual([])
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — `branches` comes back `[]` for every case because `parsePreset` hardcodes it.

- [ ] **Step 3: Implement branch parsing**

Add to the import on `src/preset/storage.ts:5`:

```ts
import type { BranchAction, BranchNode, Condition, Motion, Preset, ScriptedSpin, SpinModifier, Target } from './types'
```

Add these helpers after `migrateV1Spin`:

```ts
function readCondition(value: unknown): Condition | null {
  if (!isRecord(value) || value.kind !== 'landsOn') return null
  if (!Array.isArray(value.segmentIds)) return null
  const ids = value.segmentIds.filter((id): id is string => typeof id === 'string')
  return { kind: 'landsOn', segmentIds: ids }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((id): id is string => typeof id === 'string')
}

function readModifier(value: unknown): SpinModifier {
  const raw = isRecord(value) ? value : {}
  const modifier: SpinModifier = {}
  if (isRecord(raw.target)) modifier.target = readTarget(raw.target)
  // Bound to a local so TypeScript keeps the narrowing across every read below.
  const rawMotion = isRecord(raw.motion) ? raw.motion : null
  if (rawMotion) {
    // Partial by design: a modifier may set only direction, only easing, and so
    // on. readMotion would fill the gaps with defaults and silently overwrite
    // whatever the spin already had.
    const motion: Partial<Motion> = {}
    if (typeof rawMotion.durationMs === 'number' && rawMotion.durationMs > 0) {
      motion.durationMs = rawMotion.durationMs
    }
    if (typeof rawMotion.turns === 'number' && Number.isFinite(rawMotion.turns)) {
      motion.turns = Math.max(0, rawMotion.turns)
    }
    if (rawMotion.direction === 'cw' || rawMotion.direction === 'ccw') {
      motion.direction = rawMotion.direction
    }
    if (typeof rawMotion.easing === 'string') motion.easing = rawMotion.easing
    if (Object.keys(motion).length > 0) modifier.motion = motion
  }
  const enable = readStringArray(raw.enableTricks)
  const disable = readStringArray(raw.disableTricks)
  if (enable) modifier.enableTricks = enable
  if (disable) modifier.disableTricks = disable
  return modifier
}

function readAction(value: unknown): BranchAction | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'replace') {
    const spin = isRecord(value.spin) ? value.spin : {}
    return {
      kind: 'replace',
      spin: { target: readTarget(spin.target), motion: readMotion(spin.motion) },
    }
  }
  if (value.kind === 'modify') return { kind: 'modify', modifier: readModifier(value.modifier) }
  return undefined
}

/**
 * A node without a usable condition is dropped: it could never match, and
 * keeping it would put a rule in the editor that silently does nothing. An
 * unusable *action* only loses the action — the node may still route via `then`.
 */
function readBranches(value: unknown): BranchNode[] {
  if (!Array.isArray(value)) return []
  const nodes: BranchNode[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const when = readCondition(entry.when)
    if (!when) continue

    const node: BranchNode = { id: entry.id, when }
    const action = readAction(entry.do)
    if (action) node.do = action
    if (Array.isArray(entry.then)) {
      const children = readBranches(entry.then)
      if (children.length > 0) node.then = children
    }
    nodes.push(node)
  }
  return nodes
}
```

Replace the hardcoded line in `parsePreset`:

```ts
    branches: readBranches(data.branches),
```

- [ ] **Step 4: Run the storage tests**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/preset/storage.ts src/preset/storage.test.ts
git commit -m "feat(preset): parse branch trees defensively

A node with no usable condition is dropped, since it could never match. An
unusable action only loses the action — the node can still route via then."
```

---

### Task 7: The resolver

The heart of the feature. A strict descent through the tree, re-evaluating the landing after each node, with one frozen roll for the whole walk.

**Files:**
- Create: `src/spin/resolve.ts`
- Test: `src/spin/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/spin/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { BranchNode, ScriptedSpin } from '../preset/types'
import type { Trick } from '../tricks/types'
import type { Rng } from '../wheel/selection'
import type { Segment } from '../wheel/types'
import { MAX_DEPTH, resolveScriptedSpin } from './resolve'

const people: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 1 },
  { id: 'cal', label: 'Cal', weight: 1 },
]

const spin: ScriptedSpin = {
  target: { kind: 'fair' },
  motion: { durationMs: 4000, turns: 5, direction: 'cw', easing: 'linear' },
}

/** Always returns the same value, so the fair draw is predictable. */
const fixed = (value: number): Rng => () => value

describe('resolveScriptedSpin', () => {
  it('settles immediately when there are no branches', () => {
    const result = resolveScriptedSpin(people, [], spin, [], fixed(0.1))
    expect(result?.kind).toBe('settled')
    expect(result?.winnerId).toBe('ana')
  })

  it('returns null when there is nothing to spin', () => {
    expect(resolveScriptedSpin([], [], spin, [], fixed(0.1))).toBeNull()
  })

  it('honors a forced target', () => {
    const rigged: ScriptedSpin = { ...spin, target: { kind: 'forced', segmentId: 'cal' } }
    expect(resolveScriptedSpin(people, [], rigged, [], fixed(0.1))?.winnerId).toBe('cal')
  })

  it('re-targets when a branch matches', () => {
    const branches: BranchNode[] = [
      {
        id: 'escape',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
    ]
    const result = resolveScriptedSpin(people, [], spin, branches, fixed(0.1))
    expect(result?.winnerId).toBe('cal')
  })

  it('leaves the spin alone when no branch matches', () => {
    const branches: BranchNode[] = [
      {
        id: 'never',
        when: { kind: 'landsOn', segmentIds: ['ben'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
    ]
    expect(resolveScriptedSpin(people, [], spin, branches, fixed(0.1))?.winnerId).toBe('ana')
  })

  it('replaces motion wholesale', () => {
    const branches: BranchNode[] = [
      {
        id: 'reverse',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: {
          kind: 'replace',
          spin: {
            target: { kind: 'forced', segmentId: 'ben' },
            motion: { durationMs: 1000, turns: 2, direction: 'ccw', easing: 'ease-out' },
          },
        },
      },
    ]
    const result = resolveScriptedSpin(people, [], spin, branches, fixed(0.1))
    expect(result?.motion.direction).toBe('ccw')
    expect(result?.motion.turns).toBe(2)
    expect(result?.winnerId).toBe('ben')
  })

  it('patches only the named motion fields', () => {
    const branches: BranchNode[] = [
      {
        id: 'slow',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { motion: { direction: 'ccw' } } },
      },
    ]
    const result = resolveScriptedSpin(people, [], spin, branches, fixed(0.1))
    expect(result?.motion.direction).toBe('ccw')
    expect(result?.motion.turns).toBe(5)
    expect(result?.motion.easing).toBe('linear')
  })

  it('descends into children against the post-modify landing', () => {
    // The parent re-targets to cal, so only a child asking about cal can fire.
    // The sibling that would have matched the ORIGINAL winner must not.
    const branches: BranchNode[] = [
      {
        id: 'parent',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
        then: [
          {
            id: 'child-sees-cal',
            when: { kind: 'landsOn', segmentIds: ['cal'] },
            do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ben' } } },
          },
          {
            id: 'child-sees-ana',
            when: { kind: 'landsOn', segmentIds: ['ana'] },
            do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ana' } } },
          },
        ],
      },
    ]
    expect(resolveScriptedSpin(people, [], spin, branches, fixed(0.1))?.winnerId).toBe('ben')
  })

  it('does not re-scan siblings after descending', () => {
    // 'second' would match the re-targeted winner, but the walk has already
    // moved down a level and never looks back up. This is what makes the walk
    // terminate by construction.
    const branches: BranchNode[] = [
      {
        id: 'first',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
      {
        id: 'second',
        when: { kind: 'landsOn', segmentIds: ['cal'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'ben' } } },
      },
    ]
    expect(resolveScriptedSpin(people, [], spin, branches, fixed(0.1))?.winnerId).toBe('cal')
  })

  it('enables a trick through a modifier', () => {
    const tricks: Trick[] = [
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
          endColor: '',
          easing: 'easeIn',
        },
        enabled: false,
      },
    ]
    const branches: BranchNode[] = [
      {
        id: 'beer-time',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { enableTricks: ['beer'] } },
      },
    ]
    const result = resolveScriptedSpin(people, tricks, spin, branches, fixed(0.1))
    // The takeover wedge swallows the wheel, so it must be the winner.
    expect(result?.winnerId).toBe('beer:wedge')
    expect(result?.morphs.length).toBeGreaterThan(0)
  })

  it('disables a baseline-enabled trick through a modifier', () => {
    const tricks: Trick[] = [
      {
        id: 'gone',
        name: 'vanishing act',
        recipe: 'vanish',
        params: { targets: ['ana'], startAt: 0, easing: 'linear' },
        enabled: true,
      },
    ]
    // With the trick on, ana vanishes and cannot win. Turning it off restores her.
    const withTrick = resolveScriptedSpin(people, tricks, spin, [], fixed(0.1))
    expect(withTrick?.winnerId).not.toBe('ana')

    const branches: BranchNode[] = [
      {
        id: 'spare-her',
        when: { kind: 'landsOn', segmentIds: [withTrick?.winnerId ?? ''] },
        do: { kind: 'modify', modifier: { disableTricks: ['gone'] } },
      },
    ]
    const result = resolveScriptedSpin(people, tricks, spin, branches, fixed(0.1))
    expect(result?.morphs).toEqual([])
    expect(result?.winnerId).toBe('ana')
  })

  it('uses one frozen roll for the whole walk', () => {
    // A counting rng proves the resolver draws exactly once no matter how many
    // times it re-evaluates. Re-rolling would move the winner for reasons the
    // operator did not author.
    let calls = 0
    const counting: Rng = () => {
      calls++
      return 0.1
    }
    const branches: BranchNode[] = [
      {
        id: 'a',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { motion: { turns: 9 } } },
        then: [{ id: 'b', when: { kind: 'landsOn', segmentIds: ['ana'] } }],
      },
    ]
    resolveScriptedSpin(people, [], spin, branches, counting)
    expect(calls).toBe(1)
  })

  it('resolves identically for the same roll', () => {
    const branches: BranchNode[] = [
      {
        id: 'escape',
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        do: { kind: 'modify', modifier: { target: { kind: 'forced', segmentId: 'cal' } } },
      },
    ]
    const first = resolveScriptedSpin(people, [], spin, branches, fixed(0.42))
    const second = resolveScriptedSpin(people, [], spin, branches, fixed(0.42))
    expect(first).toEqual(second)
  })

  it('reports exhausted past the depth cap', () => {
    // A chain longer than MAX_DEPTH, each node routing to the next.
    let deepest: BranchNode[] = []
    for (let i = MAX_DEPTH + 2; i > 0; i--) {
      deepest = [
        { id: `n${i}`, when: { kind: 'landsOn', segmentIds: ['ana'] }, then: deepest },
      ]
    }
    const result = resolveScriptedSpin(people, [], spin, deepest, fixed(0.1))
    expect(result?.kind).toBe('exhausted')
    expect(result?.winnerId).toBe('ana')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/spin/resolve.test.ts`
Expected: FAIL — `Cannot find module './resolve'`

- [ ] **Step 3: Implement the resolver**

Create `src/spin/resolve.ts`:

```ts
import type { BranchNode, Motion, ScriptedSpin, SpinModifier, Target } from '../preset/types'
import { resolveTricks } from '../tricks/resolve'
import type { Trick } from '../tricks/types'
import { landingSegments } from '../wheel/morph'
import type { Rng, SelectionStrategy } from '../wheel/selection'
import { forced, weightedRandom } from '../wheel/selection'
import type { Morph, Segment } from '../wheel/types'

/**
 * Not a cycle guard — branches embed their replacements inline, so the walk is a
 * strict descent and a cycle cannot be authored. This exists for corrupted or
 * hand-edited JSON arriving through import, matching the defensive posture in
 * `storage.ts` and `getRecipe`.
 */
export const MAX_DEPTH = 32

export type Resolution =
  | {
      kind: 'settled'
      winnerId: string
      segments: Segment[]
      morphs: Morph[]
      motion: Motion
    }
  | {
      kind: 'exhausted'
      winnerId: string
      depth: number
      segments: Segment[]
      morphs: Morph[]
      motion: Motion
    }

function strategyFor(target: Target): SelectionStrategy {
  return target.kind === 'forced' ? forced(target.segmentId) : weightedRandom
}

function applyTrickDeltas(enabled: Set<string>, modifier: SpinModifier): void {
  for (const id of modifier.disableTricks ?? []) enabled.delete(id)
  for (const id of modifier.enableTricks ?? []) enabled.add(id)
}

function applyModifier(spin: ScriptedSpin, modifier: SpinModifier): ScriptedSpin {
  return {
    target: modifier.target ?? spin.target,
    motion: { ...spin.motion, ...modifier.motion },
  }
}

function evaluate(segments: Segment[], tricks: Trick[], enabled: Set<string>, spin: ScriptedSpin) {
  const active = tricks.filter((trick) => enabled.has(trick.id))
  const { segments: all, morphs } = resolveTricks(segments, active, spin.motion.durationMs)
  const landing = landingSegments(all, morphs, spin.motion.durationMs)
  return { all, morphs, landing }
}

/**
 * Walks the branch tree and compiles a `ScriptedSpin` into everything the wheel
 * needs. Returns null only when there is genuinely nobody to pick — an empty
 * wheel, or every arc collapsed — which is the same condition `planSpin`
 * already returns null for.
 */
export function resolveScriptedSpin(
  segments: Segment[],
  tricks: Trick[],
  spin: ScriptedSpin,
  branches: BranchNode[],
  rng: Rng,
): Resolution | null {
  // One roll for the whole resolution. Re-rolling on each pass would move the
  // winner for reasons unrelated to the operator's modifiers: a node could fire
  // on a draw that no longer exists, and the same preset would resolve
  // differently every run. Freezing it means every change in winner is caused
  // by a modifier, which is the only way the tree is readable.
  const roll = rng()
  const frozen: Rng = () => roll

  let current = spin
  const enabled = new Set(tricks.filter((trick) => trick.enabled).map((trick) => trick.id))
  let level = branches

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const { all, morphs, landing } = evaluate(segments, tricks, enabled, current)
    const winnerId = strategyFor(current.target)(landing, frozen)
    if (!winnerId) return null

    const node = level.find((candidate) => candidate.when.segmentIds.includes(winnerId))
    if (!node) {
      return { kind: 'settled', winnerId, segments: all, morphs, motion: current.motion }
    }

    if (node.do?.kind === 'replace') {
      current = node.do.spin
    } else if (node.do?.kind === 'modify') {
      applyTrickDeltas(enabled, node.do.modifier)
      current = applyModifier(current, node.do.modifier)
    }
    level = node.then ?? []
  }

  // The cap was reached with a node still matching. Recompute once so the caller
  // sees the wheel as the last applied modifier left it.
  const { all, morphs, landing } = evaluate(segments, tricks, enabled, current)
  const winnerId = strategyFor(current.target)(landing, frozen)
  if (!winnerId) return null
  return {
    kind: 'exhausted',
    winnerId,
    depth: MAX_DEPTH,
    segments: all,
    morphs,
    motion: current.motion,
  }
}
```

- [ ] **Step 4: Run the resolver tests**

Run: `npx vitest run src/spin/resolve.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite and formatter**

Run: `npm test && npx tsc --noEmit && npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/spin/resolve.ts src/spin/resolve.test.ts
git commit -m "feat(spin): resolve scripted spins through a branch tree

A strict descent: each node's condition is tested against the landing as
the modifiers applied so far leave it, and the walk never re-scans a level
it has left. That is what makes it terminate by construction.

The random roll is frozen for the whole resolution, so every change in
winner is caused by a modifier rather than a fresh draw."
```

---

### Task 8: Spin through the resolver

The last wire. `useSpin.spin()` gains an override so a resolved spin can supply its own segments, config, and winner for one spin without changing the hook's props.

**Files:**
- Modify: `src/wheel/useSpin.ts:11-18,69-140`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

The override plumbing is what this task adds, so that is what gets tested. It goes in `src/wheel/useSpin.test.ts`, which already has the animation harness. Add `forced` to that file's imports from `./selection`, and `Segment` to its type imports if not already present.

```ts
  it('spins the override segments, config, and strategy instead of the props', async () => {
    const alternate: Segment[] = [
      { id: 'x', label: 'Xan', weight: 1 },
      { id: 'y', label: 'Yun', weight: 1 },
    ]
    const { result } = renderSpin({ ...PLAIN, fullSpins: 6 })
    act(() => {
      result.current.spin({
        segments: alternate,
        config: { ...PLAIN, fullSpins: 2 },
        strategy: forced('y'),
      })
    })

    // The override config drove the rotation, not the prop config's 6 turns.
    const { keyframes } = harness.animateCalls[0]
    const travelled = degreesOf(keyframes[1]) - degreesOf(keyframes[0])
    expect(travelled).toBeGreaterThanOrEqual(2 * 360)
    expect(travelled).toBeLessThan(3 * 360)

    await act(async () => {
      harness.animateCalls[0].finish()
    })
    // And the winner came from the override segments, which the props never had.
    expect(result.current.winnerId).toBe('y')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — TypeScript rejects the object argument, because `spin` currently takes a `SelectionStrategy`.

- [ ] **Step 3: Add the spin override to `useSpin`**

Replace `src/wheel/useSpin.ts:11-18`:

```ts
/**
 * Per-spin overrides. A resolved scripted spin supplies its own segments,
 * config, and winner for one spin without changing the hook's props — which
 * keeps `useSpin` ignorant of branching.
 */
export type SpinOverride = {
  segments?: Segment[]
  config?: SpinConfig
  strategy?: SelectionStrategy
}

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  isSpinning: boolean
  winnerId: string | null
  spin: (override?: SpinOverride) => void
  rotorRef: RefObject<SVGGElement | null>
}
```

Replace the opening of the `spin` callback at `src/wheel/useSpin.ts:69-82`:

```ts
  const spin = useCallback(
    (override: SpinOverride = {}) => {
      if (spinningRef.current) return
      const rotor = rotorRef.current
      if (!rotor) return

      const spinSegments = override.segments ?? segments
      const spinConfig = override.config ?? config
      const strategy = override.strategy ?? weightedRandom

      const plan = planSpin(spinSegments, spinConfig, strategy, cryptoRng)
      if (!plan) return

      stopTracks()
      spinningRef.current = true
      setIsSpinning(true)
      setWinnerId(null)
      setDisplaySegments(spinSegments)
```

Then replace every remaining `config.` and `segments` reference inside the callback body with the locals. Specifically:

- Line 85: `const durationMs = reduceMotion ? REDUCED_MOTION_MS : spinConfig.durationMs`
- The delta block from Task 2: `spinConfig.direction` and `spinConfig.fullSpins`
- Line 96: `{ duration: durationMs, easing: spinConfig.easing, fill: 'forwards' }`
- Line 101: `if (spinConfig.morphs.length > 0 && durationMs > 0) {`
- Line 109: `const morphElapsed = (elapsed / durationMs) * spinConfig.durationMs`
- Line 110: `setDisplaySegments(applyMorphs(spinSegments, spinConfig.morphs, morphElapsed))`

The dependency array on line 139 stays `[segments, config, onLanded, stopTracks]` — the overrides arrive as arguments, not closure state.

- [ ] **Step 4: Resolve on click in `App.tsx`**

Add to the imports at the top of `src/App.tsx`:

```tsx
import { useCallback } from 'react'
import { resolveScriptedSpin } from './spin/resolve'
import { cryptoRng } from './wheel/selection'
import { forced } from './wheel/selection'
```

Merge `useCallback` into the existing `react` import rather than adding a second one, and merge the two `selection` imports into `import { cryptoRng, forced } from './wheel/selection'`.

Add after the `useSpin` call at `src/App.tsx:31-34`:

```tsx
  const onSpin = useCallback(() => {
    const resolution = resolveScriptedSpin(
      preset.segments,
      preset.tricks,
      preset.spin,
      preset.branches,
      cryptoRng,
    )
    if (!resolution) return
    spin({
      segments: resolution.segments,
      config: {
        durationMs: resolution.motion.durationMs,
        fullSpins: resolution.motion.turns,
        direction: resolution.motion.direction,
        easing: resolution.motion.easing,
        morphs: resolution.morphs,
      },
      // Resolution already decided who wins; planSpin still decides where in
      // the arc to stop. forced() degrades to a fair draw if that segment's arc
      // collapsed, which is the safety net for a branch that zeroes its winner.
      strategy: forced(resolution.winnerId),
    })
  }, [preset, spin])
```

Replace the button handler at `src/App.tsx:47`:

```tsx
          onClick={onSpin}
```

- [ ] **Step 5: Run the useSpin tests**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts src/App.tsx
git commit -m "feat(app): spin through the branch resolver

useSpin gains a per-spin override so a resolved scripted spin can supply
its own segments, config, and winner without changing the hook's props.
The hook still knows nothing about branching."
```

---

## Notes for the implementer

**The editor still cannot author branches.** After Task 8 a branch tree only reaches the app through hand-edited JSON or an imported preset. That is expected — the authoring UI is a separate plan. `PresetIo` already round-trips whatever `parsePreset` accepts, so import/export works without changes.

**Display segments after a branch enables a trick.** `App` passes render-time `resolved.segments` to `useSpin`, computed from the baseline `enabled` flags. If a branch enables a trick that provides a wedge, the override segments contain that wedge but the hook's prop does not. The landed frame shows it correctly; a later prop change resyncs and it disappears, which is right — the trick is not baseline-enabled.

**Do not add cycle detection.** It is tempting when reading `MAX_DEPTH`, but inline replacements make cycles unauthorable. The `exhausted` arm exists to keep the cap observable for a future feature, not to catch loops today.

**Known test gap: no end-to-end spin through `App`.** `src/App.test.tsx` never spins — jsdom provides no `Element.prototype.animate`, and the harness that stubs it (`installHarness`) is a private local in `src/wheel/useSpin.test.ts`. So the chain "click Spin → resolve branches → animate the right winner" is covered in two halves (resolver unit tests in Task 7, override plumbing in Task 8) plus `tsc` on the join, but not as one path.

Closing it means extracting `installHarness` into a shared test helper — say `src/wheel/testing/animation.ts` — and importing it from both files. That is a worthwhile follow-up but it is test infrastructure, not this feature, and doing it inside Task 8 would mix a refactor into the riskiest commit. Do it separately if you want the coverage.
