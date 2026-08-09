# Endless Spin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wheel that cruises at a dead-steady speed for as long as the operator asks, then breaks into the winner without a visible change of pace at the handover — plus the editor panel that makes duration, turns, direction, and the settle authorable at all.

**Architecture:** The rotation stops being two keyframes with one easing and becomes a `RotationTrack` — a pure function of `(from, restingDeg, motion)` that emits either today's two keyframes or three with per-keyframe easing. Speed continuity is solved for rather than tuned: the settle curve's initial slope `y1/x1` fixes how much ground the settle covers, the requested turn count absorbs whatever the speed solve wants, and the final keyframe is still exactly the angle `planSpin` asked for. Easings stop being CSS strings and become `Curve` tuples (four control points) everywhere between the parse boundary and the Web Animations API, because the slope question cannot be asked of the string `"ease-out"`.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Biome, `@weasel-js/labkit` for editor chrome. Design spec: `docs/superpowers/specs/2026-08-07-endless-spin-design.md`.

**Commands:** `npm test` runs the suite once. `npx vitest run <path>` runs one file. `npm run build` typechecks (`tsc --noEmit`) then builds. `npm run check` runs Biome with `--write`.

**Conventions in this codebase, which you should follow:**
- Parsers in `src/preset/storage.ts` are defensive: malformed stored data is dropped or defaulted, never thrown on. Loading must never crash.
- Comments explain *why*, not *what*, and only where the reason is non-obvious. Do not narrate code.
- Tests are colocated: `foo.ts` → `foo.test.ts`.
- Property lookups on data that came from `localStorage` use `Object.hasOwn`, never a bare index (see `getRecipe` in `src/tricks/registry.ts`).
- Biome's recommended rules are on, which includes `performance/noDelete` — build a new object rather than deleting a key.
- Run `npm run check` before committing; Biome will reformat.

**Two things this plan deliberately does not do**, both from the design's "Not in this design":
- No curve editing in the panel. Curves are stored structurally so that ships later without a migration.
- No wind-up phase before the cruise. The three-keyframe track already subsumes it.

**One consequence worth knowing before you start:** in the settle path the cruise interval is `linear` by construction — that is what makes the handover solvable — so `motion.easing` governs only the no-settle path. Do not "fix" this by feeding `easing` into the first interval.

---

### Task 1: `Curve`, and a parser that reads the legacy string forms

Four numbers, parsed from whatever a stored preset carries. Nothing else changes yet: this task is purely additive.

**Files:**
- Modify: `src/wheel/types.ts` (add the `Curve` type)
- Create: `src/wheel/curve.ts`
- Create: `src/wheel/curve.test.ts`

- [ ] **Step 1: Add the `Curve` type**

In `src/wheel/types.ts`, insert directly above the existing `export type EasingName` line:

```ts
/** CSS cubic-bezier control points, in the order CSS writes them: x1, y1, x2, y2. */
export type Curve = [number, number, number, number]
```

- [ ] **Step 2: Write the failing test**

Create `src/wheel/curve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTLE_CURVE, cssCurve, initialSlope, isSettleCurve, parseCurve } from './curve'
import type { Curve } from './types'

describe('parseCurve', () => {
  it('reads every CSS keyword an older preset could be carrying', () => {
    expect(parseCurve('linear')).toEqual([0, 0, 1, 1])
    expect(parseCurve('ease')).toEqual([0.25, 0.1, 0.25, 1])
    expect(parseCurve('ease-in')).toEqual([0.42, 0, 1, 1])
    expect(parseCurve('ease-out')).toEqual([0, 0, 0.58, 1])
    expect(parseCurve('ease-in-out')).toEqual([0.42, 0, 0.58, 1])
  })

  it('reads a cubic-bezier string', () => {
    expect(parseCurve('cubic-bezier(0.1, 0.8, 0.2, 1)')).toEqual([0.1, 0.8, 0.2, 1])
  })

  it('reads the array form, which is what an exported preset now carries', () => {
    expect(parseCurve([0.33, 1, 0.68, 1])).toEqual([0.33, 1, 0.68, 1])
  })

  it('clamps x into the unit interval and leaves y alone', () => {
    // Overshoot is a feature: a y past 1 carries the wheel beyond the winner
    // and drifts back. CSS only constrains x, and so does this.
    expect(parseCurve([-1, -0.5, 2, 1.4])).toEqual([0, -0.5, 1, 1.4])
  })

  it('hands back a fresh tuple, so a caller cannot poison the keyword table', () => {
    const parsed = parseCurve('linear') as Curve
    parsed[0] = 0.5
    expect(parseCurve('linear')).toEqual([0, 0, 1, 1])
  })

  it('rejects anything it cannot read', () => {
    expect(parseCurve('steps(4)')).toBeNull()
    expect(parseCurve('cubic-bezier(0.1, 0.8)')).toBeNull()
    expect(parseCurve('cubic-bezier(a, b, c, d)')).toBeNull()
    expect(parseCurve([0.1, 0.8, 0.2])).toBeNull()
    expect(parseCurve([0.1, 0.8, 0.2, Number.NaN])).toBeNull()
    expect(parseCurve(undefined)).toBeNull()
    expect(parseCurve(42)).toBeNull()
  })

  it('does not resolve a stored name up the prototype chain', () => {
    expect(parseCurve('constructor')).toBeNull()
    expect(parseCurve('toString')).toBeNull()
  })
})

describe('initialSlope', () => {
  it('is y1 over x1 in the ordinary case', () => {
    expect(initialSlope([0.33, 1, 0.68, 1])).toBeCloseTo(1 / 0.33, 9)
  })

  it('falls through to the second control point when the first sits on the origin', () => {
    // ease-out is exactly this case, and y1/x1 would be 0/0.
    expect(initialSlope([0, 0, 0.58, 1])).toBeCloseTo(1 / 0.58, 9)
  })

  it('is 1 when both control points sit on the origin', () => {
    expect(initialSlope([0, 0, 0, 0])).toBe(1)
  })
})

describe('isSettleCurve', () => {
  it('accepts a curve with a positive finite handover speed', () => {
    expect(isSettleCurve(DEFAULT_SETTLE_CURVE)).toBe(true)
    expect(isSettleCurve([0, 0, 0.58, 1])).toBe(true)
  })

  it('rejects the slopes that would make the solve divide by zero or run backwards', () => {
    // Flat start: the settle would have to cover infinite ground.
    expect(isSettleCurve([0.5, 0, 0.68, 1])).toBe(false)
    // Backwards.
    expect(isSettleCurve([0.5, -0.2, 0.68, 1])).toBe(false)
    // Vertical start: an instant stop, which is the stutter this design exists
    // to avoid rather than an aggressive settle.
    expect(isSettleCurve([0, 1, 0.68, 1])).toBe(false)
  })
})

describe('cssCurve', () => {
  it('serializes to the string the Web Animations API takes', () => {
    expect(cssCurve([0.33, 1, 0.68, 1])).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('round-trips through the parser', () => {
    const curve: Curve = [0.1, 0.8, 0.2, 1]
    expect(parseCurve(cssCurve(curve))).toEqual(curve)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/wheel/curve.test.ts`
