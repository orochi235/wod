# Wedge Entrances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wedges animate onto the wheel when they join the roster, driven by a transition registry the operator picks from.

**Architecture:** A transition is a pure function from params and a per-wedge context to presentation keyframes — opacity, scale, radial offset, rotation, aperture — which compile to a CSS transform and `clip-path` and run on the `<g>` the wheel already keys by segment id. Nothing in this plan touches weight, arc layout, or selection, so no existing behavior changes and no existing test moves.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, Web Animations API, Biome.

**Scope:** This plan covers the `enter` moment and the two wedge-scope transitions (`fade`, `fly`) from `docs/superpowers/specs/2026-08-14-transitions-design.md`. Out of scope, getting its own plan: the `exit` moment and its departing-wedge ghosts, the `spin` and `reveal` moments, and the wheel-scope transitions (`shutter`, `zoom`).

---

### Task 1: Share the field spec

`RecipeField` describes a form the editor renders. Transitions need the same
vocabulary, and neither module should import the other.

**Files:**
- Create: `src/form/fields.ts`
- Modify: `src/tricks/types.ts`

- [ ] **Step 1: Create the shared module**

Move the union out of `src/tricks/types.ts` verbatim, renamed. `src/form/fields.ts`:

```ts
/** Declarative form spec. The editor renders these; the modules that declare them never import React. */
export type Field =
  | { key: string; label: string; kind: 'slider'; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'number'; min?: number; max?: number }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'text' }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  /** Multi-select over the current segment list, resolved at render time. */
  | { key: string; label: string; kind: 'segments' }
  /**
   * One wedge, written as a bare id. Distinct from 'segments' because a recipe
   * that reads its value with `readString` cannot be handed an array, and
   * distinct from 'select' because the choices are the live wheel, not a fixed
   * list. Carries no selector tokens: the set-valued ones have no single-id
   * meaning, and '@randomExternal' would need the resolver and the frozen roll
   * plumbed through `provides`, which is a feature rather than this fix.
   */
  | { key: string; label: string; kind: 'segment' }
```

- [ ] **Step 2: Re-export from the trick types**

In `src/tricks/types.ts`, delete the `RecipeField` union and replace it with a
re-export, keeping every existing import working:

