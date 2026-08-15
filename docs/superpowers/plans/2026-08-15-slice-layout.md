# Slice Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded label path in `Wheel.tsx` with a registry of slice layouts, each a pure `draw()` that returns elements, with conditional overflow and two drawing frames.

**Architecture:** A new `src/slice` module owns types, text measurement, fit budgets, the overflow ladder, the shipped layouts, and the registry — mirroring `src/transition` exactly. `Wheel.tsx` becomes the only consumer that touches the DOM: it builds a `SliceContext` per wedge, calls the resolved layout's `draw()`, and renders the returned `SliceElement[]`. Level-frame elements get an inverse rotation animation derived from the same `rotationTrack` the rotor uses.

**Tech Stack:** TypeScript, React 19, SVG, Web Animations API, Vitest + Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-08-15-slice-layout-design.md`

**Conventions for every task:**
- Run one test file with `npx vitest run src/path/to/file.test.ts`.
- Run everything with `npm test`.
- Run `npm run check` (Biome) before each commit; it rewrites formatting in place.
- Type-check with `npm run build` when a task changes a shared type.

---

### Task 1: Slice types and text measurement

**Files:**
- Create: `src/slice/types.ts`
- Create: `src/slice/measure.ts`
- Test: `src/slice/measure.test.ts`

- [ ] **Step 1: Create the type module**

`src/slice/types.ts`:

```ts
import type { ReactNode } from 'react'
import type { Field } from '../form/fields'
import type { Segment } from '../wheel/types'

/** Whether a drawn element's orientation rides the rotor or stays level. */
export type Frame = 'wheel' | 'level'

export type Orientation = 'radial' | 'tangential' | 'curved'

export type ContentTransform = 'full' | 'firstName' | 'initials' | 'ellipsis'

export type SliceLayoutId = 'auto' | 'radial' | 'tangential' | 'curved'

export type SliceParams = Record<string, unknown>

/** Advance width of `text` at `size`, in user units. Linear in `size`. */
export type Measure = (text: string, size: number) => number

export type FitSpec = {
  text: string
  orientation: Orientation
  frame: Frame
  /** The wedge's arc, in turns. */
  width: number
  radius: number
  /** Fraction of the radius the text sits at. */
  anchor: number
  maxSize: number
  minSize: number
}

export type Placement = {
  orientation: Orientation
  anchor: number
  size: number
  text: string
}

type Drawn =
  | { kind: 'text'; text: string; along: 'radial' | 'tangential'; anchor: number; size: number }
  | { kind: 'curvedText'; text: string; anchor: number; size: number }
  | { kind: 'image'; href: string; anchor: number; size: number; clip?: 'circle' | 'wedge' }
  | { kind: 'path'; d: string; fill?: string; opacity?: number }
  | { kind: 'raw'; node: ReactNode }

/**
 * `frame` overrides the layout's own, so a portrait can ride while its caption
 * stays level. A level element must be centered on its own origin: the
 * counter-rotation resolves its origin from the element's bounding box.
 */
export type SliceElement = Drawn & { frame?: Frame }

export type SliceContext = {
  segment: Segment
  /** Turns. 0 is 12 o'clock, increasing clockwise. */
  arc: { start: number; end: number }
  radius: number
  index: number
  count: number
  measure: Measure
  fit: (spec: FitSpec) => Placement | null
}

export type SliceLayout = {
  id: SliceLayoutId
  /** Structural. "Text curves along the arc", never "the fancy one". */
  name: string
  description: string
  defaults: SliceParams
  fields: Field[]
  /** Pure. The only thing that affects what gets drawn. */
  draw(params: SliceParams, ctx: SliceContext): SliceElement[]
}

export type SliceInstance = { id: SliceLayoutId; params: SliceParams }
```

- [ ] **Step 2: Write the failing measurement test**

`src/slice/measure.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createMeasure, estimateWidth } from './measure'

describe('estimateWidth', () => {
  it('scales linearly with size', () => {
    expect(estimateWidth('Sleve', 20)).toBeCloseTo(estimateWidth('Sleve', 10) * 2)
  })

  it('is zero for empty text', () => {
    expect(estimateWidth('', 20)).toBe(0)
  })
})

describe('createMeasure', () => {
  it('falls back to the estimate when there is no canvas context', () => {
    // jsdom has no 2d context, which is the environment this branch exists for.
    const measure = createMeasure()
    expect(measure('Onson Sweemey', 16)).toBeCloseTo(estimateWidth('Onson Sweemey', 16))
  })

  it('measures once per string and scales the cached unit width', () => {
    const measureText = vi.fn(() => ({ width: 400 }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText,
    } as unknown as CanvasRenderingContext2D)

    const measure = createMeasure()
    expect(measure('Bobson Dugnutt', 10)).toBeCloseTo(40)
    expect(measure('Bobson Dugnutt', 20)).toBeCloseTo(80)
    expect(measureText).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
  })

  it('survives a canvas that throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no canvas')
    })

    const measure = createMeasure()
    expect(measure('Rey McSriff', 12)).toBeCloseTo(estimateWidth('Rey McSriff', 12))

    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/slice/measure.test.ts`
Expected: FAIL — "Failed to resolve import './measure'".

- [ ] **Step 4: Write the implementation**

`src/slice/measure.ts`:

```ts
import type { Measure } from './types'

/** Mean glyph width as a fraction of font size, for a sans-serif face. */
const CHAR_WIDTH_RATIO = 0.55

/**
 * Measured at a reference size and divided down rather than measured at 1px:
 * a 1px font rounds to subpixel garbage on every engine.
 */
const REFERENCE_SIZE = 100

export const FONT_STACK = 'system-ui, sans-serif'
export const FONT_WEIGHT = 600

export const estimateWidth: Measure = (text, size) => text.length * CHAR_WIDTH_RATIO * size

/**
 * Canvas metrics, cached per string for the session. Falls back to the estimate
 * wherever a 2d context is unavailable — jsdom, chiefly — so callers never
 * branch on the environment.
 */