Expected: FAIL — `Failed to resolve import "./curve"`.

- [ ] **Step 4: Write the implementation**

Create `src/wheel/curve.ts`:

```ts
import type { Curve } from './types'

/** The settle the design defaults to: k ≈ 0.33, so the break covers about a third of the ground. */
export const DEFAULT_SETTLE_CURVE: Curve = [0.33, 1, 0.68, 1]

const KEYWORDS: Record<string, Curve> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
}

const CUBIC_BEZIER = /^cubic-bezier\(([^)]*)\)$/

/** CSS pins x to the unit interval and leaves y free, which is what allows overshoot. */
const clampX = (n: number): number => Math.min(1, Math.max(0, n))

function fromNumbers(values: number[]): Curve | null {
  if (values.length !== 4 || !values.every((n) => Number.isFinite(n))) return null
  return [clampX(values[0]), values[1], clampX(values[2]), values[3]]
}

export function parseCurve(value: unknown): Curve | null {
  if (Array.isArray(value)) {
    return fromNumbers(value.map((n) => (typeof n === 'number' ? n : Number.NaN)))
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  // Object.hasOwn, not a bare lookup: this reads stored JSON, and a stored
  // 'constructor' would otherwise resolve up the prototype chain to a function.
  // Spread, so the table cannot be mutated through a returned tuple.
  if (Object.hasOwn(KEYWORDS, text)) return [...KEYWORDS[text]]
  const match = CUBIC_BEZIER.exec(text)
  if (!match) return null
  return fromNumbers(match[1].split(',').map((part) => Number.parseFloat(part)))
}

/**
 * Progress per unit time at t = 0. A cubic Bézier's tangent at the origin points
 * from P0 toward P1; when P1 sits on P0 it points toward P2 instead, which is
 * the only reason `ease-out` does not come out as 0/0.
 */
export function initialSlope(curve: Curve): number {
  const [x1, y1, x2, y2] = curve
  if (x1 !== 0 || y1 !== 0) return y1 / x1
  if (x2 !== 0 || y2 !== 0) return y2 / x2
  return 1
}

/** Whether a curve has a handover speed to match. Zero, negative, or infinite has none. */
export function isSettleCurve(curve: Curve): boolean {
  const slope = initialSlope(curve)
  return Number.isFinite(slope) && slope > 0
}

export function cssCurve([x1, y1, x2, y2]: Curve): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/wheel/curve.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/wheel/curve.ts src/wheel/curve.test.ts src/wheel/types.ts
git commit -m "feat(wheel): store easings as control points, not CSS strings"
```

---

### Task 2: `rotationTrack`, where the speed continuity is solved

The whole design in one pure function. It does not know about React, the mutex, the morph tick, or reduced motion — the caller passes an effective duration and this scales the settle to match.

**Files:**
- Modify: `src/wheel/types.ts` (add the `Settle` type)
- Create: `src/wheel/rotation.ts`
- Create: `src/wheel/rotation.test.ts`

- [ ] **Step 1: Add the `Settle` type**

In `src/wheel/types.ts`, directly below the `Curve` type added in Task 1:

```ts
/** A cruise that breaks into a stop. `ms` is how long the break lasts. */
export type Settle = { ms: number; curve: Curve }
```

- [ ] **Step 2: Write the failing test**