```ts
import type { Field } from '../form/fields'

export type RecipeField = Field
export type { Field }
```

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS, 604 tests. A pure move changes no behavior; if anything fails, an import was missed.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run build
npx biome check --write .
git add src/form/fields.ts src/tricks/types.ts
git commit -m "refactor(form): lift the field spec out of the trick types"
```

---

### Task 2: Render a field list, not a recipe

`RecipeForm` takes a whole `Recipe` to read one property off it. Transitions
have fields and are not recipes.

**Files:**
- Modify: `src/editor/RecipeForm.tsx:31-38`
- Modify: `src/editor/TrickLibrary.tsx` (call site)
- Test: `src/editor/RecipeForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/editor/RecipeForm.test.tsx`:

```tsx
it('renders from a bare field list, with no recipe in sight', () => {
  const onChange = vi.fn()
  render(
    <RecipeForm
      fields={[{ key: 'staggerMs', label: 'Stagger (ms)', kind: 'number', min: 0 }]}
      params={{ staggerMs: 40 }}
      segments={[]}
      onChange={onChange}
    />,
  )
  expect(screen.getByLabelText('Stagger (ms)')).toHaveValue(40)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/editor/RecipeForm.test.tsx -t 'bare field list'`
Expected: FAIL — TypeScript rejects the `fields` prop; `recipe` is required.

- [ ] **Step 3: Swap the prop**

In `src/editor/RecipeForm.tsx`, change the props and the one line that reads them:

```tsx
import type { Field } from '../form/fields'

export type RecipeFormProps = {
  fields: Field[]
  params: TrickParams
  segments: Segment[]
  onChange: (params: TrickParams) => void
}

export function RecipeForm({ fields, params, segments, onChange }: RecipeFormProps) {
```

Then replace every `recipe.fields` inside the component body with `fields`.

- [ ] **Step 4: Fix the call site**

In `src/editor/TrickLibrary.tsx`, change `recipe={recipe}` to `fields={recipe.fields}`.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. Existing `RecipeForm` tests that pass a recipe need their prop swapped the same way.

- [ ] **Step 6: Commit**

```bash
git add src/editor/RecipeForm.tsx src/editor/RecipeForm.test.tsx src/editor/TrickLibrary.tsx
git commit -m "refactor(editor): render a field list rather than a recipe"
```

---

### Task 3: Transition types and registry

**Files:**
- Create: `src/transition/types.ts`
- Create: `src/transition/registry.ts`
- Test: `src/transition/registry.test.ts`

- [ ] **Step 1: Write the types**

`src/transition/types.ts`:

```ts
import type { Field } from '../form/fields'

export type TransitionId = 'fade' | 'fly'

export type TransitionParams = Record<string, unknown>

export type TransitionScope = 'wedge' | 'wheel'

export type PresentationKeyframe = {
  /** Position within the transition's own duration, 0..1. */
  at: number
  opacity?: number
  scale?: number
  /** Radial, in wheel radii: 1 is one radius out from the hub. */
  offset?: number
  /** Which way `offset` points, degrees clockwise from 12 o'clock. Defaults to the wedge's own angle. */
  offsetAngle?: number
  /** Degrees, about the wedge's arc midpoint. */
  rotate?: number
  /** 0..1 visible extent, as a circle centered on the animated element. */
  aperture?: number
}

export type TransitionContext = {
  index: number
  count: number
  /** The wedge's arc midpoint, degrees clockwise from 12 o'clock. */
  angle: number
  durationMs: number
}

export type TransitionFrames = {
  keyframes: PresentationKeyframe[]
  delayMs: number
}

export type Transition = {
  id: TransitionId
  /** Structural. "Wedges fly in from outside", never "the big entrance". */
  name: string
  description: string
  scope: TransitionScope
  defaults: TransitionParams
  fields: Field[]
  /** Pure. The only thing that affects what actually runs. */
  frames(params: TransitionParams, ctx: TransitionContext): TransitionFrames
}

export type TransitionInstance = { id: TransitionId; params: TransitionParams }

export type Moment = 'enter' | 'exit' | 'spin' | 'reveal'

export type Transitions = Partial<Record<Moment, TransitionInstance>>
```

- [ ] **Step 2: Write the failing registry test**

`src/transition/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TRANSITION_LIST, getTransition } from './registry'

describe('getTransition', () => {
  it('finds a transition by id', () => {
    expect(getTransition('fade')?.id).toBe('fade')
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(getTransition('nope')).toBeNull()
  })

  // Ids come out of localStorage, and these resolve through the prototype chain.
  it('returns null for a prototype key', () => {
    expect(getTransition('constructor')).toBeNull()
    expect(getTransition('__proto__')).toBeNull()
    expect(getTransition('toString')).toBeNull()
  })

  it('lists every transition it can resolve', () => {
    for (const transition of TRANSITION_LIST) {
      expect(getTransition(transition.id)).toBe(transition)
    }
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/transition/registry.test.ts`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 4: Write the registry**

`src/transition/registry.ts`:

```ts
import { fade } from './transitions/fade'
import { fly } from './transitions/fly'
import type { Transition, TransitionId } from './types'

export const TRANSITIONS: Record<TransitionId, Transition> = { fade, fly }

export const TRANSITION_LIST: Transition[] = [fade, fly]

/**
 * Returns null rather than throwing, matching getRecipe: ids come out of
 * localStorage, and a stored id of 'constructor' or '__proto__' resolves
 * through the prototype chain to something that is not a transition.
 */
export function getTransition(id: string): Transition | null {
  return Object.hasOwn(TRANSITIONS, id) ? TRANSITIONS[id as TransitionId] : null
}
```

This does not compile until Task 4 and Task 5 create the two transitions. Write it now and let it stay red until then.

- [ ] **Step 5: Commit after Task 5 goes green**

The registry has no green state on its own; its commit rides along with `fly`.

---

### Task 4: The fade transition

**Files:**
- Create: `src/transition/transitions/fade.ts`
- Test: `src/transition/transitions/fade.test.ts`

- [ ] **Step 1: Write the failing test**

`src/transition/transitions/fade.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TransitionContext } from '../types'
import { fade } from './fade'

const ctx = (patch: Partial<TransitionContext> = {}): TransitionContext => ({
  index: 0,
  count: 5,
  angle: 0,
  durationMs: 400,
  ...patch,
})

describe('fade', () => {
  it('runs opacity from nothing to full', () => {
    expect(fade.frames(fade.defaults, ctx()).keyframes).toEqual([
      { at: 0, opacity: 0 },
      { at: 1, opacity: 1 },
    ])
  })

  it('staggers by position, so the first wedge waits for nothing', () => {
    expect(fade.frames({ staggerMs: 50 }, ctx({ index: 0 })).delayMs).toBe(0)
    expect(fade.frames({ staggerMs: 50 }, ctx({ index: 3 })).delayMs).toBe(150)
  })

  // Params arrive from localStorage and may be anything at all.
  it('falls back rather than emitting NaN', () => {
    expect(fade.frames({ staggerMs: 'soon' }, ctx({ index: 2 })).delayMs).toBe(80)
  })

  it('touches no geometry property', () => {
    for (const frame of fade.frames(fade.defaults, ctx()).keyframes) {
      expect(frame.offset).toBeUndefined()
      expect(frame.scale).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/transition/transitions/fade.test.ts`
Expected: FAIL — cannot resolve `./fade`.

- [ ] **Step 3: Write the transition**

`src/transition/transitions/fade.ts`:

```ts
import { readNumber } from '../../tricks/params'
import type { Transition } from '../types'

const STAGGER_MS = 40

export const fade: Transition = {
  id: 'fade',
  name: 'Wedges fade in',
  description: 'Opacity only. What every transition becomes under reduced motion.',
  scope: 'wedge',
  defaults: { durationMs: 400, staggerMs: STAGGER_MS },
  fields: [
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
  ],
  frames(params, ctx) {
    return {
      keyframes: [
        { at: 0, opacity: 0 },
        { at: 1, opacity: 1 },
      ],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
    }
  },
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/transition/transitions/fade.test.ts`
Expected: PASS, 4 tests.

---

### Task 5: The fly transition

**Files:**
- Create: `src/transition/transitions/fly.ts`
- Test: `src/transition/transitions/fly.test.ts`

- [ ] **Step 1: Write the failing test**

`src/transition/transitions/fly.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TransitionContext } from '../types'
import { fly } from './fly'

const ctx = (patch: Partial<TransitionContext> = {}): TransitionContext => ({
  index: 0,
  count: 5,
  angle: 90,
  durationMs: 500,
  ...patch,
})

describe('fly', () => {
  it('arrives from outside and lands at rest', () => {
    const [first, last] = fly.frames({ distance: 1.6 }, ctx()).keyframes
    expect(first.offset).toBe(1.6)
    expect(first.opacity).toBe(0)
    expect(last.offset).toBe(0)
    expect(last.opacity).toBe(1)
  })

  // The default direction is the wedge's own side, which the emitter supplies.
  it('leaves the direction alone when flying in from its own side', () => {
    for (const frame of fly.frames({ from: 'side' }, ctx()).keyframes) {
      expect(frame.offsetAngle).toBeUndefined()
    }
  })

  it('flies in from twelve o clock when told to', () => {
    expect(fly.frames({ from: 'top' }, ctx()).keyframes[0].offsetAngle).toBe(0)
  })

  // Same index, same direction, every run: a re-render must not reshuffle it.
  it('is stable for a random direction', () => {
    const once = fly.frames({ from: 'random' }, ctx({ index: 4 })).keyframes[0].offsetAngle
    const twice = fly.frames({ from: 'random' }, ctx({ index: 4 })).keyframes[0].offsetAngle
    expect(once).toBe(twice)
    expect(fly.frames({ from: 'random' }, ctx({ index: 5 })).keyframes[0].offsetAngle).not.toBe(once)
  })

  it('deals out of the hub on a negative distance', () => {
    expect(fly.frames({ distance: -0.1 }, ctx()).keyframes[0].offset).toBe(-0.1)
  })

  it('tumbles only on the way in', () => {
    const frames = fly.frames({ tumbleDeg: 360 }, ctx()).keyframes
    expect(frames[0].rotate).toBe(360)
    expect(frames[frames.length - 1].rotate).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/transition/transitions/fly.test.ts`
Expected: FAIL — cannot resolve `./fly`.

- [ ] **Step 3: Write the transition**

`src/transition/transitions/fly.ts`:

```ts
import { readNumber, readString } from '../../tricks/params'
import type { PresentationKeyframe, Transition, TransitionContext } from '../types'

const DISTANCE = 1.6
const STAGGER_MS = 60

/**
 * Deterministic in the wedge's position, never Math.random: a re-render must
 * not send a wedge that is already in flight off in a new direction.
 */
function scatter(index: number): number {
  return (index * 137.508) % 360
}

function directionOf(params: Record<string, unknown>, ctx: TransitionContext): number | undefined {
  switch (readString(params, 'from', 'side')) {
    case 'top':
      return 0
    case 'random':
      return scatter(ctx.index)
    default:
      // Absent means the wedge's own angle, which only the emitter knows.
      return undefined
  }
}

export const fly: Transition = {
  id: 'fly',
  name: 'Wedges fly in from outside',
  description: 'Each wedge travels in along a radius and settles into its arc.',
  scope: 'wedge',
  defaults: { distance: DISTANCE, from: 'side', tumbleDeg: 0, staggerMs: STAGGER_MS, durationMs: 500 },
  fields: [
    { key: 'distance', label: 'Distance (radii)', kind: 'slider', min: -1, max: 3, step: 0.1 },
    {
      key: 'from',
      label: 'Comes from',
      kind: 'select',
      options: [
        { value: 'side', label: 'Its own side' },
        { value: 'top', label: 'The top' },
        { value: 'random', label: 'Anywhere' },
      ],
    },
    { key: 'tumbleDeg', label: 'Tumble (deg)', kind: 'slider', min: 0, max: 720, step: 15 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
  ],
  frames(params, ctx) {
    const offsetAngle = directionOf(params, ctx)
    const from: PresentationKeyframe = {
      at: 0,
      opacity: 0,
      scale: 0.9,
      offset: readNumber(params, 'distance', DISTANCE),
      rotate: readNumber(params, 'tumbleDeg', 0),
    }
    if (offsetAngle !== undefined) from.offsetAngle = offsetAngle

    return {
      keyframes: [from, { at: 1, opacity: 1, scale: 1, offset: 0, rotate: 0 }],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
    }
  },
}
```

- [ ] **Step 4: Run the transition and registry tests**

Run: `npx vitest run src/transition`
Expected: PASS — fade, fly, and the registry from Task 3 all resolve now.

- [ ] **Step 5: Commit**

```bash
npx biome check --write .
git add src/transition
git commit -m "feat(transition): add a registry with fade and fly"
```

---

### Task 6: Compile keyframes to CSS

The one piece that turns five abstract properties into something a browser runs.
Pure, so it carries the heaviest tests in this plan.

**Files:**
- Create: `src/transition/css.ts`
- Test: `src/transition/css.test.ts`

- [ ] **Step 1: Write the failing test**

`src/transition/css.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toKeyframes, transformOf } from './css'

const target = { angle: 90, radius: 200, pivot: 120 }

describe('transformOf', () => {
  it('is the identity when a frame moves nothing', () => {
    expect(transformOf({ at: 0 }, target)).toBe('none')
  })

  // Out along the wedge's own angle: rotate into its frame, move, rotate back.
  it('pushes a wedge out along its own angle', () => {
    expect(transformOf({ at: 0, offset: 1.5 }, target)).toBe(
      'rotate(90) translate(0 -300) rotate(-90)',
    )
  })

  it('honors an explicit direction over the wedge angle', () => {
    expect(transformOf({ at: 0, offset: 1, offsetAngle: 0 }, target)).toBe(
      'rotate(0) translate(0 -200) rotate(0)',
    )
  })

  it('tumbles about the wedge centroid, not the hub', () => {
    expect(transformOf({ at: 0, rotate: 45 }, target)).toBe(
      'rotate(90) translate(0 -120) rotate(45) translate(0 120) rotate(-90)',
    )
  })

  it('scales about the hub', () => {
    expect(transformOf({ at: 0, scale: 0.5 }, target)).toBe('scale(0.5)')
  })

  it('composes offset, tumble, and scale in that order', () => {
    expect(transformOf({ at: 0, offset: 1, rotate: 90, scale: 2 }, target)).toBe(
      'rotate(90) translate(0 -200) rotate(-90) rotate(90) translate(0 -120) rotate(90) translate(0 120) rotate(-90) scale(2)',
    )
  })

  // A pivot of zero is the wheel scope: there is no centroid but the hub.
  it('tumbles about the hub at wheel scope', () => {
    expect(transformOf({ at: 0, rotate: 30 }, { angle: 0, radius: 200, pivot: 0 })).toBe(
      'rotate(0) translate(0 0) rotate(30) translate(0 0) rotate(0)',
    )
  })
})

describe('toKeyframes', () => {
  it('carries timing across as the WAAPI offset', () => {
    const frames = toKeyframes([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }], target)
    expect(frames.map((frame) => frame.offset)).toEqual([0, 1])
    expect(frames.map((frame) => frame.opacity)).toEqual([0, 1])
  })

  it('omits opacity entirely when no frame sets it', () => {
    for (const frame of toKeyframes([{ at: 0, scale: 0 }, { at: 1, scale: 1 }], target)) {
      expect('opacity' in frame).toBe(false)
    }
  })

  // A property present in only some keyframes interpolates from the computed
  // style rather than from the authored value, which is a different animation.
  it('fills a partially set property across every keyframe', () => {
    const frames = toKeyframes([{ at: 0, aperture: 0 }, { at: 1 }], target)
    expect(frames[0].clipPath).toBe('circle(0% at 50% 50%)')
    expect(frames[1].clipPath).toBe('circle(70.711% at 50% 50%)')
  })

  it('always emits a transform, so no keyframe interpolates from the layout', () => {
    for (const frame of toKeyframes([{ at: 0, offset: 1 }, { at: 1 }], target)) {
      expect(typeof frame.transform).toBe('string')
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/transition/css.test.ts`
Expected: FAIL — cannot resolve `./css`.

- [ ] **Step 3: Write the emitter**

`src/transition/css.ts`:

```ts
import type { PresentationKeyframe } from './types'

export type EmitTarget = {
  /** The element's own angle, degrees clockwise from 12 o'clock. Zero at wheel scope. */
  angle: number
  radius: number
  /** Distance from the hub to the rotation pivot. Zero at wheel scope. */
  pivot: number
}

/**
 * Half the diagonal of a unit box, as a percentage: the radius at which a
 * centered circle covers the whole element, so aperture 1 clips nothing.
 */
const FULL_APERTURE = 70.711

function round(value: number): string {
  // Trailing zeros make two identical transforms compare unequal as strings,
  // which is how a keyframe list ends up animating from a value to itself.
  return `${Number(value.toFixed(3))}`
}

export function transformOf(frame: PresentationKeyframe, target: EmitTarget): string {
  const parts: string[] = []

  if (frame.offset !== undefined && frame.offset !== 0) {
    const angle = frame.offsetAngle ?? target.angle
    parts.push(
      `rotate(${round(angle)}) translate(0 ${round(-frame.offset * target.radius)}) rotate(${round(-angle)})`,
    )
  }

  if (frame.rotate !== undefined && frame.rotate !== 0) {
    parts.push(
      `rotate(${round(target.angle)}) translate(0 ${round(-target.pivot)}) rotate(${round(frame.rotate)}) translate(0 ${round(target.pivot)}) rotate(${round(-target.angle)})`,
    )
  }

  if (frame.scale !== undefined && frame.scale !== 1) {
    parts.push(`scale(${round(frame.scale)})`)
  }

  return parts.length === 0 ? 'none' : parts.join(' ')
}

export function clipOf(frame: PresentationKeyframe): string {
  const aperture = frame.aperture ?? 1
  return `circle(${round(aperture * FULL_APERTURE)}% at 50% 50%)`
}

/**
 * WAAPI interpolates a property that appears in only some keyframes from the
 * element's computed style, which is a different animation from the authored
 * one. Every property any frame mentions is therefore emitted on all of them.
 */
export function toKeyframes(
  frames: PresentationKeyframe[],
  target: EmitTarget,
): Keyframe[] {
  const hasOpacity = frames.some((frame) => frame.opacity !== undefined)
  const hasAperture = frames.some((frame) => frame.aperture !== undefined)

  return frames.map((frame) => {
    const keyframe: Keyframe = {
      offset: frame.at,
      transform: transformOf(frame, target),
    }
    if (hasOpacity) keyframe.opacity = frame.opacity ?? 1
    if (hasAperture) keyframe.clipPath = clipOf(frame)
    return keyframe
  })
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/transition/css.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npx biome check --write .
git add src/transition/css.ts src/transition/css.test.ts
git commit -m "feat(transition): compile presentation keyframes to css"
```

---

### Task 7: Carry transitions in the preset

**Files:**
- Modify: `src/preset/types.ts`
- Modify: `src/preset/storage.ts:447-480` (`parsePreset`)
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/preset/storage.test.ts`:

```ts
describe('transitions', () => {
  it('reads a transition instance', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        transitions: { enter: { id: 'fly', params: { distance: 2 } } },
      }),
    )
    expect(preset.transitions?.enter).toEqual({ id: 'fly', params: { distance: 2 } })
  })

  it('is absent when the file says nothing, which is today behavior', () => {
    expect(parsePreset(JSON.stringify({ version: 3 })).transitions).toBeUndefined()
  })

  // Same posture as an unknown recipe: drop the instance, keep the preset.
  it('drops an unknown transition rather than rejecting the preset', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 3, name: 'kept', transitions: { enter: { id: 'nope' } } }),
    )
    expect(preset.transitions?.enter).toBeUndefined()
    expect(preset.name).toBe('kept')
  })

  it('drops a moment that is not one', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 3, transitions: { whenever: { id: 'fade' } } }),
    )
    expect(preset.transitions).toBeUndefined()
  })

  it('defaults absent params to an empty object', () => {
    const preset = parsePreset(JSON.stringify({ version: 3, transitions: { enter: { id: 'fade' } } }))
    expect(preset.transitions?.enter).toEqual({ id: 'fade', params: {} })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/preset/storage.test.ts -t 'transitions'`
Expected: FAIL — `transitions` is not a property of `Preset`.

- [ ] **Step 3: Add the field to the type**

In `src/preset/types.ts`, import and extend:

```ts
import type { Transitions } from '../transition/types'
```

and add to `Preset`, after `branches`:

```ts
  /** Absent means no transition at that moment, which is the behavior that predates them. */
  transitions?: Transitions
```

- [ ] **Step 4: Write the reader**

In `src/preset/storage.ts`, next to the other readers:

```ts
const MOMENTS: Moment[] = ['enter', 'exit', 'spin', 'reveal']

function readTransitions(value: unknown): Transitions | undefined {
  if (!isRecord(value)) return undefined

  const transitions: Transitions = {}
  for (const moment of MOMENTS) {
    const entry = value[moment]
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const transition = getTransition(entry.id)
    if (!transition) continue
    transitions[moment] = {
      id: transition.id,
      params: isRecord(entry.params) ? entry.params : {},
    }
  }

  // Absent rather than empty: an empty object and no object mean the same
  // thing, and only one of them survives a round trip unchanged.
  return Object.keys(transitions).length === 0 ? undefined : transitions
}
```

with the imports:

```ts
import { getTransition } from '../transition/registry'
import type { Moment, Transitions } from '../transition/types'
```

- [ ] **Step 5: Wire it into parsePreset**

In the returned object, after `branches: readBranches(data.branches),`:

```ts
    transitions: readTransitions(data.transitions),
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS. `savePreset` needs no change — `JSON.stringify` drops an undefined field.

- [ ] **Step 7: Commit**

```bash
npx biome check --write .
git add src/preset/types.ts src/preset/storage.ts src/preset/storage.test.ts
git commit -m "feat(preset): carry a transition per moment"
```

---

### Task 8: Give the wheel something to animate

**Files:**
- Modify: `src/wheel/Wheel.tsx:28-45`
- Modify: `src/wheel/Wheel.css`
- Test: `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/wheel/Wheel.test.tsx`:

```tsx
it('tags each wedge with its segment id, so a transition can find it', () => {
  const { container } = render(
    <Wheel segments={[{ id: 'ana', label: 'Ana', weight: 1 }, { id: 'ben', label: 'Ben', weight: 1 }]} />,
  )
  expect(container.querySelector('[data-segment-id="ana"]')).not.toBeNull()
  expect(container.querySelector('[data-segment-id="ben"]')).not.toBeNull()
})

it('wraps the rotor in a stage, so a wheel-scope transform never fights the rotation', () => {
  const { container } = render(<Wheel segments={[{ id: 'ana', label: 'Ana', weight: 1 }]} />)
  const stage = container.querySelector('.wheel__stage')
  expect(stage?.querySelector('.wheel__rotor')).not.toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — no `.wheel__stage`, no `data-segment-id`.

- [ ] **Step 3: Add the stage and the wedge handles**

In `src/wheel/Wheel.tsx`, wrap the rotor and tag each wedge group:

```tsx
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
```

and the wedge group:

```tsx
            <g className="wheel__wedge" data-segment-id={segment.id} key={segment.id}>
```

Close the extra `</g>` before the pointer polygon.

- [ ] **Step 4: Fix the transform reference frame**

Add to `src/wheel/Wheel.css`:

```css
/* CSS transforms on SVG default to a bounding-box origin, which would make
   every wedge rotate about its own middle rather than about the hub. The
   transforms `css.ts` emits are written in the wheel's coordinate system. */
.wheel__stage,
.wheel__wedge {
  transform-box: view-box;
  transform-origin: 0 0;
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx biome check --write .
git add src/wheel/Wheel.tsx src/wheel/Wheel.css src/wheel/Wheel.test.tsx
git commit -m "feat(wheel): give each wedge and the stage an animation handle"
```

---

### Task 9: Run the enter transition

**Files:**
- Create: `src/transition/useEnter.ts`
- Test: `src/transition/useEnter.test.tsx`
- Modify: `src/wheel/useSpin.ts:10` (export the constant)
- Modify: `src/wheel/Wheel.tsx` (call the hook)

- [ ] **Step 1: Export the reduced-motion duration**

In `src/wheel/useSpin.ts`, line 10, add the keyword:

```ts
export const REDUCED_MOTION_MS = 300
```

- [ ] **Step 2: Write the failing test**

`src/transition/useEnter.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'

type AnimateCall = { keyframes: unknown; options: KeyframeAnimationOptions }

const calls: AnimateCall[] = []

function stubAnimate(): void {
  Element.prototype.animate = function animate(
    this: Element,
    keyframes: unknown,
    options: KeyframeAnimationOptions,
  ) {
    calls.push({ keyframes, options })
    return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation
  } as unknown as Element['animate']
}

const segment = (id: string): Segment => ({ id, label: id, weight: 1 })

beforeEach(() => {
  calls.length = 0
  stubAnimate()
  window.matchMedia = ((query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as
      unknown as MediaQueryList) as typeof window.matchMedia
})

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
})

describe('enter transitions', () => {
  const transitions = { enter: { id: 'fade' as const, params: { staggerMs: 20 } } }

  it('animates a wedge that joins the roster', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    calls.length = 0
    rerender(<Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />)
    expect(calls).toHaveLength(1)
    expect(calls[0].options.delay).toBe(20)
  })

  it('leaves a wedge that was already there alone', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    calls.length = 0
    rerender(<Wheel segments={[{ ...segment('ana'), label: 'Ana L.' }]} transitions={transitions} />)
    expect(calls).toHaveLength(0)
  })

  it('animates every wedge on first paint', () => {
    render(<Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />)
    expect(calls).toHaveLength(2)
  })

  it('does nothing at all without a transition', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} />)
    calls.length = 0
    rerender(<Wheel segments={[segment('ana'), segment('ben')]} />)
    expect(calls).toHaveLength(0)
  })

  it('collapses to a fade with no stagger under reduced motion', () => {
    window.matchMedia = ((query: string) =>
      ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as
        unknown as MediaQueryList) as typeof window.matchMedia

    render(
      <Wheel
        segments={[segment('ana'), segment('ben')]}
        transitions={{ enter: { id: 'fly', params: { staggerMs: 200, distance: 2 } } }}
      />,
    )
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.options.delay).toBe(0)
      expect(call.options.duration).toBe(300)
      // A fade moves nothing.
      for (const frame of call.keyframes as Keyframe[]) expect(frame.transform).toBe('none')
    }
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/transition/useEnter.test.tsx`
Expected: FAIL — `Wheel` has no `transitions` prop.

- [ ] **Step 4: Write the hook**

`src/transition/useEnter.ts`:

```ts
import { useEffect, useRef } from 'react'
import { readNumber } from '../tricks/params'
import { arcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import { toKeyframes } from './css'
import { fade } from './transitions/fade'
import { getTransition } from './registry'
import type { TransitionInstance } from './types'

/** Where a wedge's own transform frame points, degrees clockwise from 12 o'clock. */
function anglesOf(segments: Segment[]): Map<string, number> {
  const angles = new Map<string, number>()
  for (const arc of arcs(segments)) {
    angles.set(arc.id, (arc.start + (arc.end - arc.start) / 2) * 360)
  }
  return angles
}

export function useEnter(
  segments: Segment[],
  instance: TransitionInstance | undefined,
  radius: number,
  wedges: Map<string, SVGGElement>,
): void {
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    const ids = new Set(segments.map((segment) => segment.id))
    const previous = seen.current
    seen.current = ids

    if (!instance) return

    // First paint enters everything; after that, only what is new.
    const arriving = segments.filter((segment) => previous === null || !previous.has(segment.id))
    if (arriving.length === 0) return

    const authored = getTransition(instance.id)
    if (!authored) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const transition = reduced ? fade : authored
    const params = reduced ? { staggerMs: 0 } : instance.params
    const durationMs = reduced
      ? REDUCED_MOTION_MS
      : readNumber(instance.params, 'durationMs', readNumber(transition.defaults, 'durationMs', 400))

    const angles = anglesOf(segments)

    for (const segment of arriving) {
      const element = wedges.get(segment.id)
      if (!element) continue

      const index = segments.indexOf(segment)
      const { keyframes, delayMs } = transition.frames(params, {
        index,
        count: segments.length,
        angle: angles.get(segment.id) ?? 0,
        durationMs,
      })

      element.animate(toKeyframes(keyframes, { angle: angles.get(segment.id) ?? 0, radius, pivot: radius * 0.6 }), {
        duration: durationMs,
        delay: delayMs,
        easing: 'ease-out',
        fill: 'backwards',
      })
    }
  }, [segments, instance, radius, wedges])
}
```

- [ ] **Step 5: Call it from the wheel**

In `src/wheel/Wheel.tsx`, add the prop, a ref map, and the hook:

```tsx
import { useRef } from 'react'
import { useEnter } from '../transition/useEnter'
import type { Transitions } from '../transition/types'
```

```tsx
export type WheelProps = {
  segments: Segment[]
  radius?: number
  rotationDeg?: number
  rotorRef?: Ref<SVGGElement>
  transitions?: Transitions
}
```

Inside the component, before the return:

```tsx
  const wedges = useRef(new Map<string, SVGGElement>()).current
  useEnter(segments, transitions?.enter, radius, wedges)
```

and on the wedge group:

```tsx
            <g
              className="wheel__wedge"
              data-segment-id={segment.id}
              key={segment.id}
              ref={(element) => {
                if (element) wedges.set(segment.id, element)
                else wedges.delete(segment.id)
              }}
            >
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run src/transition/useEnter.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Run everything**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx biome check --write .
git add src/transition src/wheel
git commit -m "feat(wheel): animate wedges as they join the roster"
```

---

### Task 10: Let the operator pick one

**Files:**
- Create: `src/editor/TransitionPanel.tsx`
- Test: `src/editor/TransitionPanel.test.tsx`
- Modify: `src/editor/Editor.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

`src/editor/TransitionPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransitionPanel } from './TransitionPanel'

describe('TransitionPanel', () => {
  it('starts at none, which is the behavior that predates transitions', () => {
    render(<TransitionPanel transitions={undefined} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Wedges arriving')).toHaveValue('')
  })

  it('arms a transition with its defaults', async () => {
    const onChange = vi.fn()
    render(<TransitionPanel transitions={undefined} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), 'fly')
    expect(onChange).toHaveBeenCalledWith({
      enter: { id: 'fly', params: expect.objectContaining({ distance: 1.6 }) },
    })
  })

  it('shows the armed transition fields', () => {
    render(
      <TransitionPanel transitions={{ enter: { id: 'fly', params: {} } }} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Distance (radii)')).toBeInTheDocument()
  })

  it('disarms back to none', async () => {
    const onChange = vi.fn()
    render(
      <TransitionPanel transitions={{ enter: { id: 'fade', params: {} } }} onChange={onChange} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), '')
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/editor/TransitionPanel.test.tsx`
Expected: FAIL — cannot resolve `./TransitionPanel`.

- [ ] **Step 3: Write the panel**

`src/editor/TransitionPanel.tsx`:

```tsx
import { PropertyPanel, PropertyRow, SelectRow } from '@weasel-js/labkit'
import { TRANSITION_LIST, getTransition } from '../transition/registry'
import type { TransitionId, TransitionParams, Transitions } from '../transition/types'
import { RecipeForm } from './RecipeForm'

export type TransitionPanelProps = {
  transitions: Transitions | undefined
  onChange: (transitions: Transitions | undefined) => void
}

const NONE = ''

export function TransitionPanel({ transitions, onChange }: TransitionPanelProps) {
  const enter = transitions?.enter
  const transition = enter ? getTransition(enter.id) : null

  const arm = (value: string) => {
    if (value === NONE) {
      onChange(undefined)
      return
    }
    const chosen = getTransition(value)
    if (!chosen) return
    onChange({ enter: { id: chosen.id as TransitionId, params: { ...chosen.defaults } } })
  }

  const edit = (params: TransitionParams) => {
    if (!enter) return
    onChange({ enter: { ...enter, params } })
  }

  return (
    <PropertyPanel title="Transitions">
      <SelectRow
        label="Wedges arriving"
        value={enter?.id ?? NONE}
        options={[
          { value: NONE, label: 'None' },
          ...TRANSITION_LIST.map((item) => ({ value: item.id, label: item.name })),
        ]}
        onChange={arm}
      />
      {transition && enter ? (
        <RecipeForm
          fields={transition.fields}
          params={enter.params}
          segments={[]}
          onChange={edit}
        />
      ) : null}
    </PropertyPanel>
  )
}
```

If `SelectRow`'s props differ from this shape, match `MotionPanel.tsx`'s use of
it — that is the working reference for the same component.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/editor/TransitionPanel.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Prove a locked editor still shows it**

Add to `src/editor/Editor.test.tsx`, alongside the existing locked-editor tests:

```tsx
it('offers transitions even when locked, because they are not rigging', () => {
  window.localStorage.removeItem(RIG_KEY)
  render(<Editor />)
  expect(screen.getByLabelText('Wedges arriving')).toBeInTheDocument()
})
```

Run: `npx vitest run src/editor/Editor.test.tsx -t 'not rigging'`
Expected: FAIL until Step 6 mounts the panel, then PASS.

- [ ] **Step 6: Mount it in the editor**

In `src/editor/Editor.tsx`, render it in the center column beneath `MotionPanel`:

```tsx
<TransitionPanel
  transitions={preset.transitions}
  onChange={(transitions) => update({ ...preset, transitions })}
/>
```

The panel is not gated on `rigVisible`: transitions are cosmetic, they show on
the shared screen anyway, and hiding them would tell a guest there is something
worth hiding.

- [ ] **Step 7: Pass them to the wheel on the show page**

In `src/App.tsx`, add the prop to the `Wheel` element:

```tsx
<Wheel segments={displaySegments} rotorRef={rotorRef} transitions={preset.transitions} />
```

- [ ] **Step 8: Run everything**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 9: See it work**

Run: `npm run dev`, open `http://localhost:5173/#/edit`, set **Wedges arriving**
to "Wedges fly in from outside", then open `http://localhost:5173/` in a second
window and add a name in the editor. The new wedge flies in.

- [ ] **Step 10: Commit**

```bash
npx biome check --write .
git add src/editor src/App.tsx
git commit -m "feat(editor): arm a transition for arriving wedges"
```

---

## What this leaves for the next plan

- `exit`, and the departing-wedge copy the wheel has to keep drawing at its last
  arc while it animates out.
- `spin` and `reveal`, and the rule that a spin cancels in-flight enter and exit
  animations.
- `shutter` and `zoom`, the two wheel-scope transitions, which need the stage
  wrapper this plan added but nothing else new.