export function createMeasure(): Measure {
  const cache = new Map<string, number>()
  let context: CanvasRenderingContext2D | null | undefined

  return (text, size) => {
    if (text.length === 0) return 0

    if (context === undefined) {
      try {
        context = document.createElement('canvas').getContext('2d')
        if (context) context.font = `${FONT_WEIGHT} ${REFERENCE_SIZE}px ${FONT_STACK}`
      } catch {
        context = null
      }
    }
    if (!context) return estimateWidth(text, size)

    let unit = cache.get(text)
    if (unit === undefined) {
      unit = context.measureText(text).width / REFERENCE_SIZE
      cache.set(text, unit)
    }
    return unit * size
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/slice/measure.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Type-check and commit**

```bash
npm run build
npm run check
git add src/slice/types.ts src/slice/measure.ts src/slice/measure.test.ts
git commit -m "feat(slice): measure text with canvas metrics, not a glyph ratio"
```

---

### Task 2: Fit budgets

**Files:**
- Create: `src/slice/fit.ts`
- Test: `src/slice/fit.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/fit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { budget, createFit, levelRoom } from './fit'
import type { FitSpec, Measure } from './types'

/** Deterministic and linear, so a size assertion is arithmetic rather than a font. */
const measure: Measure = (text, size) => text.length * 0.5 * size

const base: Omit<FitSpec, 'text' | 'orientation'> = {
  frame: 'wheel',
  width: 0.125,
  radius: 200,
  anchor: 0.7,
  maxSize: 26,
  minSize: 9,
}

describe('budget', () => {
  it('gives radial a length that ignores arc width', () => {
    const narrow = budget({ ...base, orientation: 'radial', width: 0.01 })
    const wide = budget({ ...base, orientation: 'radial', width: 0.4 })
    expect(narrow.length).toBeCloseTo(wide.length)
  })

  it('grows the curved length with arc width', () => {
    const narrow = budget({ ...base, orientation: 'curved', width: 0.05 })
    const wide = budget({ ...base, orientation: 'curved', width: 0.25 })
    expect(wide.length).toBeGreaterThan(narrow.length * 4)
  })

  it('shrinks the radial natural size as the arc narrows', () => {
    const narrow = budget({ ...base, orientation: 'radial', width: 0.01 })
    const wide = budget({ ...base, orientation: 'radial', width: 0.25 })
    expect(narrow.natural).toBeLessThan(wide.natural)
  })
})

describe('levelRoom', () => {
  it('is bounded by the nearest wedge edge', () => {
    const narrow = levelRoom({ ...base, orientation: 'radial', width: 0.02 })
    const wide = levelRoom({ ...base, orientation: 'radial', width: 0.4 })
    expect(narrow).toBeLessThan(wide)
  })
})

describe('createFit', () => {
  const fit = createFit(measure)

  it('returns null for empty text', () => {
    expect(fit({ ...base, orientation: 'radial', text: '' })).toBeNull()
  })

  it('never exceeds the maximum size when there is room to spare', () => {
    const placed = fit({ ...base, orientation: 'curved', width: 0.5, text: 'Ana' })
    expect(placed?.size).toBeLessThanOrEqual(26)
  })

  it('shrinks to the length budget rather than overflowing', () => {
    const placed = fit({ ...base, orientation: 'radial', text: 'Priyanka Venkataraman' })
    expect(placed).not.toBeNull()
    expect(measure(placed?.text ?? '', placed?.size ?? 0)).toBeLessThanOrEqual(
      budget({ ...base, orientation: 'radial' }).length + 0.01,
    )
  })

  it('returns null when the arc cannot hold the text above the floor', () => {
    expect(
      fit({ ...base, orientation: 'radial', width: 0.0004, text: 'Glenallen Mixon' }),
    ).toBeNull()
  })

  it('holds a long name on a fat arc in curved that radial cannot', () => {
    const wide = { ...base, width: 0.45, text: 'Darryl Archideld' }
    const curved = fit({ ...wide, orientation: 'curved' })
    const radial = fit({ ...wide, orientation: 'radial' })
    expect(curved?.size ?? 0).toBeGreaterThan(radial?.size ?? 0)
  })

  it('fits level frame inside a disc that ignores orientation', () => {
    const spec = { ...base, frame: 'level' as const, text: 'Mike Truk' }
    const asRadial = fit({ ...spec, orientation: 'radial' })
    const asCurved = fit({ ...spec, orientation: 'curved' })
    expect(asRadial?.size).toBe(asCurved?.size)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/fit.test.ts`
Expected: FAIL — "Failed to resolve import './fit'".

- [ ] **Step 3: Write the implementation**

`src/slice/fit.ts`:

```ts
import type { FitSpec, Measure, Placement } from './types'

const TAU = Math.PI * 2

/** Fraction of the radius a radial run may occupy. */
const RADIAL_RUN = 0.75
/** How much of the available chord or arc a line of text may claim. */
const CHORD_FILL = 0.86
const ARC_FILL = 0.9
/** Radial thickness a curved band claims, as a fraction of the radius. */
const BAND = 0.34
/** Radial thickness a tangential line claims. */
const TANGENTIAL_BAND = 0.5
const LINE_HEIGHT = 1.2

const round = (n: number): number => Number(n.toFixed(2))

/** The straight-line distance across an arc at a given radius. */
const chord = (turns: number, radius: number): number =>
  2 * radius * Math.sin(Math.PI * Math.min(turns, 0.5))

const arcLength = (turns: number, radius: number): number => TAU * radius * turns

export type Budget = {
  /** How far the text may run, along whatever direction the orientation uses. */
  length: number
  /** The largest size the perpendicular direction allows, before length shrinks it. */
  natural: number
}

export function budget(spec: Omit<FitSpec, 'text'>): Budget {
  const anchorRadius = spec.radius * spec.anchor
  switch (spec.orientation) {
    case 'radial':
      return {
        length: spec.radius * RADIAL_RUN,
        natural: chord(spec.width, anchorRadius) * 0.8,
      }
    case 'tangential':
      return {
        length: chord(spec.width, anchorRadius) * CHORD_FILL,
        natural: (spec.radius * TANGENTIAL_BAND) / LINE_HEIGHT,
      }
    case 'curved':
      return {
        length: arcLength(spec.width, anchorRadius) * ARC_FILL,
        natural: (spec.radius * BAND) / LINE_HEIGHT,
      }
  }
}

/**
 * Level-frame text must stay inside the wedge at every rotation, so its room is
 * the distance from the anchor to the nearest edge — a disc, not a run.
 */
export function levelRoom(spec: Omit<FitSpec, 'text'>): number {
  const anchorRadius = spec.radius * spec.anchor
  const toSide = anchorRadius * Math.sin(Math.PI * Math.min(spec.width, 0.5))
  const toRim = spec.radius - anchorRadius
  return Math.max(0, Math.min(toSide, toRim, anchorRadius))
}

/**
 * Shrink-to-fit for one orientation. Returns null when the text cannot be drawn
 * at or above `minSize` — which is the signal a ladder walks on.
 */
export function createFit(measure: Measure): (spec: FitSpec) => Placement | null {
  return (spec) => {
    if (spec.text.length === 0) return null

    const unit = measure(spec.text, 1)
    if (!(unit > 0)) return null

    let size: number
    if (spec.frame === 'level') {
      const room = levelRoom(spec)
      // A W by H box fits a disc of radius r when hypot(W, H) <= 2r.
      size = Math.min(spec.maxSize, (2 * room) / Math.hypot(unit, LINE_HEIGHT))
    } else {
      const { length, natural } = budget(spec)
      if (!(length > 0) || !(natural > 0)) return null
      size = Math.min(spec.maxSize, natural, length / unit)
    }

    if (!(size >= spec.minSize)) return null
    return { orientation: spec.orientation, anchor: spec.anchor, size: round(size), text: spec.text }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/fit.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/fit.ts src/slice/fit.test.ts
git commit -m "feat(slice): budget text by orientation and frame"
```

---

### Task 3: The overflow ladder

**Files:**
- Create: `src/slice/ladder.ts`
- Test: `src/slice/ladder.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/ladder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFit } from './fit'
import { LADDERS, LADDER_OPTIONS, applyTransform, ellipsize, walkLadder } from './ladder'
import type { FitSpec, Measure } from './types'

const measure: Measure = (text, size) => text.length * 0.5 * size
const fit = createFit(measure)

const base: Omit<FitSpec, 'text' | 'orientation'> = {
  frame: 'wheel',
  width: 0.125,
  radius: 200,
  anchor: 0.7,
  maxSize: 26,
  minSize: 9,
}

describe('applyTransform', () => {
  it('keeps the whole label for full', () => {
    expect(applyTransform('full', 'Sleve McDichael')).toBe('Sleve McDichael')
  })

  it('takes the first word for firstName', () => {
    expect(applyTransform('firstName', 'Sleve McDichael')).toBe('Sleve')
  })

  it('takes one letter per word for initials', () => {
    expect(applyTransform('initials', 'Bobson Dugnutt')).toBe('BD')
  })

  it('leaves a single-word label alone under firstName', () => {
    expect(applyTransform('firstName', 'Dave')).toBe('Dave')
  })
})

describe('ellipsize', () => {
  it('returns the text untouched when it already fits', () => {
    expect(ellipsize('Ana', 100, 10, measure)).toBe('Ana')
  })

  it('trims to the longest prefix that fits, with an ellipsis', () => {
    const trimmed = ellipsize('Anatoli Smorin', 30, 10, measure)
    expect(trimmed.endsWith('…')).toBe(true)
    expect(measure(trimmed, 10)).toBeLessThanOrEqual(30)
  })

  it('returns a bare ellipsis when nothing else fits', () => {
    expect(ellipsize('Anatoli Smorin', 6, 10, measure)).toBe('…')
  })
})

describe('walkLadder', () => {
  it('takes the first rung that fits', () => {
    const resolved = walkLadder('Ana', LADDERS.shrinkNameInitials, { ...base, width: 0.4 }, fit, measure)
    expect(resolved?.orientation).toBe('curved')
    expect(resolved?.content).toBe('full')
  })

  it('falls past the full-name rungs on a sliver', () => {
    const resolved = walkLadder(
      'Glenallen Mixon',
      LADDERS.shrinkNameInitials,
      { ...base, width: 0.006 },
      fit,
      measure,
    )
    expect(resolved?.content).toBe('initials')
  })

  it('returns null only when every rung fails', () => {
    const resolved = walkLadder(
      'Glenallen Mixon',
      LADDERS.shrinkNameInitials,
      { ...base, width: 0.00001 },
      fit,
      measure,
    )
    expect(resolved).toBeNull()
  })

  it('never shrinks below the floor under shrinkOnly', () => {
    const resolved = walkLadder('Todd Bonzalez', LADDERS.shrinkOnly, { ...base, width: 0.004 }, fit, measure)
    expect(resolved).toBeNull()
  })

  it('offers every ladder as a select option', () => {
    expect(LADDER_OPTIONS.map((option) => option.value).sort()).toEqual(Object.keys(LADDERS).sort())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/ladder.test.ts`
Expected: FAIL — "Failed to resolve import './ladder'".

- [ ] **Step 3: Write the implementation**

`src/slice/ladder.ts`:

```ts
import { budget } from './fit'
import type { ContentTransform, FitSpec, Measure, Orientation, Placement } from './types'

export type Rung = { orientation: Orientation; content: ContentTransform }

export type LadderId = 'shrinkNameInitials' | 'shrinkEllipsis' | 'shrinkOnly' | 'noShrink'

export type Resolved = Placement & { content: ContentTransform }

const rung = (orientation: Orientation, content: ContentTransform): Rung => ({ orientation, content })

export const LADDERS: Record<LadderId, Rung[]> = {
  shrinkNameInitials: [
    rung('curved', 'full'),
    rung('tangential', 'full'),
    rung('radial', 'full'),
    rung('radial', 'firstName'),
    rung('curved', 'initials'),
    rung('radial', 'initials'),
  ],
  shrinkEllipsis: [
    rung('curved', 'full'),
    rung('tangential', 'full'),
    rung('radial', 'full'),
    rung('radial', 'ellipsis'),
  ],
  shrinkOnly: [rung('curved', 'full'), rung('tangential', 'full'), rung('radial', 'full')],
  noShrink: [rung('curved', 'full')],
}

export const LADDER_OPTIONS: { value: LadderId; label: string }[] = [
  { value: 'shrinkNameInitials', label: 'Shrink → first name → initials' },
  { value: 'shrinkEllipsis', label: 'Shrink → ellipsis' },
  { value: 'shrinkOnly', label: 'Shrink only' },
  { value: 'noShrink', label: 'Never shrink' },
]

export function isLadderId(value: unknown): value is LadderId {
  return typeof value === 'string' && Object.hasOwn(LADDERS, value)
}

export function applyTransform(content: ContentTransform, text: string): string {
  switch (content) {
    case 'firstName':
      return text.split(/\s+/)[0] ?? text
    case 'initials':
      return text
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase()
    // Ellipsis needs a budget, so the walk resolves it; here it is a no-op.
    default:
      return text
  }
}

/** The longest prefix that fits `length` at `size`, with an ellipsis appended. */
export function ellipsize(text: string, length: number, size: number, measure: Measure): string {
  if (measure(text, size) <= length) return text

  let best = '…'
  for (let n = 1; n <= text.length; n++) {
    const candidate = `${text.slice(0, n)}…`
    if (measure(candidate, size) > length) break
    best = candidate
  }
  return best
}

/**
 * Take the first rung whose text fits. Returns null when every rung fails,
 * which is the layout's cue to draw no text at all rather than an unreadable one.
 */
export function walkLadder(
  text: string,
  rungs: Rung[],
  spec: Omit<FitSpec, 'text' | 'orientation'>,
  fit: (spec: FitSpec) => Placement | null,
  measure: Measure,
): Resolved | null {
  for (const step of rungs) {
    const attempt = { ...spec, orientation: step.orientation }
    const candidate =
      step.content === 'ellipsis'
        ? ellipsize(text, budget(attempt).length, spec.minSize, measure)
        : applyTransform(step.content, text)
    if (candidate.length === 0) continue

    const placed = fit({ ...attempt, text: candidate })
    if (placed) return { ...placed, content: step.content }
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/ladder.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/ladder.ts src/slice/ladder.test.ts
git commit -m "feat(slice): fall through an overflow ladder instead of vanishing"
```

---

### Task 4: The three single-orientation layouts

**Files:**
- Create: `src/slice/layouts/shared.ts`
- Create: `src/slice/layouts/radial.ts`
- Create: `src/slice/layouts/tangential.ts`
- Create: `src/slice/layouts/curved.ts`
- Test: `src/slice/layouts/layouts.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/layouts/layouts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import type { Measure, SliceContext } from '../types'
import { curved } from './curved'
import { radial } from './radial'
import { tangential } from './tangential'

const measure: Measure = (text, size) => text.length * 0.5 * size

function context(overrides: Partial<SliceContext> = {}): SliceContext {
  return {
    segment: { id: 'a', label: 'Sleve McDichael', weight: 1 },
    arc: { start: 0, end: 0.125 },
    radius: 200,
    index: 0,
    count: 8,
    measure,
    fit: createFit(measure),
    ...overrides,
  }
}

describe('radial', () => {
  it('draws one radial text element', () => {
    const [element] = radial.draw(radial.defaults, context())
    expect(element).toMatchObject({ kind: 'text', along: 'radial', text: 'Sleve McDichael' })
  })

  it('draws nothing when the arc cannot hold the label', () => {
    expect(radial.draw(radial.defaults, context({ arc: { start: 0, end: 0.0002 } }))).toEqual([])
  })

  it('carries the frame from its params', () => {
    const [element] = radial.draw({ ...radial.defaults, frame: 'level' }, context())
    expect(element.frame).toBe('level')
  })
})

describe('tangential', () => {
  it('draws one tangential text element', () => {
    const [element] = tangential.draw(tangential.defaults, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'text', along: 'tangential' })
  })
})

describe('curved', () => {
  it('draws a curved text element on a fat arc', () => {
    const [element] = curved.draw(curved.defaults, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'curvedText', text: 'Sleve McDichael' })
  })
})

describe('every layout', () => {
  it('declares a field for each of its defaults', () => {
    for (const layout of [radial, tangential, curved]) {
      const keys = layout.fields.map((field) => field.key).sort()
      expect(keys).toEqual(Object.keys(layout.defaults).sort())
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/layouts/layouts.test.ts`
Expected: FAIL — "Failed to resolve import './curved'".

- [ ] **Step 3: Write the shared parameter readers**

`src/slice/layouts/shared.ts`:

```ts
import type { Field } from '../../form/fields'
import { readNumber } from '../../tricks/params'
import type { Frame, FitSpec, SliceContext, SliceParams } from '../types'

export const MIN_SIZE = 9

export function readFrame(params: SliceParams): Frame {
  return params.frame === 'level' ? 'level' : 'wheel'
}

/** The fields every layout shares, in the order the panel shows them. */
export const COMMON_FIELDS: Field[] = [
  {
    key: 'frame',
    label: 'Frame',
    kind: 'select',
    options: [
      { value: 'wheel', label: 'Wheel — painted on' },
      { value: 'level', label: 'Level — stays horizontal' },
    ],
  },
  { key: 'anchor', label: 'Anchor', kind: 'slider', min: 0.3, max: 0.9, step: 0.01 },
  { key: 'maxSize', label: 'Max size', kind: 'slider', min: 10, max: 40, step: 1 },
]

export const COMMON_DEFAULTS = { frame: 'wheel', anchor: 0.7, maxSize: 26 }

/** Everything a fit needs except the text and the orientation. */
export function specOf(params: SliceParams, ctx: SliceContext): Omit<FitSpec, 'text' | 'orientation'> {
  return {
    frame: readFrame(params),
    width: ctx.arc.end - ctx.arc.start,
    radius: ctx.radius,
    anchor: readNumber(params, 'anchor', 0.7),
    maxSize: readNumber(params, 'maxSize', 26),
    minSize: MIN_SIZE,
  }
}
```

- [ ] **Step 4: Write the three layouts**

`src/slice/layouts/radial.ts`:

```ts
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const radial: SliceLayout = {
  id: 'radial',
  name: 'Radial',
  description: 'The label runs outward along the radius. Fits narrow wedges best.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.62 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const placed = ctx.fit({ ...spec, orientation: 'radial', text: ctx.segment.label })
    if (!placed) return []
    return [
      {
        kind: 'text',
        text: placed.text,
        along: 'radial',
        anchor: placed.anchor,
        size: placed.size,
        frame: readFrame(params),
      },
    ]
  },
}
```

`src/slice/layouts/tangential.ts`:

```ts
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const tangential: SliceLayout = {
  id: 'tangential',
  name: 'Tangential',
  description: 'The label runs across the wedge. Fits fat wedges with short labels.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.68 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const placed = ctx.fit({ ...spec, orientation: 'tangential', text: ctx.segment.label })
    if (!placed) return []
    return [
      {
        kind: 'text',
        text: placed.text,
        along: 'tangential',
        anchor: placed.anchor,
        size: placed.size,
        frame: readFrame(params),
      },
    ]
  },
}
```

`src/slice/layouts/curved.ts`:

```ts
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const curved: SliceLayout = {
  id: 'curved',
  name: 'Curved',
  description: 'The label follows the arc clockwise. Holds the longest labels on a fat wedge.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.78 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const placed = ctx.fit({ ...spec, orientation: 'curved', text: ctx.segment.label })
    if (!placed) return []
    return [
      {
        kind: 'curvedText',
        text: placed.text,
        anchor: placed.anchor,
        size: placed.size,
        frame: readFrame(params),
      },
    ]
  },
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/slice/layouts/layouts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/slice/layouts src/slice/layouts/layouts.test.ts
git commit -m "feat(slice): add radial, tangential, and curved layouts"
```

---

### Task 5: The auto layout

**Files:**
- Create: `src/slice/layouts/auto.ts`
- Test: `src/slice/layouts/auto.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/layouts/auto.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import type { Measure, SliceContext } from '../types'
import { auto } from './auto'

const measure: Measure = (text, size) => text.length * 0.5 * size

function context(overrides: Partial<SliceContext> = {}): SliceContext {
  return {
    segment: { id: 'a', label: 'Sleve McDichael', weight: 1 },
    arc: { start: 0, end: 0.125 },
    radius: 200,
    index: 0,
    count: 8,
    measure,
    fit: createFit(measure),
    ...overrides,
  }
}

describe('auto', () => {
  it('curves a full name on a fat wedge', () => {
    const [element] = auto.draw(auto.defaults, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'curvedText', text: 'Sleve McDichael' })
  })

  it('degrades to initials rather than drawing nothing on a sliver', () => {
    const [element] = auto.draw(auto.defaults, context({ arc: { start: 0, end: 0.006 } }))
    expect(element).toMatchObject({ text: 'SM' })
  })

  it('draws nothing when even initials will not fit', () => {
    expect(auto.draw(auto.defaults, context({ arc: { start: 0, end: 0.00001 } }))).toEqual([])
  })

  it('honors a ladder chosen through params', () => {
    const params = { ...auto.defaults, ladder: 'shrinkOnly' }
    expect(auto.draw(params, context({ arc: { start: 0, end: 0.004 } }))).toEqual([])
  })

  it('ignores an unknown ladder rather than throwing', () => {
    const params = { ...auto.defaults, ladder: '__proto__' }
    const [element] = auto.draw(params, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toBeDefined()
  })

  it('draws horizontal text in level frame', () => {
    const params = { ...auto.defaults, frame: 'level' }
    const [element] = auto.draw(params, context({ arc: { start: 0, end: 0.4 } }))
    expect(element).toMatchObject({ kind: 'text', along: 'tangential', frame: 'level' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/layouts/auto.test.ts`
Expected: FAIL — "Failed to resolve import './auto'".

- [ ] **Step 3: Write the implementation**

`src/slice/layouts/auto.ts`:

```ts
import { LADDERS, LADDER_OPTIONS, isLadderId, walkLadder } from '../ladder'
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, readFrame, specOf } from './shared'

export const auto: SliceLayout = {
  id: 'auto',
  name: 'Auto',
  description: 'Picks an orientation that fits, then shortens the label rather than dropping it.',
  defaults: { ...COMMON_DEFAULTS, ladder: 'shrinkNameInitials' },
  fields: [
    { key: 'ladder', label: "When it won't fit", kind: 'select', options: LADDER_OPTIONS },
    ...COMMON_FIELDS,
  ],
  draw(params, ctx) {
    const spec = specOf(params, ctx)
    const rungs = isLadderId(params.ladder) ? LADDERS[params.ladder] : LADDERS.shrinkNameInitials
    const placed = walkLadder(ctx.segment.label, rungs, spec, ctx.fit, ctx.measure)
    if (!placed) return []

    const frame = readFrame(params)
    // Level frame has no orientation to honor: the text is horizontal by
    // construction, so every rung that fits draws the same element.
    if (frame === 'level' || placed.orientation !== 'curved') {
      return [
        {
          kind: 'text',
          text: placed.text,
          along: frame === 'level' || placed.orientation === 'tangential' ? 'tangential' : 'radial',
          anchor: placed.anchor,
          size: placed.size,
          frame,
        },
      ]
    }

    return [
      { kind: 'curvedText', text: placed.text, anchor: placed.anchor, size: placed.size, frame },
    ]
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/layouts/auto.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/layouts/auto.ts src/slice/layouts/auto.test.ts
git commit -m "feat(slice): add the auto layout that walks the ladder"
```

---

### Task 6: The registry

**Files:**
- Create: `src/slice/registry.ts`
- Test: `src/slice/registry.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SLICE, SLICE_LIST, getSlice, resolveInstance } from './registry'

describe('getSlice', () => {
  it('resolves a known id', () => {
    expect(getSlice('curved')?.id).toBe('curved')
  })

  it('returns null for an unknown id', () => {
    expect(getSlice('nope')).toBeNull()
  })

  it('returns null for a prototype key rather than a function off the chain', () => {
    expect(getSlice('constructor')).toBeNull()
    expect(getSlice('__proto__')).toBeNull()
  })

  it('lists every registered layout', () => {
    expect(SLICE_LIST.map((layout) => layout.id).sort()).toEqual([
      'auto',
      'curved',
      'radial',
      'tangential',
    ])
  })
})

describe('resolveInstance', () => {
  it('prefers the segment instance', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1, slice: { id: 'radial' as const, params: {} } }
    expect(resolveInstance(segment, { id: 'curved', params: {} }).id).toBe('radial')
  })

  it('falls back to the wheel default', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1 }
    expect(resolveInstance(segment, { id: 'curved', params: {} }).id).toBe('curved')
  })

  it('falls back to auto when nothing is configured', () => {
    const segment = { id: 'a', label: 'Mike Truk', weight: 1 }
    expect(resolveInstance(segment, undefined)).toEqual(DEFAULT_SLICE)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/registry.test.ts`
Expected: FAIL — "Failed to resolve import './registry'".

- [ ] **Step 3: Write the implementation**

`src/slice/registry.ts`:

```ts
import type { Segment } from '../wheel/types'
import { auto } from './layouts/auto'
import { curved } from './layouts/curved'
import { radial } from './layouts/radial'
import { tangential } from './layouts/tangential'
import type { SliceInstance, SliceLayout, SliceLayoutId } from './types'

export const SLICE_LAYOUTS: Record<SliceLayoutId, SliceLayout> = { auto, radial, tangential, curved }

export const SLICE_LIST: SliceLayout[] = [auto, curved, tangential, radial]

export const DEFAULT_SLICE: SliceInstance = { id: 'auto', params: { ...auto.defaults } }

/**
 * Returns null rather than throwing, matching getTransition: ids come out of
 * localStorage, and a stored id of 'constructor' resolves through the prototype
 * chain to something that is not a layout.
 */
export function getSlice(id: string): SliceLayout | null {
  return Object.hasOwn(SLICE_LAYOUTS, id) ? SLICE_LAYOUTS[id as SliceLayoutId] : null
}

/** Segment override beats the wheel default beats the built-in. */
export function resolveInstance(
  segment: Segment,
  wheelDefault: SliceInstance | undefined,
): SliceInstance {
  return segment.slice ?? wheelDefault ?? DEFAULT_SLICE
}
```

- [ ] **Step 4: Run the test to verify it fails on a missing type**

Run: `npx vitest run src/slice/registry.test.ts`
Expected: FAIL — `Segment` has no `slice` property. Task 7 adds it; this is the next step, not a detour.

- [ ] **Step 5: Add the field to Segment**

In `src/wheel/types.ts`, add the import and the field:

```ts
import type { SliceInstance } from '../slice/types'

export type Segment = {
  id: string
  label: string
  /** Relative, not a percentage. Normalized at render time. Zero means present but invisible. */
  weight: number
  color?: string
  media?: Media
  reveal?: Reveal
  /** Overrides the wheel's layout for this wedge alone. */
  slice?: SliceInstance
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/slice/registry.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
npm run build
npm run check
git add src/slice/registry.ts src/slice/registry.test.ts src/wheel/types.ts
git commit -m "feat(slice): resolve layouts through a registry with a per-wedge override"
```

---

### Task 7: Wheel renders slice elements

**Files:**
- Modify: `src/wheel/Wheel.tsx`
- Modify: `src/wheel/Wheel.css`
- Create: `src/wheel/SliceElements.tsx`
- Delete: `src/wheel/label.ts`, `src/wheel/label.test.ts`
- Test: `src/wheel/SliceElements.test.tsx`, `src/wheel/Wheel.test.tsx`

- [ ] **Step 1: Write the failing element-rendering test**

`src/wheel/SliceElements.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SliceElement } from '../slice/types'
import { SliceElements } from './SliceElements'

function draw(elements: SliceElement[]) {
  const { container } = render(
    <svg>
      <SliceElements elements={elements} arc={{ start: 0, end: 0.25 }} radius={200} id="seg1" />
    </svg>,
  )
  return container
}

describe('SliceElements', () => {
  it('renders radial text rotated to the arc midpoint', () => {
    const container = draw([
      { kind: 'text', text: 'Mike Truk', along: 'radial', anchor: 0.62, size: 16 },
    ])
    const text = container.querySelector('text')
    expect(text?.textContent).toBe('Mike Truk')
    expect(text?.getAttribute('transform')).toContain('rotate(45)')
  })

  it('renders curved text against a path it also emits', () => {
    const container = draw([{ kind: 'curvedText', text: 'Dwigt Rortugal', anchor: 0.78, size: 14 }])
    const path = container.querySelector('path')
    const textPath = container.querySelector('textPath')
    expect(path?.id).toBeTruthy()
    expect(textPath?.getAttribute('href')).toBe(`#${path?.id}`)
  })

  it('wraps a level element in a counter-rotating group', () => {
    const container = draw([
      { kind: 'text', text: 'Ana', along: 'tangential', anchor: 0.66, size: 14, frame: 'level' },
    ])
    const level = container.querySelector('.wheel__level')
    expect(level?.getAttribute('transform')).toBe('rotate(-45)')
  })

  it('renders an image element', () => {
    const container = draw([{ kind: 'image', href: 'photo.png', anchor: 0.6, size: 40 }])
    expect(container.querySelector('image')?.getAttribute('href')).toBe('photo.png')
  })

  it('mounts a raw node as given', () => {
    const container = draw([{ kind: 'raw', node: <circle data-testid="raw" r={5} /> }])
    expect(container.querySelector('[data-testid="raw"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/SliceElements.test.tsx`
Expected: FAIL — "Failed to resolve import './SliceElements'".

- [ ] **Step 3: Write the element renderer**

`src/wheel/SliceElements.tsx`:

```tsx
import type { SliceElement } from '../slice/types'
import { concentricPath } from './geometry'

export type SliceElementsProps = {
  elements: SliceElement[]
  arc: { start: number; end: number }
  radius: number
  /** Segment id, used to make emitted path ids unique. */
  id: string
  /** Registers a level group so a spin can counter-rotate it. */
  levelRef?: (element: SVGGElement | null) => void
}

const round = (n: number): number => Number(n.toFixed(2))

export function SliceElements({ elements, arc, radius, id, levelRef }: SliceElementsProps) {
  const width = arc.end - arc.start
  const midDeg = round((arc.start + width / 2) * 360)

  return (
    <>
      {elements.map((element, index) => {
        const key = `${id}-${index}`

        if (element.kind === 'raw') return <g key={key}>{element.node}</g>

        if (element.kind === 'path') {
          return (
            <path key={key} d={element.d} fill={element.fill ?? 'none'} opacity={element.opacity} />
          )
        }

        if (element.kind === 'curvedText') {
          const pathId = `slice-${key}`
          return (
            <g key={key}>
              <path
                id={pathId}
                d={concentricPath(arc.start, arc.end, radius * element.anchor)}
                fill="none"
              />
              <text className="wheel__label" fontSize={element.size} textAnchor="middle">
                <textPath href={`#${pathId}`} startOffset="50%">
                  {element.text}
                </textPath>
              </text>
            </g>
          )
        }

        const anchorRadius = round(radius * element.anchor)

        if (element.frame === 'level') {
          return (
            <g key={key} transform={`rotate(${midDeg}) translate(0 ${-anchorRadius})`}>
              {/* The animation replaces this transform; it is the resting value.
                  Level content must be centered on this group's own origin. */}
              <g className="wheel__level" transform={`rotate(${-midDeg})`} ref={levelRef}>
                {element.kind === 'image' ? (
                  <image
                    href={element.href}
                    x={-element.size / 2}
                    y={-element.size / 2}
                    width={element.size}
                    height={element.size}
                  />
                ) : (
                  <text
                    className="wheel__label"
                    fontSize={element.size}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {element.text}
                  </text>
                )}
              </g>
            </g>
          )
        }

        if (element.kind === 'image') {
          return (
            <image
              key={key}
              href={element.href}
              x={-element.size / 2}
              y={-element.size / 2}
              width={element.size}
              height={element.size}
              transform={`rotate(${midDeg}) translate(0 ${-anchorRadius})`}
            />
          )
        }

        // Single handedness: radial text always runs outward, never flipped by
        // which half of the wheel the wedge happens to sit on.
        const along = element.along === 'radial' ? ' rotate(-90)' : ''
        return (
          <text
            key={key}
            className="wheel__label"
            fontSize={element.size}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${midDeg}) translate(0 ${-anchorRadius})${along}`}
          >
            {element.text}
          </text>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Add the concentric path helper**

Append to `src/wheel/geometry.ts`:

```ts
/** A clockwise arc at `radius`, for text to run along. */
export function concentricPath(start: number, end: number, radius: number): string {
  const [x0, y0] = pointOnCircle(start, radius)
  const [x1, y1] = pointOnCircle(end, radius)
  const largeArc = end - start > 0.5 ? 1 : 0
  return `M ${x0} ${y0} A ${round(radius)} ${round(radius)} 0 ${largeArc} 1 ${x1} ${y1}`
}
```

Add to `src/wheel/geometry.test.ts`:

```ts
describe('concentricPath', () => {
  it('sweeps clockwise from start to end', () => {
    expect(concentricPath(0, 0.25, 100)).toBe('M 0 -100 A 100 100 0 0 1 100 0')
  })

  it('sets the large-arc flag past a half turn', () => {
    expect(concentricPath(0, 0.75, 100)).toContain('0 1 1')
  })
})
```

Update that file's import to include `concentricPath`.

- [ ] **Step 5: Add the level-frame CSS**

Append to `src/wheel/Wheel.css`:

```css
/* The counter-rotation has to pivot on the label itself. Without these, a CSS
   transform on an SVG element resolves its origin against the viewBox and the
   label orbits the hub instead of holding still. */
.wheel__level {
  transform-box: fill-box;
  transform-origin: center;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/SliceElements.test.tsx src/wheel/geometry.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing Wheel test**

Add to `src/wheel/Wheel.test.tsx`:

```tsx
it('draws a label through the resolved layout', () => {
  const { container } = render(
    <Wheel segments={[{ id: 'a', label: 'Willie Dustice', weight: 1 }]} />,
  )
  expect(container.textContent).toContain('Willie Dustice')
})

it('honors a per-segment layout override', () => {
  const { container } = render(
    <Wheel
      segments={[
        { id: 'a', label: 'Todd Bonzalez', weight: 1, slice: { id: 'radial', params: {} } },
      ]}
    />,
  )
  expect(container.querySelector('textPath')).toBeNull()
})

it('resolves layouts against layoutFrom when given one', () => {
  const { container } = render(
    <Wheel
      segments={[
        { id: 'a', label: 'Scott Dourque', weight: 0.001 },
        { id: 'b', label: 'Shown Furcotte', weight: 100 },
      ]}
      layoutFrom={[
        { id: 'a', label: 'Scott Dourque', weight: 1 },
        { id: 'b', label: 'Shown Furcotte', weight: 1 },
      ]}
    />,
  )
  expect(container.textContent).toContain('Scott Dourque')
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run src/wheel/Wheel.test.tsx`
Expected: FAIL — `layoutFrom` is not a prop; the override test finds a `textPath`.

- [ ] **Step 9: Rewrite Wheel.tsx**

Replace the body of `src/wheel/Wheel.tsx` with:

```tsx
import type { Ref } from 'react'
import { useMemo } from 'react'
import { createMeasure } from '../slice/measure'
import { createFit } from '../slice/fit'
import { getSlice, resolveInstance } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
import type { Transitions } from '../transition/types'
import { useEnter } from '../transition/useEnter'
import { arcPath, arcs } from './geometry'
import { paletteColor } from './palette'
import { SliceElements } from './SliceElements'
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
}

const POINTER_BITE = 3
const POINTER_LENGTH = 22
const POINTER_HALF_WIDTH = 12
const POINTER_BASE = POINTER_LENGTH - POINTER_BITE
const VIEWBOX_PAD = POINTER_BASE + 2

export function Wheel({
  segments,
  radius = 200,
  rotationDeg = 0,
  rotorRef,
  transitions,
  slice,
  layoutFrom,
}: WheelProps) {
  const layout = arcs(segments)
  const half = radius + VIEWBOX_PAD
  const viewBox = `${-half} ${-half} ${half * 2} ${half * 2}`

  const wedgeRef = useEnter(segments, transitions?.enter, radius)

  // One measurer per wheel, so the string cache outlives a render.
  const measure = useMemo(() => createMeasure(), [])
  const fit = useMemo(() => createFit(measure), [measure])

  const resolveArcs = layoutFrom ? arcs(layoutFrom) : layout

  return (
    <svg className="wheel" viewBox={viewBox} role="img" aria-label="wheel">
      <g className="wheel__stage">
        <g className="wheel__rotor" transform={`rotate(${rotationDeg})`} ref={rotorRef}>
          {layout.map((arc, index) => {
            const width = arc.end - arc.start
            if (!(width > 0)) return null

            const segment = segments[index]
            const d = arcPath(arc.start, arc.end, radius)
            if (d === '') return null

            const color = segment.color ?? paletteColor(index)
            const instance = resolveInstance(segment, slice)
            const authored = getSlice(instance.id)
            const resolveArc = resolveArcs[index] ?? arc
            const elements = authored
              ? authored.draw(instance.params, {
                  segment,
                  arc: { start: resolveArc.start, end: resolveArc.end },
                  radius,
                  index,
                  count: segments.length,
                  measure,
                  fit,
                })
              : []

            return (
              <g
                key={segment.id}
                className="wheel__wedge"
                data-segment-id={segment.id}
                ref={wedgeRef(segment.id)}
              >
                <path className="wheel__segment" d={d} fill={color} />
                <SliceElements
                  elements={elements}
                  arc={arc}
                  radius={radius}
                  id={segment.id}
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

- [ ] **Step 10: Delete the module Wheel no longer uses**

```bash
git rm src/wheel/label.ts src/wheel/label.test.ts
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: PASS. Wheel tests asserting on the old truncation behavior will fail; update them to assert on what the ladder now produces (a shortened label, not an ellipsis) rather than deleting them.

- [ ] **Step 12: Commit**

```bash
npm run build
npm run check
git add -A src/wheel
git commit -m "feat(wheel): draw wedges through the slice registry"
```

---

### Task 8: Persist the layout on presets and overrides

**Files:**
- Modify: `src/preset/types.ts`
- Modify: `src/feed/types.ts`
- Modify: `src/preset/storage.ts`
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/preset/storage.test.ts`:

```ts
describe('slice layouts', () => {
  const withSlice = (slice: unknown) =>
    parsePreset(JSON.stringify({ ...DEFAULT_PRESET, version: 4, slice }))

  it('keeps a known layout with its params', () => {
    expect(withSlice({ id: 'curved', params: { anchor: 0.8 } }).slice).toEqual({
      id: 'curved',
      params: { anchor: 0.8 },
    })
  })

  it('drops an unknown layout id', () => {
    expect(withSlice({ id: 'spiral', params: {} }).slice).toBeUndefined()
  })

  it('drops a prototype key rather than resolving it', () => {
    expect(withSlice({ id: 'constructor', params: {} }).slice).toBeUndefined()
  })

  it('defaults missing params to an empty object', () => {
    expect(withSlice({ id: 'auto' }).slice).toEqual({ id: 'auto', params: {} })
  })

  it('reads a per-segment layout', () => {
    const preset = parsePreset(
      JSON.stringify({
        ...DEFAULT_PRESET,
        version: 4,
        segments: [{ id: 'a', label: 'Karl Dandleton', weight: 1, slice: { id: 'radial' } }],
      }),
    )
    expect(preset.segments[0].slice).toEqual({ id: 'radial', params: {} })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — `slice` is not a property of `Preset`.

- [ ] **Step 3: Add the fields**

In `src/preset/types.ts`, add the import and the field:

```ts
import type { SliceInstance } from '../slice/types'
```

```ts
export type Preset = {
  version: 4
  name: string
  /** Statics. Feed items and trick wedges join these at compose time. */
  segments: Segment[]
  feeds: FeedConfig[]
  /** Keyed by FeedItem.id, not by wedge id: an override outlives its feed. */
  overrides: Record<string, ItemOverride>
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
  /** Absent means no transition at that moment, which is the behavior that predates them. */
  transitions?: Transitions
  /** The wheel's default slice layout. Absent means the built-in `auto`. */
  slice?: SliceInstance
}
```

In `src/feed/types.ts`, add `slice?: SliceInstance` to `ItemOverride` alongside its other optional fields, importing the type the same way.

- [ ] **Step 4: Add the reader**

In `src/preset/storage.ts`, add the import:

```ts
import { getSlice } from '../slice/registry'
import type { SliceInstance } from '../slice/types'
```

Add the reader next to `readTransitions`:

```ts
function readSlice(value: unknown): SliceInstance | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const layout = getSlice(value.id)
  if (!layout) return undefined
  return { id: layout.id, params: isRecord(value.params) ? value.params : {} }
}
```

In `readSegments`, after the reveal line:

```ts
    const slice = readSlice(entry.slice)
    if (slice !== undefined) segment.slice = slice
```

In `readOverrides`, apply the same two lines to the override being built.

In `parsePreset`'s return object, after `transitions`:

```ts
    slice: readSlice(data.slice),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run build
npm run check
git add src/preset src/feed/types.ts
git commit -m "feat(preset): carry a slice layout on the wheel, a wedge, and an override"
```

---

### Task 9: Compose applies the item override

**Files:**
- Modify: `src/compose/compose.ts:40-51`
- Test: `src/compose/compose.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/compose/compose.test.ts`:

```ts
it('applies a slice override to a feed wedge', () => {
  const composition = composeBase({
    statics: [],
    feeds: [{ id: 'sim', kind: 'simulated', defaults: { weight: 1 }, params: {} }],
    items: { sim: [{ id: 'truk', label: 'Mike Truk' }] },
    overrides: { truk: { slice: { id: 'curved', params: {} } } },
  })
  expect(composition.segments[0].slice).toEqual({ id: 'curved', params: {} })
})

it('leaves a feed wedge with no slice when nothing overrides it', () => {
  const composition = composeBase({
    statics: [],
    feeds: [{ id: 'sim', kind: 'simulated', defaults: { weight: 1 }, params: {} }],
    items: { sim: [{ id: 'gride', label: 'Jeromy Gride' }] },
    overrides: {},
  })
  expect(composition.segments[0].slice).toBeUndefined()
})
```

Match the `FeedConfig` shape the neighboring tests in this file already build; the two above are illustrative of the fields, not a new shape.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/compose/compose.test.ts`
Expected: FAIL — `slice` is undefined on the composed segment.

- [ ] **Step 3: Add the line**

In `toSegment` in `src/compose/compose.ts`, after the reveal line:

```ts
  if (override?.slice !== undefined) segment.slice = override.slice
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/compose/compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/compose
git commit -m "feat(compose): carry a slice override onto a feed wedge"
```

---

### Task 10: Freeze layout resolution while a spin holds the wheel

**Files:**
- Modify: `src/wheel/useSpin.ts`
- Modify: `src/App.tsx:62-65,111`
- Test: `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/wheel/useSpin.test.ts`:

```ts
it('exposes the landed frame as the layout geometry while a spin is held', async () => {
  const segments = [
    { id: 'a', label: 'Sleve McDichael', weight: 1 },
    { id: 'b', label: 'Onson Sweemey', weight: 1 },
  ]
  const config = {
    durationMs: 10,
    fullSpins: 1,
    direction: 'cw' as const,
    easing: [0, 0, 1, 1] as [number, number, number, number],
    morphs: [
      {
        segmentId: 'a',
        durationMs: 10,
        keyframes: [
          { at: 0, weight: 1 },
          { at: 1, weight: 9 },
        ],
      },
    ],
  }

  const { result } = renderHook(() => useSpin(segments, config))
  act(() => result.current.spin())

  // Mid-spin, the drawn geometry is morphing while the layout geometry is not.
  expect(result.current.layoutSegments.find((s) => s.id === 'a')?.weight).toBe(9)
})
```

Follow the mocking this file already uses for `Element.prototype.animate`; the assertion above is the new part.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: FAIL — `layoutSegments` is not on the result.

- [ ] **Step 3: Implement it**

In `src/wheel/useSpin.ts`, add to `UseSpinResult`:

```ts
  /**
   * The geometry layouts resolve against. A morph changes weights every frame,
   * and re-walking the ladder on each of them pops labels between orientations
   * mid-spin, so a held wheel resolves against where it will land.
   */
  layoutSegments: Segment[]
```

Add the state next to `displaySegments`:

```ts
  const [layoutSegments, setLayoutSegments] = useState(segments)
```

In the resync effect, alongside `setDisplaySegments(segments)`:

```ts
    setLayoutSegments(segments)
```

In `reset`, alongside its `setDisplaySegments(segments)`:

```ts
    setLayoutSegments(segments)
```

In `spin`, right after `setDisplaySegments(spinSegments)`:

```ts
      setLayoutSegments(landedFrame)
```

Return it:

```ts
  return { displaySegments, layoutSegments, isSpinning, landing, spin, release, reset, rotorRef }
```

- [ ] **Step 4: Wire it through App**

In `src/App.tsx`, destructure the new value:

```tsx
  const { displaySegments, layoutSegments, isSpinning, landing, spin, release, reset, rotorRef } =
    useSpin(resolved.segments, config)
```

And pass both it and the preset's layout to the wheel:

```tsx
      <Wheel
        segments={displaySegments}
        layoutFrom={layoutSegments}
        slice={preset.slice}
        rotorRef={rotorRef}
        transitions={preset.transitions}
      />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/useSpin.test.ts src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run build
npm run check
git add src/wheel/useSpin.ts src/wheel/useSpin.test.ts src/App.tsx
git commit -m "fix(wheel): resolve layouts against the landed frame during a spin"
```

---

### Task 11: Level frame counter-rotation

**Files:**
- Modify: `src/wheel/rotation.ts`
- Modify: `src/wheel/useSpin.ts`
- Modify: `src/wheel/Wheel.tsx`, `src/wheel/SliceElements.tsx`
- Test: `src/wheel/rotation.test.ts`, `src/wheel/useSpin.test.ts`

- [ ] **Step 1: Write the failing track test**

Add to `src/wheel/rotation.test.ts`:

```ts
describe('invertTrack', () => {
  const spec = {
    durationMs: 1000,
    fullSpins: 2,
    direction: 'cw' as const,
    easing: [0, 0, 1, 1] as [number, number, number, number],
  }

  it('negates every angle and holds the offsets and easings', () => {
    const track = rotationTrack(0, 90, spec)
    const inverted = invertTrack(track, 0)
    expect(inverted).toHaveLength(track.keyframes.length)
    expect(inverted[inverted.length - 1].transform).toBe(`rotate(${-track.to}deg)`)
  })

  it('carries the element's own resting angle into every frame', () => {
    const track = rotationTrack(0, 90, spec)
    const inverted = invertTrack(track, -45)
    expect(inverted[0].transform).toBe('rotate(-45deg)')
  })

  it('preserves a settle track's offsets and easings', () => {
    const track = rotationTrack(0, 90, { ...spec, settle: { ms: 300, curve: [0, 0, 0.2, 1] } })
    const inverted = invertTrack(track, 0)
    expect(inverted.map((frame) => frame.offset)).toEqual(
      track.keyframes.map((frame) => frame.offset),
    )
    expect(inverted[1].easing).toBe(track.keyframes[1].easing)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/wheel/rotation.test.ts`
Expected: FAIL — `invertTrack` is not exported.

- [ ] **Step 3: Implement invertTrack**

Append to `src/wheel/rotation.ts`:

```ts
/** Matches the `rotate(Ndeg)` the track emits, so the inverse reads the same values back. */
const ANGLE = /^rotate\((-?[\d.]+)deg\)$/

/**
 * The rotation a level element runs so its orientation stays put while its
 * anchor orbits. Same offsets, same easings, negated angles, offset by the
 * element's own resting rotation — derived from the rotor's own track rather
 * than recomputed, so the two cannot drift apart.
 */
export function invertTrack(track: RotationTrack, restingDeg: number): Keyframe[] {
  return track.keyframes.map((frame) => {
    const match = ANGLE.exec(String(frame.transform ?? ''))
    const angle = match ? Number(match[1]) : 0
    const inverted: Keyframe = { ...frame, transform: `rotate(${restingDeg - angle}deg)` }
    return inverted
  })
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/wheel/rotation.test.ts`
Expected: PASS.

- [ ] **Step 5: Register level groups and animate them**

In `src/wheel/useSpin.ts`, add a registrar mirroring `useEnter`'s, above the returned object:

```ts
  const levels = useRef(new Map<string, { element: SVGGElement; restingDeg: number }>()).current
  const levelRefs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current

  const levelRef = useCallback(
    (id: string, restingDeg: number) => {
      let ref = levelRefs.get(id)
      if (!ref) {
        ref = (element) => {
          if (element) levels.set(id, { element, restingDeg })
          else levels.delete(id)
        }
        levelRefs.set(id, ref)
      }
      return ref
    },
    [levels, levelRefs],
  )
```

Inside `spin`, immediately after the rotor animation is created:

```ts
      // Level elements hold their orientation by running the rotor's rotation
      // backwards on the same timeline. No per-frame work, and no drift: both
      // come from one track.
      for (const { element, restingDeg } of levels.values()) {
        element.animate(invertTrack(track, restingDeg), {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        })
      }
```

Import `invertTrack` alongside `rotationTrack`, and add `levelRef` to `UseSpinResult` and to the returned object:

```ts
  /** Registers a level group by segment id so a spin can counter-rotate it. */
  levelRef: (id: string, restingDeg: number) => (element: SVGGElement | null) => void
```

- [ ] **Step 6: Thread the registrar through Wheel**

Add to `WheelProps` in `src/wheel/Wheel.tsx`:

```tsx
  levelRef?: (id: string, restingDeg: number) => (element: SVGGElement | null) => void
```

Pass it into `SliceElements`, which already accepts a `levelRef`:

```tsx
                <SliceElements
                  elements={elements}
                  arc={arc}
                  radius={radius}
                  id={segment.id}
                  levelRef={levelRef?.(segment.id, -(arc.start + width / 2) * 360)}
                />
```

In `src/App.tsx`, destructure `levelRef` from `useSpin` and pass `levelRef={levelRef}` to `<Wheel>`.

- [ ] **Step 7: Write the failing integration test**

Add to `src/wheel/useSpin.test.ts`:

```ts
it('counter-animates a registered level group', () => {
  const { result } = renderHook(() =>
    useSpin([{ id: 'a', label: 'Tim Sandaele', weight: 1 }], config),
  )

  const element = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  const animate = vi.spyOn(element, 'animate').mockReturnValue({
    finished: Promise.resolve(),
    cancel: () => {},
  } as unknown as Animation)

  act(() => result.current.levelRef('a', -45)(element))
  act(() => result.current.spin())

  const frames = animate.mock.calls[0][0] as Keyframe[]
  expect(String(frames[0].transform)).toBe('rotate(-45deg)')
})
```

Reuse the `config` and rotor-animation mocking the file already sets up.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/wheel/useSpin.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npm run build
npm run check
git add src/wheel src/App.tsx
git commit -m "feat(wheel): hold level labels upright with an inverse rotation"
```

---

### Task 12: The slice layout panel

**Files:**
- Create: `src/editor/SlicePanel.tsx`
- Test: `src/editor/SlicePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/editor/SlicePanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlicePanel } from './SlicePanel'

describe('SlicePanel', () => {
  it('starts a chosen layout on its defaults', async () => {
    const onChange = vi.fn()
    render(<SlicePanel slice={undefined} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'curved')

    expect(onChange).toHaveBeenCalledWith({ id: 'curved', params: expect.objectContaining({ frame: 'wheel' }) })
  })

  it('renders the chosen layout's own fields', () => {
    render(<SlicePanel slice={{ id: 'auto', params: {} }} onChange={vi.fn()} />)
    expect(screen.getByLabelText("When it won't fit")).toBeInTheDocument()
  })

  it('drops back to the built-in default when cleared', async () => {
    const onChange = vi.fn()
    render(<SlicePanel slice={{ id: 'curved', params: {} }} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), '')

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('ignores a stored id that names no layout', () => {
    render(<SlicePanel slice={{ id: 'spiral' as never, params: {} }} onChange={vi.fn()} />)
    expect(screen.queryByLabelText("When it won't fit")).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/editor/SlicePanel.test.tsx`
Expected: FAIL — "Failed to resolve import './SlicePanel'".

- [ ] **Step 3: Write the panel**

`src/editor/SlicePanel.tsx`:

```tsx
import { PropertyPanel, SelectRow } from '@weasel-js/labkit'
import { SLICE_LIST, getSlice } from '../slice/registry'
import type { SliceInstance, SliceParams } from '../slice/types'
import { RecipeForm } from './RecipeForm'

export type SlicePanelProps = {
  slice: SliceInstance | undefined
  onChange: (slice: SliceInstance | undefined) => void
}

const NONE = ''

export function SlicePanel({ slice, onChange }: SlicePanelProps) {
  const layout = slice ? getSlice(slice.id) : null

  const choose = (value: string) => {
    if (value === NONE) {
      onChange(undefined)
      return
    }
    const chosen = getSlice(value)
    if (!chosen) return
    onChange({ id: chosen.id, params: { ...chosen.defaults } })
  }

  const edit = (params: SliceParams) => {
    if (!slice) return
    onChange({ ...slice, params })
  }

  return (
    <PropertyPanel title="Slice layout">
      <SelectRow
        label="Layout"
        value={layout?.id ?? NONE}
        options={[
          { value: NONE, label: 'Auto (default)' },
          ...SLICE_LIST.map((item) => ({ value: item.id, label: item.name })),
        ]}
        onChange={choose}
      />
      {layout && slice ? (
        <RecipeForm fields={layout.fields} params={slice.params} segments={[]} onChange={edit} />
      ) : null}
    </PropertyPanel>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/editor/SlicePanel.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/editor/SlicePanel.tsx src/editor/SlicePanel.test.tsx
git commit -m "feat(editor): pick the wheel's slice layout"
```

---

### Task 13: The fit report

**Files:**
- Create: `src/slice/report.ts`
- Create: `src/editor/FitReport.tsx`
- Test: `src/slice/report.test.ts`, `src/editor/FitReport.test.tsx`

- [ ] **Step 1: Write the failing report test**

`src/slice/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitReport } from './report'
import type { Measure } from './types'

const measure: Measure = (text, size) => text.length * 0.5 * size

describe('fitReport', () => {
  it('reports the label a wedge will actually draw', () => {
    const [row] = fitReport(
      [{ id: 'a', label: 'Sleve McDichael', weight: 1 }],
      undefined,
      200,
      measure,
    )
    expect(row).toMatchObject({ id: 'a', label: 'Sleve McDichael', degraded: false })
    expect(row.drawn).toBe('Sleve McDichael')
  })

  it('marks a wedge that had to shorten', () => {
    const rows = fitReport(
      [
        { id: 'a', label: 'Sleve McDichael', weight: 100 },
        { id: 'b', label: 'Todd Bonzalez', weight: 0.3 },
      ],
      undefined,
      200,
      measure,
    )
    expect(rows[1].degraded).toBe(true)
  })

  it('marks a wedge that draws nothing', () => {
    const [row] = fitReport(
      [
        { id: 'a', label: 'Raul Chamgerlain', weight: 0.00001 },
        { id: 'b', label: 'Kevin Nogilny', weight: 100 },
      ],
      undefined,
      200,
      measure,
    )
    expect(row).toMatchObject({ drawn: null, degraded: true })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/slice/report.test.ts`
Expected: FAIL — "Failed to resolve import './report'".

- [ ] **Step 3: Write the report**

`src/slice/report.ts`:

```ts
import { arcs } from '../wheel/geometry'
import type { Segment } from '../wheel/types'
import { createFit } from './fit'
import { getSlice, resolveInstance } from './registry'
import type { Measure, SliceInstance } from './types'

export type FitRow = {
  id: string
  label: string
  /** What the wedge will draw, or null when it draws no text at all. */
  drawn: string | null
  size: number | null
  /** The label is not being shown as authored. */
  degraded: boolean
}

/** What each wedge resolves to, for an operator to read before the wheel is on a screen. */
export function fitReport(
  segments: Segment[],
  wheelDefault: SliceInstance | undefined,
  radius: number,
  measure: Measure,
): FitRow[] {
  const fit = createFit(measure)
  const layout = arcs(segments)

  return segments.map((segment, index) => {
    const instance = resolveInstance(segment, wheelDefault)
    const authored = getSlice(instance.id)
    const arc = layout[index]
    const elements = authored
      ? authored.draw(instance.params, {
          segment,
          arc: { start: arc.start, end: arc.end },
          radius,
          index,
          count: segments.length,
          measure,
          fit,
        })
      : []

    const text = elements.find(
      (element) => element.kind === 'text' || element.kind === 'curvedText',
    ) as { text: string; size: number } | undefined

    return {
      id: segment.id,
      label: segment.label,
      drawn: text?.text ?? null,
      size: text?.size ?? null,
      degraded: text === undefined || text.text !== segment.label,
    }
  })
}
```

- [ ] **Step 4: Write the failing component test**

`src/editor/FitReport.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FitReport } from './FitReport'

describe('FitReport', () => {
  it('names what a degraded wedge will draw instead', () => {
    render(
      <FitReport
        segments={[
          { id: 'a', label: 'Sleve McDichael', weight: 100 },
          { id: 'b', label: 'Todd Bonzalez', weight: 0.2 },
        ]}
        slice={undefined}
      />,
    )
    expect(screen.getByText('Todd Bonzalez')).toBeInTheDocument()
    expect(screen.getByText('TB')).toBeInTheDocument()
  })

  it('says so when a wedge draws no label', () => {
    render(
      <FitReport
        segments={[
          { id: 'a', label: 'Raul Chamgerlain', weight: 0.00001 },
          { id: 'b', label: 'Kevin Nogilny', weight: 100 },
        ]}
        slice={undefined}
      />,
    )
    expect(screen.getByText('no label')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Write the component**

`src/editor/FitReport.tsx`:

```tsx
import { PropertyPanel } from '@weasel-js/labkit'
import { useMemo } from 'react'
import { createMeasure } from '../slice/measure'
import { fitReport } from '../slice/report'
import type { SliceInstance } from '../slice/types'
import type { Segment } from '../wheel/types'

export type FitReportProps = {
  segments: Segment[]
  slice: SliceInstance | undefined
  radius?: number
}

export function FitReport({ segments, slice, radius = 200 }: FitReportProps) {
  const measure = useMemo(() => createMeasure(), [])
  const rows = fitReport(segments, slice, radius, measure)

  return (
    <PropertyPanel title="Fit report">
      <ul className="fit-report">
        {rows.map((row) => (
          <li
            className={`fit-report__row${row.degraded ? ' fit-report__row--degraded' : ''}`}
            key={row.id}
          >
            <span className="fit-report__label">{row.label}</span>
            <span className="fit-report__drawn">{row.drawn ?? 'no label'}</span>
          </li>
        ))}
      </ul>
    </PropertyPanel>
  )
}
```

Add to `src/editor/Editor.css`:

```css
.fit-report {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8rem;
}

.fit-report__row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.2rem 0;
}

.fit-report__row--degraded .fit-report__drawn {
  font-weight: 600;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/slice/report.test.ts src/editor/FitReport.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
npm run check
git add src/slice/report.ts src/slice/report.test.ts src/editor/FitReport.tsx src/editor/FitReport.test.tsx src/editor/Editor.css
git commit -m "feat(editor): report what each wedge will actually draw"
```

---

### Task 14: Per-wedge override and editor wiring

**Files:**
- Modify: `src/editor/SegmentList.tsx`
- Modify: `src/editor/Editor.tsx`
- Test: `src/editor/SegmentList.test.tsx`, `src/editor/Editor.test.tsx`

- [ ] **Step 1: Write the failing SegmentList test**

Add to `src/editor/SegmentList.test.tsx`:

```tsx
it('sets a layout override from the row disclosure', async () => {
  const onChange = vi.fn()
  render(
    <SegmentList
      segments={[{ id: 'a', label: 'Dean Wesrey', weight: 1 }]}
      base={{ segments: [], origins: new Map() }}
      tricks={[]}
      showOwners={false}
      selectedTrickId={null}
      onChange={onChange}
      onSelectTrick={vi.fn()}
    />,
  )

  await userEvent.selectOptions(screen.getByLabelText('Layout of Dean Wesrey'), 'radial')

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ slice: { id: 'radial', params: expect.any(Object) } }),
  ])
})

it('clears the override back to the wheel default', async () => {
  const onChange = vi.fn()
  render(
    <SegmentList
      segments={[{ id: 'a', label: 'Dean Wesrey', weight: 1, slice: { id: 'radial', params: {} } }]}
      base={{ segments: [], origins: new Map() }}
      tricks={[]}
      showOwners={false}
      selectedTrickId={null}
      onChange={onChange}
      onSelectTrick={vi.fn()}
    />,
  )

  await userEvent.selectOptions(screen.getByLabelText('Layout of Dean Wesrey'), '')

  expect(onChange).toHaveBeenCalledWith([expect.not.objectContaining({ slice: expect.anything() })])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/editor/SegmentList.test.tsx`
Expected: FAIL — no element labelled "Layout of Dean Wesrey".

- [ ] **Step 3: Add the control to the disclosure**

In `src/editor/SegmentList.tsx`, import the registry:

```tsx
import { SLICE_LIST, getSlice } from '../slice/registry'
```

Inside the `<li>` for each segment, next to `<RevealEditor>`:

```tsx
            <select
              className="segment-list__slice"
              aria-label={`Layout of ${segment.label}`}
              value={segment.slice?.id ?? ''}
              onChange={(event) => {
                const chosen = getSlice(event.target.value)
                replace(index, {
                  slice: chosen ? { id: chosen.id, params: { ...chosen.defaults } } : undefined,
                })
              }}
            >
              <option value="">Wheel default</option>
              {SLICE_LIST.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
```

`replace` already deletes keys set to `undefined`, so clearing the override leaves no `slice: undefined` behind for the serializer.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/editor/SegmentList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing Editor test**

Add to `src/editor/Editor.test.tsx`:

```tsx
it('shows the slice layout panel and its fit report', () => {
  render(<Editor />)
  expect(screen.getByText('Slice layout')).toBeInTheDocument()
  expect(screen.getByText('Fit report')).toBeInTheDocument()
})
```

- [ ] **Step 6: Mount both panels**

In `src/editor/Editor.tsx`, import them:

```tsx
import { FitReport } from './FitReport'
import { SlicePanel } from './SlicePanel'
```

Render them in the same column as `TransitionPanel`, following the existing patch idiom that column already uses to update the preset:

```tsx
        <SlicePanel
          slice={preset.slice}
          onChange={(slice) => update({ ...preset, slice })}
        />
        <FitReport segments={composition.segments} slice={preset.slice} />
```

Match the names this file already uses for the preset updater and the composed segment list rather than introducing new ones.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npm run build
npm run check
git add src/editor
git commit -m "feat(editor): override a wedge's layout and show the fit report"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Frame (`wheel` default, `level`) | 1 (type), 2 (budget), 7 (render), 11 (animation) |
| Taxonomy — orientation, content, anchor | 2, 3, 4 |
| The ladder | 3, 5 |
| `draw()` contract and element vocabulary | 1, 4, 5, 7 |
| Measurement | 1 |
| Configuration and precedence | 6, 8, 9 |
| Mid-spin stability | 10 |
| Level frame without a rAF loop | 11 |
| Editor — panel, override, fit report | 12, 13, 14 |
| `label.ts` deleted | 7 |

**Known gaps, deliberate:** `image` elements render but no shipped layout emits one — the spec puts `portrait` behind the avatars work. `SliceContext` carries no spin state, also per the spec.

**Type consistency:** `SliceInstance`, `SliceLayout`, `SliceParams`, `SliceElement`, `SliceContext`, `FitSpec`, `Placement`, `Measure`, `Frame`, `Orientation`, `ContentTransform` are defined in Task 1 and used unchanged after. `budget`/`levelRoom`/`createFit` (Task 2) are consumed by Task 3's `walkLadder` and Task 4's layouts with the signatures defined. `resolveInstance` (Task 6) is called by Task 7's `Wheel` and Task 13's `fitReport`. `invertTrack` (Task 11) takes the `RotationTrack` that `rotationTrack` already returns.