Create `src/wheel/rotation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTLE_CURVE, parseCurve } from './curve'
import { type RotationSpec, type RotationTrack, rotationTrack } from './rotation'
import type { Curve } from './types'

const SPEC: RotationSpec = {
  durationMs: 4000,
  fullSpins: 5,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
}

const WITH_SETTLE: RotationSpec = { ...SPEC, settle: { ms: 1000, curve: DEFAULT_SETTLE_CURVE } }

/** The resting angle the plan asked for, plus the revolutions, for a cw spin from 0. */
const LANDING = 5 * 360 + 90

const degreesOf = (keyframe: Keyframe): number =>
  Number(/rotate\((-?[\d.]+(?:e[+-]?\d+)?)deg\)/i.exec(String(keyframe.transform))?.[1])

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360

/** y at x for a CSS cubic-bezier, by bisection on the parametric x. */
function bezierY(curve: Curve, x: number): number {
  const [x1, y1, x2, y2] = curve
  const at = (a: number, b: number, t: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (at(x1, x2, mid) < x) lo = mid
    else hi = mid
  }
  return at(y1, y2, (lo + hi) / 2)
}

/**
 * The angle the track actually puts on screen at `ms`, per-keyframe easing
 * included. This is what makes the continuity assertion a measurement of the
 * animation rather than a restatement of the formula that produced it.
 */
function angleAt(track: RotationTrack, ms: number): number {
  const frames = track.keyframes
  const t = ms / track.durationMs
  for (let i = 0; i < frames.length - 1; i++) {
    const start = Number(frames[i].offset ?? i / (frames.length - 1))
    const end = Number(frames[i + 1].offset ?? (i + 1) / (frames.length - 1))
    if (t > end && i < frames.length - 2) continue
    const curve = parseCurve(frames[i].easing ?? 'linear') as Curve
    const from = degreesOf(frames[i])
    const to = degreesOf(frames[i + 1])
    return from + (to - from) * bezierY(curve, (t - start) / (end - start))
  }
  return degreesOf(frames[frames.length - 1])
}

describe('rotationTrack', () => {
  it('leaves the single-curve rotation alone when there is no settle', () => {
    const track = rotationTrack(0, 90, SPEC)
    expect(track.keyframes).toHaveLength(2)
    expect(track.durationMs).toBe(4000)
    expect(degreesOf(track.keyframes[0])).toBe(0)
    expect(degreesOf(track.keyframes[1])).toBe(LANDING)
    expect(track.to).toBe(LANDING)
    // The authored launch curve still governs the whole rotation here. Dropping
    // it in favor of a linear timeline would flatten every spin that has no settle.
    expect(track.easing).toBe('cubic-bezier(0.1, 0.8, 0.2, 1)')
  })

  it('resumes from wherever the last spin rested', () => {
    const track = rotationTrack(200, 90, SPEC)
    expect(degreesOf(track.keyframes[0])).toBe(200)
    // 90° is behind 200°, so reaching it costs 250° on top of the revolutions.
    expect(track.to).toBe(200 + 5 * 360 + 250)
    expect(wrap360(track.to)).toBeCloseTo(90, 9)
  })

  it('breaks a cruise into a settle and still lands on the planned angle', () => {
    const track = rotationTrack(0, 90, WITH_SETTLE)
    expect(track.keyframes).toHaveLength(3)
    expect(Number(track.keyframes[1].offset)).toBeCloseTo(3000 / 4000, 9)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
    expect(track.to).toBeCloseTo(LANDING, 6)
    // The cruise is linear by construction; only the settle bends. The launch
    // curve is deliberately unused here — a bend before the cruise would need a
    // handover of its own, which is the wind-up phase the design set aside.
    expect(track.keyframes[0].easing).toBe('cubic-bezier(0, 0, 1, 1)')
    expect(track.keyframes[1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
    expect(track.easing).toBe('cubic-bezier(0, 0, 1, 1)')
  })

  it('turns more than the requested revolutions to buy the cruise its speed', () => {
    // The turn count is what absorbs the speed solve, so the track may travel
    // further than `fullSpins` — but never less, or the wheel would look slow.
    const track = rotationTrack(0, 90, WITH_SETTLE)
    expect(track.to).toBeGreaterThanOrEqual(5 * 360)
  })

  it('hands the settle exactly the speed the cruise was holding', () => {
    // The property the whole design exists to hold. A stutter here is the joke
    // reading as a dropped frame.
    const track = rotationTrack(0, 90, WITH_SETTLE)
    const handover = 3000
    const step = 0.25
    const before = (angleAt(track, handover) - angleAt(track, handover - step)) / step
    const after = (angleAt(track, handover + step) - angleAt(track, handover)) / step
    expect(before).toBeGreaterThan(0)
    expect(after / before).toBeCloseTo(1, 2)
  })

  it('turns backwards for a counter-clockwise settle spin and lands on the same angle', () => {
    const cw = rotationTrack(0, 90, WITH_SETTLE)
    const ccw = rotationTrack(0, 90, { ...WITH_SETTLE, direction: 'ccw' })
    expect(ccw.to).toBeLessThan(0)
    expect(wrap360(ccw.to)).toBeCloseTo(wrap360(cw.to), 6)
    // The middle keyframe is on the way there, not past it — the sign trap.
    expect(degreesOf(ccw.keyframes[1])).toBeLessThan(0)
    expect(degreesOf(ccw.keyframes[1])).toBeGreaterThan(ccw.to)
  })

  it('clamps a settle longer than the spin to half of it', () => {
    const track = rotationTrack(0, 90, { ...SPEC, settle: { ms: 9000, curve: DEFAULT_SETTLE_CURVE } })
    expect(Number(track.keyframes[1].offset)).toBeCloseTo(0.5, 9)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
  })

  it('floors a zero settle to a frame rather than a zero-length interval', () => {
    const track = rotationTrack(0, 90, { ...SPEC, settle: { ms: 0, curve: DEFAULT_SETTLE_CURVE } })
    expect(Number(track.keyframes[1].offset)).toBeCloseTo((4000 - 16) / 4000, 9)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
  })

  it('keeps the settle proportional when the duration collapses', () => {
    // Reduced motion. Without scaling, a 1000ms settle swallows a 300ms spin
    // and the fake-out becomes an ordinary short spin.
    const full = rotationTrack(0, 90, WITH_SETTLE)
    const reduced = rotationTrack(0, 90, WITH_SETTLE, 300)
    expect(reduced.durationMs).toBe(300)
    expect(Number(reduced.keyframes[1].offset)).toBeCloseTo(Number(full.keyframes[1].offset), 9)
    expect(degreesOf(reduced.keyframes[2])).toBeCloseTo(LANDING, 6)
  })

  it('lands exactly on the resting angle even when the settle overshoots it', () => {
    const track = rotationTrack(0, 90, { ...SPEC, settle: { ms: 1000, curve: [0.33, 1.4, 0.68, 1] } })
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
    // And it really does go past, so the assertion above is about the landing
    // rather than about a curve that happened not to overshoot.
    expect(angleAt(track, 3500)).toBeGreaterThan(LANDING)
  })

  it('falls back to the default settle curve rather than dividing by a zero slope', () => {
    const track = rotationTrack(0, 90, { ...SPEC, settle: { ms: 1000, curve: [0.5, 0, 0.68, 1] } })
    expect(track.keyframes[1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
    expect(degreesOf(track.keyframes[1])).toBeLessThan(LANDING)
    expect(degreesOf(track.keyframes[2])).toBeCloseTo(LANDING, 6)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/wheel/rotation.test.ts`
Expected: FAIL — `Failed to resolve import "./rotation"`.

- [ ] **Step 4: Write the implementation**

Create `src/wheel/rotation.ts`:

```ts
import { DEFAULT_SETTLE_CURVE, cssCurve, initialSlope, isSettleCurve } from './curve'
import type { Curve, Direction, Settle } from './types'

/** Everything about a spin's rotation. `SpinConfig` minus the morphs. */
export type RotationSpec = {
  durationMs: number
  fullSpins: number
  direction: Direction
  easing: Curve
  settle?: Settle
}

export type RotationTrack = {
  keyframes: Keyframe[]
  durationMs: number
  /**
   * Timeline easing. Linear whenever the keyframes carry their own curves — a
   * second easing over the top would compose with both intervals and undo the
   * handover the track solved for.
   */
  easing: string
  /** The angle the last keyframe holds, which is what the caller stores as the new rest. */
  to: number
}

/** One frame at 60Hz. A zero-length interval has no speed to hand over at. */
const MIN_SETTLE_MS = 16

const LINEAR: Curve = [0, 0, 1, 1]

/**
 * The rotation for one spin, as keyframes.
 *
 * `durationMs` is the time the animation will actually run, which reduced
 * motion shortens; `spec.durationMs` is what the operator authored. The settle
 * scales by their ratio, so a shortened spin is the same spin played faster
 * rather than one whose cruise has been eaten.
 *
 * With a settle, the cruise runs at a constant speed `v` and the settle covers
 * `v·k·S`, where `k = 1/slope` of the settle curve at its start. Solving
 * `v = delta / (C + k·S)` is what makes the handover smooth by construction:
 * the settle begins at exactly the speed the cruise ended at, and the last
 * keyframe is still the angle `planSpin` asked for. The revolutions are free to
 * absorb whatever `v` the solve wants, since any whole turn lands the same angle.
 */
export function rotationTrack(
  from: number,
  restingDeg: number,
  spec: RotationSpec,
  durationMs: number = spec.durationMs,
): RotationTrack {
  const forward = (((restingDeg - from) % 360) + 360) % 360
  // The % 360 matters: without it a `forward` of exactly zero becomes a
  // spurious extra revolution.
  const backward = (360 - forward) % 360
  const delta =
    spec.direction === 'ccw'
      ? -(spec.fullSpins * 360 + backward)
      : spec.fullSpins * 360 + forward
  const to = from + delta

  if (!spec.settle) {
    return {
      keyframes: [
        { transform: `rotate(${from}deg)` },
        { transform: `rotate(${to}deg)` },
      ],
      durationMs,
      easing: cssCurve(spec.easing),
      to,
    }
  }

  const scale = spec.durationMs > 0 ? durationMs / spec.durationMs : 1
  const settleMs = Math.min(Math.max(spec.settle.ms * scale, MIN_SETTLE_MS), durationMs / 2)
  // A curve with no positive finite handover speed would divide the rotation by
  // zero or run it backwards. The parser rejects those, but a modifier or a
  // hand-built config never passed through it.
  const curve = isSettleCurve(spec.settle.curve) ? spec.settle.curve : DEFAULT_SETTLE_CURVE
  const k = 1 / initialSlope(curve)
  const cruiseMs = durationMs - settleMs
  const speed = delta / (cruiseMs + k * settleMs)
  const mid = from + speed * cruiseMs

  return {
    keyframes: [
      { offset: 0, transform: `rotate(${from}deg)`, easing: cssCurve(LINEAR) },
      { offset: cruiseMs / durationMs, transform: `rotate(${mid}deg)`, easing: cssCurve(curve) },
      { offset: 1, transform: `rotate(${to}deg)` },
    ],
    durationMs,
    easing: cssCurve(LINEAR),
    to,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/wheel/rotation.test.ts`
Expected: PASS, 11 tests. If "hands the settle exactly the speed the cruise was holding" fails, the solve is wrong — do not loosen the tolerance.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/wheel/rotation.ts src/wheel/rotation.test.ts src/wheel/types.ts
git commit -m "feat(wheel): solve the rotation track for speed continuity"
```

---

### Task 3: `Motion` and `SpinConfig` carry curves and a settle

The type flip. It has to be one commit: `easing` changes shape in two type modules, a parser, the defaults, two components, and four test files at once, and nothing typechecks in between.

**Files:**
- Modify: `src/wheel/types.ts:42-50` (`SpinConfig`)
- Modify: `src/preset/types.ts:7-14` (`Motion`)
- Modify: `src/preset/storage.ts:71-83` (`readMotion`), `:185-213` (`readModifier`)
- Modify: `src/preset/defaults.ts:49-57`
- Modify: `src/App.tsx:54-63`, `:79-92`
- Modify: `src/editor/Editor.tsx:103-112`
- Modify: `src/wheel/useSpin.ts:126-129` (serialize the curve for the animator)
- Test: `src/preset/storage.test.ts`, `src/wheel/spin.test.ts:24-30`, `src/wheel/useSpin.test.ts:41-47` and `:403-432`, `src/spin/resolve.test.ts:38-41`, `:123`, `:145`

- [ ] **Step 1: Change the two type modules**

In `src/wheel/types.ts`, replace the `SpinConfig` block:

```ts
export type SpinConfig = {
  durationMs: number
  fullSpins: number
  /** Which way the wheel turns. The pointer is fixed either way. */
  direction: Direction
  /** Serialized to a cubic-bezier string only where the Web Animations API demands one. */
  easing: Curve
  /** Absent: one curve for the whole rotation. Present: cruise, then break. */
  settle?: Settle
  morphs: Morph[]
}
```

In `src/preset/types.ts`, replace the `Motion` block, and extend its import of `../wheel/types` to bring in `Curve` and `Settle`:

```ts
import type { Curve, Direction, Segment, Settle } from '../wheel/types'
```

```ts
/** Becomes SpinConfig's motion fields at spin time; `turns` → `fullSpins`. */
export type Motion = {
  durationMs: number
  turns: number
  direction: Direction
  /** Parsed from the legacy CSS string form on read; four numbers from there on. */
  easing: Curve
  /** Absent: today's single-curve rotation, unchanged. */
  settle?: Settle
}
```

- [ ] **Step 2: Teach the parser both forms**

In `src/preset/storage.ts`, extend the existing imports:

```ts
import { DEFAULT_SETTLE_CURVE, isSettleCurve, parseCurve } from '../wheel/curve'
import type { Curve, Segment, Settle } from '../wheel/types'
```

Replace `readMotion` (currently lines 71-83) with:

```ts
/**
 * Clamped to half the duration, the same posture `readFeedDefaults` takes with
 * churn intervals. Zero is legal and means "stop dead from full speed", which
 * is a different animation from the field being absent — absent runs the old
 * single-curve rotation.
 */
function readSettle(value: unknown, durationMs: number): Settle | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.ms !== 'number' || !Number.isFinite(value.ms)) return undefined
  const curve = parseCurve(value.curve)
  return {
    ms: Math.min(Math.max(0, value.ms), durationMs / 2),
    // A curve with no positive finite slope has no handover speed to match, and
    // the solve would divide by it. Falling back beats spinning to infinity.
    curve: curve && isSettleCurve(curve) ? curve : DEFAULT_SETTLE_CURVE,
  }
}

function readCurve(value: unknown, fallback: Curve): Curve {
  return parseCurve(value) ?? fallback
}

function readMotion(value: unknown): Motion {
  const raw = isRecord(value) ? value : {}
  const fallback = DEFAULT_PRESET.spin.motion
  // Must be positive, not merely finite. Element.animate() throws
  // synchronously on a negative duration, so a hand-edited preset would crash
  // the wheel at spin time — the exact failure this module exists to prevent.
  const durationMs = readPositive(raw.durationMs, fallback.durationMs)
  const motion: Motion = {
    durationMs,
    turns: readTurns(raw.turns, fallback.turns),
    direction: raw.direction === 'ccw' ? 'ccw' : 'cw',
    easing: readCurve(raw.easing, fallback.easing),
  }
  const settle = readSettle(raw.settle, durationMs)
  if (settle) motion.settle = settle
  return motion
}
```

In `readModifier`, replace the single easing line (currently line 205):

```ts
    if (typeof rawMotion.easing === 'string') motion.easing = rawMotion.easing
```

with:

```ts
    const easing = parseCurve(rawMotion.easing)
    if (easing) motion.easing = easing
    // Unclamped, unlike readMotion: a modifier need not carry the duration to
    // clamp against, and `rotationTrack` clamps at spin time regardless.
    if (isRecord(rawMotion.settle)) {
      const ms = rawMotion.settle.ms
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        const curve = parseCurve(rawMotion.settle.curve)
        motion.settle = {
          ms: Math.max(0, ms),
          curve: curve && isSettleCurve(curve) ? curve : DEFAULT_SETTLE_CURVE,
        }
      }
    }
```

- [ ] **Step 3: Update the default preset**

In `src/preset/defaults.ts`, replace the easing line inside `spin.motion`:

```ts
      easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
```

with:

```ts
      easing: [0.1, 0.8, 0.2, 1],
```

- [ ] **Step 4: Pass the settle through both windows, and serialize for the animator**

In `src/App.tsx`, the `config` memo becomes:

```ts
  const config = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.motion.durationMs,
      fullSpins: preset.spin.motion.turns,
      direction: preset.spin.motion.direction,
      easing: preset.spin.motion.easing,
      settle: preset.spin.motion.settle,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )
```

and the override config inside `onSpin`:

```ts
      config: {
        durationMs: resolution.motion.durationMs,
        fullSpins: resolution.motion.turns,
        direction: resolution.motion.direction,
        easing: resolution.motion.easing,
        settle: resolution.motion.settle,
        morphs: resolution.morphs,
      },
```

In `src/editor/Editor.tsx`, the `spinConfig` memo:

```ts
  const spinConfig = useMemo<SpinConfig>(
    () => ({
      durationMs: preset.spin.motion.durationMs,
      fullSpins: preset.spin.motion.turns,
      direction: preset.spin.motion.direction,
      easing: preset.spin.motion.easing,
      settle: preset.spin.motion.settle,
      morphs: resolved.morphs,
    }),
    [preset.spin, resolved.morphs],
  )
```

And in `src/wheel/useSpin.ts`, serialize at the one place that still wants a string — the Web Animations API. Add the import:

```ts
import { cssCurve } from './curve'
```

and change the animate options (currently line 128):

```ts
        { duration: durationMs, easing: spinConfig.easing, fill: 'forwards' },
```
to
```ts
        { duration: durationMs, easing: cssCurve(spinConfig.easing), fill: 'forwards' },
```

This is a stopgap that Task 4 replaces wholesale; without it the flip does not typecheck, since `KeyframeAnimationOptions.easing` is a string.

- [ ] **Step 5: Update the fixtures the flip breaks**

`src/wheel/spin.test.ts`, in the `config` literal:

```ts
  easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
```
becomes
```ts
  easing: [0.1, 0.8, 0.2, 1],
```

`src/wheel/useSpin.test.ts`, in the `MORPHING` literal (the `Morph` fixtures above it keep their `easing: 'easeIn'` — `Morph.easing` is an `EasingName` and is untouched by this work):

```ts
  easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
```
becomes
```ts
  easing: [0.1, 0.8, 0.2, 1],
```

and in the test named `takes duration, easing, direction, revolutions, and morphs from the override config`:

```ts
          easing: 'linear',
```
becomes
```ts
          easing: [0, 0, 1, 1],
```

```ts
    expect(options.easing).toBe('linear')
```
becomes
```ts
    expect(options.easing).toBe('cubic-bezier(0, 0, 1, 1)')
```

`src/spin/resolve.test.ts`, three sites:

```ts
  motion: { durationMs: 4000, turns: 5, direction: 'cw', easing: 'linear' },
```
becomes
```ts
  motion: { durationMs: 4000, turns: 5, direction: 'cw', easing: [0, 0, 1, 1] },
```

```ts
            motion: { durationMs: 1000, turns: 2, direction: 'ccw', easing: 'ease-out' },
```
becomes
```ts
            motion: { durationMs: 1000, turns: 2, direction: 'ccw', easing: [0, 0, 0.58, 1] },
```

```ts
    expect(result?.motion.easing).toBe('linear')
```
becomes
```ts
    expect(result?.motion.easing).toEqual([0, 0, 1, 1])
```

`src/preset/storage.test.ts`, in the v1 migration tests:

```ts
      motion: { durationMs: 4500, turns: 6, direction: 'cw', easing: 'linear' },
```
becomes
```ts
      motion: { durationMs: 4500, turns: 6, direction: 'cw', easing: [0, 0, 1, 1] },
```

```ts
    expect(parsed.spin.motion.easing).toBe('ease-in')
```
becomes
```ts
    expect(parsed.spin.motion.easing).toEqual([0.42, 0, 1, 1])
```

The two v1 fixtures themselves keep their `easing: 'linear'` / `easing: 'ease-in'` strings — a stored preset carrying the string form still parsing is exactly the migration story under test.

- [ ] **Step 6: Add the new parser tests**

Append these to the `describe('parsePreset', …)` block in `src/preset/storage.test.ts`, next to the other spin tests:

```ts
  it('reads the array form its own export writes', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, easing: [0.2, 0.9, 0.3, 1] },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.easing).toEqual([0.2, 0.9, 0.3, 1])
  })

  it('falls back to the default curve for an easing it cannot read', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, easing: 'steps(4)' },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.easing).toEqual(
      DEFAULT_PRESET.spin.motion.easing,
    )
  })

  it('reads a settle', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: {
          ...DEFAULT_PRESET.spin.motion,
          settle: { ms: 800, curve: 'ease-out' },
        },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle).toEqual({
      ms: 800,
      curve: [0, 0, 0.58, 1],
    })
  })

  it('clamps a settle longer than half the spin', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { durationMs: 4000, turns: 6, direction: 'cw', easing: 'linear', settle: { ms: 9000 } },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle?.ms).toBe(2000)
  })

  it('keeps a zero settle, which is not the same as having none', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, settle: { ms: 0 } },
      },
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.spin.motion.settle?.ms).toBe(0)
    expect(parsed.spin.motion.settle?.curve).toEqual([0.33, 1, 0.68, 1])
  })

  it('drops a settle with no usable length', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, settle: { curve: 'ease-out' } },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle).toBeUndefined()
  })

  it('replaces a settle curve with no handover speed', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: {
          ...DEFAULT_PRESET.spin.motion,
          // Flat at the start: the solve would ask the settle to cover
          // infinite ground.
          settle: { ms: 500, curve: [0.5, 0, 0.68, 1] },
        },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle?.curve).toEqual([0.33, 1, 0.68, 1])
  })

  it('reads a settle out of a branch modifier', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'stall',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          do: { kind: 'modify', modifier: { motion: { settle: { ms: 400, curve: 'ease-out' } } } },
        },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    const action = parsed.branches[0].do
    expect(action?.kind).toBe('modify')
    expect(action?.kind === 'modify' ? action.modifier.motion?.settle : null).toEqual({
      ms: 400,
      curve: [0, 0, 0.58, 1],
    })
  })
```

- [ ] **Step 7: Run the whole suite and the typecheck**

Run: `npm test`
Expected: PASS. The one behavior that must not have changed is `round-trips a valid preset` — the default preset now stores its easing as four numbers and must survive a JSON round trip.

Run: `npm run build`
Expected: no type errors. A leftover `easing: string` anywhere shows up here.

- [ ] **Step 8: Commit**

```bash
npm run check
git add -A
git commit -m "feat(preset): store motion curves as control points and author a settle"
```

---

### Task 4: `useSpin` animates the track

The angle arithmetic leaves the hook. What is left behind is the mutex, the morph tick, and the lifecycle — none of which this task touches.

**Files:**
- Modify: `src/wheel/useSpin.ts:108-131`, `:157-160`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/wheel/useSpin.test.ts`. First, a fixture next to the existing `PLAIN`:

```ts
const SETTLING: SpinConfig = { ...PLAIN, settle: { ms: 1000, curve: [0.33, 1, 0.68, 1] } }
```

Then these tests inside `describe('useSpin', …)`:

```ts
  it('cruises then breaks when the motion carries a settle', () => {
    const { result } = renderSpin(SETTLING)
    act(() => {
      result.current.spin()
    })

    const { keyframes, options } = harness.animateCalls[0]
    expect(keyframes).toHaveLength(3)
    // The timeline must not ease: the keyframes carry their own curves, and a
    // second easing over the top would warp both intervals and break the handover.
    expect(options.easing).toBe('cubic-bezier(0, 0, 1, 1)')
    expect(Number(keyframes[1].offset)).toBeCloseTo((DURATION_MS - 1000) / DURATION_MS, 9)
    expect(keyframes[1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('keeps a settle proportional to a reduced-motion duration', () => {
    harness.setReducedMotion(true)
    const { result } = renderSpin(SETTLING)
    act(() => {
      result.current.spin()
    })

    const { keyframes, options } = harness.animateCalls[0]
    expect(options.duration).toBe(REDUCED_MOTION_MS)
    // Scaled, not clamped: an unscaled 1000ms settle would swallow a 300ms spin
    // whole and leave no cruise for the joke to live in.
    expect(Number(keyframes[1].offset)).toBeCloseTo((DURATION_MS - 1000) / DURATION_MS, 9)
  })

  it('stores the settled resting angle for the next spin', async () => {
    const { result } = renderSpin(SETTLING)
    act(() => {
      result.current.spin()
    })
    const landedAt = degreesOf(harness.animateCalls[0].keyframes[2])
    await act(async () => {
      harness.animateCalls[0].finish()
    })
    act(() => {
      result.current.spin()
    })

    // Resuming from the middle keyframe's angle instead would start the next
    // spin a cruise-length short of where the wheel actually is.
    expect(degreesOf(harness.animateCalls[1].keyframes[0])).toBeCloseTo(wrap360(landedAt), 6)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — three failures, each reporting 2 keyframes where 3 were expected (the hook still builds its own pair and ignores `settle`).

- [ ] **Step 3: Hand the rotation to `rotationTrack`**

In `src/wheel/useSpin.ts`, swap Task 3's stopgap import for this one — `cssCurve` has no other caller here, and `noUnusedLocals` will fail the build if it stays:

```ts
import { rotationTrack } from './rotation'
```

Replace everything from the `// Continue from the resting angle:` comment through the `animationRef.current = animation` line (currently lines 111-130) with:

```ts
      // Continue from the resting angle, so the wheel does not teleport back to
      // zero before it starts turning.
      const from = rotationRef.current
      const track = rotationTrack(from, plan.restingRotationDeg, spinConfig, durationMs)

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(track.keyframes, {
        duration: track.durationMs,
        // The track decides: the authored curve when it is one interval, linear
        // when the keyframes carry their own and a second easing over the top
        // would undo the handover it solved for.
        easing: track.easing,
        fill: 'forwards',
      })
      animationRef.current = animation
```

Then in the `finished` handler, replace:

```ts
          rotationRef.current = ((to % 360) + 360) % 360
```

with:

```ts
          rotationRef.current = ((track.to % 360) + 360) % 360
```

(the comment above that line stays: `%` keeping the sign of the dividend is still the trap it describes.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS, all tests including the pre-existing direction and revolution tests — those exercise the no-settle path, which `rotationTrack` reproduces keyframe for keyframe.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts
git commit -m "feat(wheel): animate the solved rotation track"
```

---

### Task 5: `MotionPanel`

Four controls for fields that have never had any. A thirty-second fake-out is unauthorable today without hand-editing JSON.

**Files:**
- Create: `src/editor/MotionPanel.tsx`
- Create: `src/editor/MotionPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/editor/MotionPanel.test.tsx`:

```ts
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Motion } from '../preset/types'
import { MotionPanel } from './MotionPanel'

const motion: Motion = {
  durationMs: 4500,
  turns: 6,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
}

describe('MotionPanel', () => {
  it('renders a control per field', () => {
    render(<MotionPanel motion={motion} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Duration (ms)')).toHaveValue(4500)
    expect(screen.getByLabelText('Turns')).toHaveValue(6)
    expect(screen.getByLabelText('Direction')).toHaveValue('cw')
    expect(screen.getByLabelText('Settle (ms)')).toHaveValue(null)
  })

  it('writes numbers, not strings', () => {
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '30000' } })
    expect(onChange).toHaveBeenCalledWith({ ...motion, durationMs: 30000 })
  })

  it('turns the wheel the other way', async () => {
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'ccw')
    expect(onChange).toHaveBeenCalledWith({ ...motion, direction: 'ccw' })
  })

  it('starts a settle on the default curve', () => {
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '900' } })
    expect(onChange).toHaveBeenCalledWith({
      ...motion,
      settle: { ms: 900, curve: [0.33, 1, 0.68, 1] },
    })
  })

  it('keeps the authored curve when only the length changes', () => {
    const onChange = vi.fn()
    const bouncy: Motion = { ...motion, settle: { ms: 900, curve: [0.33, 1.4, 0.68, 1] } }
    render(<MotionPanel motion={bouncy} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '400' } })
    expect(onChange).toHaveBeenCalledWith({
      ...motion,
      settle: { ms: 400, curve: [0.33, 1.4, 0.68, 1] },
    })
  })

  it('clears the settle entirely when the field is emptied', async () => {
    // Absent, not zero. Zero stops the wheel dead from full speed; absent runs
    // the ordinary single-curve rotation, which is a different animation.
    const onChange = vi.fn()
    render(<MotionPanel motion={{ ...motion, settle: { ms: 900, curve: [0.33, 1, 0.68, 1] } }} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Settle (ms)'))
    expect(onChange).toHaveBeenLastCalledWith(motion)
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty('settle')
  })

  it('refuses a negative duration rather than handing one to the animator', () => {
    // Element.animate() throws synchronously on a negative duration.
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '-100' } })
    expect(onChange).toHaveBeenCalledWith({ ...motion, durationMs: 1 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/MotionPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./MotionPanel"`.

- [ ] **Step 3: Write the panel**

Create `src/editor/MotionPanel.tsx`:

```tsx
import { NumberRow, PropertyPanel, PropertyRow, SelectRow } from '@weasel-js/labkit'
import type { Motion } from '../preset/types'
import { DEFAULT_SETTLE_CURVE } from '../wheel/curve'
import type { Direction } from '../wheel/types'

export type MotionPanelProps = {
  motion: Motion
  onChange: (motion: Motion) => void
}

const DIRECTIONS: ReadonlyArray<{ value: Direction; label: string }> = [
  { value: 'cw', label: 'Clockwise' },
  { value: 'ccw', label: 'Counter-clockwise' },
]

/**
 * Rebuilt field by field rather than deleted from a copy: Biome's recommended
 * rules forbid `delete`, and an explicit shape is what makes "absent" legible
 * next to a settle of zero, which is a different animation.
 */
function withoutSettle(motion: Motion): Motion {
  return {
    durationMs: motion.durationMs,
    turns: motion.turns,
    direction: motion.direction,
    easing: motion.easing,
  }
}

export function MotionPanel({ motion, onChange }: MotionPanelProps) {
  const editSettle = (text: string) => {
    const ms = Number.parseInt(text, 10)
    if (!Number.isFinite(ms)) {
      onChange(withoutSettle(motion))
      return
    }
    onChange({
      ...motion,
      // The curve survives a length edit. Nothing in this panel can author one
      // yet, but an imported preset or a hand edit can, and retyping a number
      // must not quietly throw it away.
      settle: { ms: Math.max(0, ms), curve: motion.settle?.curve ?? DEFAULT_SETTLE_CURVE },
    })
  }

  return (
    <PropertyPanel title="Motion">
      {/* Floored at 1, not 0: Element.animate() throws synchronously on a
          negative duration, and the parser only guards data arriving by import. */}
      <NumberRow
        label="Duration (ms)"
        min={1}
        step={100}
        value={motion.durationMs}
        onChange={(next) =>
          onChange({ ...motion, durationMs: Number.isFinite(next) ? Math.max(1, next) : 1 })
        }
      />

      <NumberRow
        label="Turns"
        min={0}
        value={motion.turns}
        onChange={(next) =>
          onChange({ ...motion, turns: Number.isFinite(next) ? Math.max(0, next) : 0 })
        }
      />

      <SelectRow
        label="Direction"
        value={motion.direction}
        options={DIRECTIONS}
        onChange={(next) => onChange({ ...motion, direction: next })}
      />

      {/* A raw input rather than NumberRow: an empty field has no number to
          hold, and empty is how the operator says "no settle phase at all". */}
      <PropertyRow label="Settle (ms)">
        <input
          type="number"
          min={0}
          step={50}
          aria-label="Settle (ms)"
          value={motion.settle ? motion.settle.ms : ''}
          onChange={(event) => editSettle(event.target.value)}
        />
      </PropertyRow>
    </PropertyPanel>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/editor/MotionPanel.test.tsx`
Expected: PASS, 7 tests. If `getByLabelText('Duration (ms)')` cannot find the input, check how labkit's `NumberRow` associates its label — `RecipeForm` relies on the same association and `Editor.test.tsx` queries it by label text, so the association exists.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/editor/MotionPanel.tsx src/editor/MotionPanel.test.tsx
git commit -m "feat(editor): author duration, turns, direction, and the settle"
```

---

### Task 6: Wire the panel into the editor

Beneath `Transport` in the center column, since motion is a property of the spin rather than of the wheel or the roster.

**Files:**
- Modify: `src/editor/Editor.tsx:19-20` (import), `:171-181` (center column)
- Test: `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/editor/Editor.test.tsx`, first teach the existing spin harness to keep what it was handed. Replace the body of `Element.prototype.animate` inside `installSpinHarness` and the returned object so the harness records keyframes:

```ts
function installSpinHarness() {
  const finishers: (() => void)[] = []
  const keyframes: Keyframe[][] = []
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function animate(frames: Keyframe[] | PropertyIndexedKeyframes | null) {
    keyframes.push((Array.isArray(frames) ? frames : []) as Keyframe[])
    let settle: (animation: Animation) => void = () => undefined
    const finished = new Promise<Animation>((resolve) => {
      settle = resolve
    })
    const animation = { finished, cancel: () => undefined } as unknown as Animation
    finishers.push(() => settle(animation))
    return animation
  } as unknown as Element['animate']

  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)

  return {
    keyframes,
    async land() {
      for (const finish of finishers) finish()
      // Two ticks: one for `finished.then`, one for the state it sets.
      await act(async () => undefined)
    },
    restore() {
      Element.prototype.animate = realAnimate
      vi.unstubAllGlobals()
    },
  }
}
```

Then add to `describe('Editor integration', …)`:

```ts
  it('persists a motion edit to localStorage', async () => {
    render(<Editor />)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '30000' } })
    fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '700' } })

    const stored = parsePreset(window.localStorage.getItem(PRESET_KEY))
    expect(stored.spin.motion.durationMs).toBe(30000)
    expect(stored.spin.motion.settle).toEqual({ ms: 700, curve: [0.33, 1, 0.68, 1] })
  })
```

and to `describe('Editor spin', …)`:

```ts
  it('spins the settle the operator just authored', async () => {
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '700' } })
      await userEvent.click(screen.getByRole('button', { name: /spin with these tricks/i }))

      // Three keyframes is the cruise-then-break track; two would mean the
      // panel wrote a settle nothing downstream reads.
      expect(harness.keyframes[0]).toHaveLength(3)
      expect(harness.keyframes[0][1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
    } finally {
      harness.restore()
    }
  })
```

The file's first line currently reads `import { act, render, screen, waitFor, within } from '@testing-library/react'` — add `fireEvent` to it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/editor/Editor.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Duration (ms)`.

- [ ] **Step 3: Mount the panel**

In `src/editor/Editor.tsx`, add the import alongside the other panels:

```ts
import { MotionPanel } from './MotionPanel'
```

and add the panel directly after `<Transport … />` inside the center column:

```tsx
          <MotionPanel
            motion={preset.spin.motion}
            onChange={(motion) => update({ ...preset, spin: { ...preset.spin, motion } })}
          />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/editor/Editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS, whole suite.

Run: `npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/editor/Editor.tsx src/editor/Editor.test.tsx
git commit -m "feat(editor): put the motion panel under the transport"
```

---

### Task 7: See it, then say it works

The whole design is about something the eye judges. The suite pins the math; this is the step that confirms the joke lands.

**Files:** none — verification only.

- [ ] **Step 1: Run the app**

Run: `npm run dev`, then open the editor at `#/edit`.

- [ ] **Step 2: Author a fake-out**

Set Duration to `20000`, Turns to `30`, Settle to `900`. Click "Spin with these tricks".

Expected: the wheel holds one dead-steady speed for about nineteen seconds — no visible acceleration, no drift — and then breaks hard into a wedge. Watch the handover specifically: any hitch, stutter, or momentary speed change there is the failure this design exists to prevent, and it means the solve in `rotationTrack` is wrong rather than the tuning being off.

- [ ] **Step 3: Confirm the settle is absent by default**

Clear the Settle field. Spin again.

Expected: the ordinary spin, indistinguishable from before this branch — one easing, slowing from the start.

- [ ] **Step 4: Confirm the show window follows**

With the editor open, open the show page (`#/`) in a second window, change Duration in the editor, and spin from the show page.

Expected: the show window spins with the new duration, with nothing to apply — the preset write reaches it through the storage event.

- [ ] **Step 5: Commit nothing, report what you saw**

If any of the above did not hold, say so plainly with what you observed. Do not report the feature complete on a green suite alone.
