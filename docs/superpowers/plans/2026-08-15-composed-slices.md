# Composed Slices Implementation Plan (glyph mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one wedge carry several pieces of type and imagery — each owning its own band of the radius — and add the three Wheel-of-Fortune typesetting orientations, all drawn as per-glyph `<text>` placements.

**Architecture:** A new pure module `src/slice/typeset.ts` turns one `SlicePart` plus a `SliceContext` into `SliceElement[]`. The new orientations (`stacked`, `taperedRadial`, `archedRim`) solve per-glyph sizes and positions and emit one new element kind, `glyphRun`; the three orientations that exist today (`radial`, `tangential`, `curved`) keep going through `ctx.fit` and keep emitting `text`/`curvedText`. A new `composed` layout reads a `parts` array and concatenates each part's elements. The three shipped layouts and `auto` are rewritten as one-part compositions so every layout emits through `typeset`, and the renderer gains exactly one new branch.

**Tech Stack:** TypeScript, React 19, SVG, Vitest + Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-08-15-composed-slices-design.md` — this plan is the first of the two the spec's "Suggested order" calls for.

**Conventions for every task:**
- Run one test file with `npx vitest run src/path/to/file.test.ts`.
- Run everything with `npm test`.
- Run `npm run check` (Biome) before each commit; it rewrites formatting in place.
- Type-check with `npm run build` when a task changes a shared type. `noUnusedLocals` is on, so an import added a task early fails the build.

---

## Two decisions this plan makes that the spec leaves open

Both are called out here so a reviewer can overrule them before any code is written.

**The three existing orientations stay on `ctx.fit` and keep their element kinds.** The spec asks for "one code path", and it gets one: `typeset` is the only function a layout calls, and every registered layout's `draw` is a call to it. But inside `typeset`, a `radial`/`tangential`/`curved` part still resolves through `ctx.fit` and still emits `text`/`curvedText`. Re-drawing them as glyph runs would change every shipped wheel's appearance and rewrite every existing slice test for no gain in this half; the new orientations are where the WoF typesetting lives.

**The shear on a run set across the wedge is deferred.** The spec describes a shear that leans an across-wedge glyph run to follow the converging sides. The only across-wedge run in this half is the legacy `tangential` element, which is a single `<text>` and has nowhere to put a per-glyph shear. It lands with the second plan, alongside the across-wedge glyph run it applies to.

Also deferred to the second plan, per the spec: outline mode, the font registry, the baked specimens, and `Theme.font`. `SlicePart` carries `shape` and `font` from the start — `readParts` validates them and `typeset` ignores them — so the second plan is additive and no preset needs migrating.

---

### Task 1: Widen the slice types

**Files:**
- Modify: `src/slice/types.ts`
- Modify: `src/slice/fit.ts:53-71`

No test of its own: types are checked by `npm run build` and exercised by every task after this one.

- [ ] **Step 1: Widen `Orientation` and `SliceLayoutId`**

In `src/slice/types.ts`, replace the existing `Orientation` and `SliceLayoutId` lines
(leave `ContentTransform` between them exactly as it is):

```ts
/**
 * The first three place one element through `fit`. The last three are set glyph
 * by glyph and emit a `glyphRun`.
 */
export type Orientation =
  | 'radial'
  | 'tangential'
  | 'curved'
  | 'stacked'
  | 'taperedRadial'
  | 'archedRim'
```

```ts
export type SliceLayoutId = 'auto' | 'radial' | 'tangential' | 'curved' | 'composed'
```

- [ ] **Step 2: Add `PartContent`, `SlicePart` and `FontId`**

Append to `src/slice/types.ts`, after `SliceInstance`:

```ts
/**
 * A validated string, never a union: a couple of dozen ids in a union type is a
 * merge conflict waiting to happen, and an unknown id resolves to a default
 * rather than failing to compile. The registry that validates it is the second
 * plan's; nothing reads this field yet.
 */
export type FontId = string

export type PartContent =
  | { from: 'label'; transform?: ContentTransform }
  | { from: 'text'; value: string }
  | { from: 'media' }
  | { from: 'derived'; value: 'weight' | 'index' | 'position' }

export type SlicePart = {
  content: PartContent
  orientation: Orientation
  /** Inner and outer edge, as fractions of the radius. */
  band: [number, number]
  /** Default 'rimInward'. */
  direction?: 'rimInward' | 'hubOutward'
  /** Letters keep their relative growth toward the rim. Default on. */
  fan?: boolean
  /** Widen each glyph to the room at its radius. Default 'none'. */
  stretch?: 'none' | 'fill' | number
  /** How the run is drawn. Default 'glyphs'. Only 'glyphs' is implemented. */
  shape?: 'glyphs' | 'outline'
  /** A registry id. Absent means the theme's default face. Not yet read. */
  font?: FontId
  maxSize?: number
  frame?: Frame
}
```

- [ ] **Step 3: Add the `Glyph` type and the `glyphRun` element kind**

In `src/slice/types.ts`, immediately above `type Drawn`:

```ts
/**
 * One character, already placed. Wheel-local user units, with the wedge's own
 * rotation baked in: the renderer writes the transform and decides nothing.
 */
export type Glyph = {
  char: string
  x: number
  y: number
  size: number
  /** Degrees, clockwise, applied at (x, y). */
  rotate: number
  /** The glyph's own axes, after `rotate`. Stretch lives here. */
  scale: [number, number]
}
```

and add a member to the `Drawn` union, after the `curvedText` line:

```ts
  | { kind: 'glyphRun'; glyphs: Glyph[] }
```

- [ ] **Step 4: Give `budget` an arm for the orientations it does not serve**

`budget` in `src/slice/fit.ts` switches on `spec.orientation` and returns from
every arm. Three new members make the switch non-exhaustive, so it no longer
compiles. Add a default arm at the end of that switch:

```ts
    default:
      // The glyph-run orientations do not go through `fit`; `typeset` solves
      // them. A zero budget makes `createFit` return null, which is what a
      // caller reaching here by mistake should see.
      return { length: 0, natural: 0 }
```

- [ ] **Step 5: Type-check and run the suite**

Run: `npm run build`
Run: `npm test`
Expected: both PASS. Nothing consumes the new members yet.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/slice/types.ts src/slice/fit.ts
git commit -m "add part, glyph and orientation types for composed slices"
```

---

### Task 2: Export the chord and arc-length helpers from `fit.ts`

`typeset` needs the same two pieces of geometry `fit` already computes. One
definition, so the two modules cannot disagree about what a chord is.

**Files:**
- Modify: `src/slice/fit.ts:22-26`
- Test: `src/slice/fit.test.ts`

- [ ] **Step 1: Write the failing test**

Change the import at the top of `src/slice/fit.test.ts` to:

```ts
import { arcLength, budget, chord, createFit, levelRoom } from './fit'
```

and add this describe above the existing ones:

```ts
describe('chord and arcLength', () => {
  it('gives a half turn the full diameter as its chord', () => {
    expect(chord(0.5, 200)).toBeCloseTo(400)
  })

  it('caps the chord at half a turn rather than folding back', () => {
    expect(chord(0.9, 200)).toBeCloseTo(chord(0.5, 200))
  })

  it('gives a full turn the circumference as its arc', () => {
    expect(arcLength(1, 200)).toBeCloseTo(2 * Math.PI * 200)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/fit.test.ts`
Expected: FAIL — `chord` and `arcLength` are not exported.

- [ ] **Step 3: Export them**

In `src/slice/fit.ts`, add `export` to both existing declarations:

```ts
/** The straight-line distance across an arc at a given radius. */
export const chord = (turns: number, radius: number): number =>
  2 * radius * Math.sin(Math.PI * Math.min(turns, 0.5))

export const arcLength = (turns: number, radius: number): number => TAU * radius * turns
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/fit.ts src/slice/fit.test.ts
git commit -m "export chord and arc length from the fit budget"
```

---

### Task 3: `readParts` — the part reader and its defaults

One reader, three callers: `composed.draw` (whose params come from the editor,
unvalidated), `readSlice` (whose params come from a JSON file), and the editor
itself. Putting it next to the type is what keeps them from drifting.

Two readers, in fact, and the difference matters: `readPartList` reads what is
there and may return nothing; `readParts` adds the fallback. An **empty array is
an authored value** — the operator cleared every slot — and survives as empty. A
list of entries none of which are readable is not, and falls back, so a preset
written by a newer build degrades to something that still names its wedges.

**Files:**
- Create: `src/slice/parts.ts`
- Test: `src/slice/parts.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/parts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PART, MAX_PARTS, readPartList, readParts } from './parts'

describe('readParts', () => {
  it('falls back to a one-part label composition when parts is not an array', () => {
    expect(readParts(undefined)).toEqual([DEFAULT_PART])
    expect(readParts({ from: 'label' })).toEqual([DEFAULT_PART])
  })

  it('keeps an authored empty list empty', () => {
    expect(readParts([])).toEqual([])
  })

  it('falls back when a list has entries but none are readable', () => {
    expect(readParts([{ orientation: 'spiral' }, 7])).toEqual([DEFAULT_PART])
  })

  it('keeps a well-formed part as written', () => {
    const part = {
      content: { from: 'text', value: 'BANKRUPT' },
      orientation: 'stacked',
      band: [0.45, 0.94],
      direction: 'hubOutward',
      fan: false,
      stretch: 'fill',
      shape: 'outline',
      font: 'rye',
      maxSize: 40,
      frame: 'level',
    }
    expect(readParts([part])).toEqual([part])
  })

  it('drops a part whose orientation names nothing', () => {
    const good = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    const bad = { content: { from: 'label' }, orientation: 'spiral', band: [0.4, 0.9] }
    expect(readParts([good, bad])).toEqual([good])
  })

  it('drops a part whose content names nothing', () => {
    const good = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    const bad = { content: { from: 'barcode' }, orientation: 'stacked', band: [0.4, 0.9] }
    expect(readParts([good, bad])).toEqual([good])
  })

  it('clamps a band that runs outside the radius', () => {
    const parts = readParts([{ content: { from: 'label' }, orientation: 'stacked', band: [-2, 40] }])
    expect(parts[0].band).toEqual([0, 1])
  })

  it('swaps an inverted band rather than dropping it', () => {
    const parts = readParts([
      { content: { from: 'label' }, orientation: 'stacked', band: [0.9, 0.4] },
    ])
    expect(parts[0].band).toEqual([0.4, 0.9])
  })

  it('treats a missing or unreadable band as the default', () => {
    const parts = readParts([{ content: { from: 'label' }, orientation: 'stacked' }])
    expect(parts[0].band).toEqual(DEFAULT_PART.band)
  })

  it('drops optional fields it cannot read rather than keeping junk', () => {
    const [part] = readParts([
      {
        content: { from: 'label', transform: 'shouty' },
        orientation: 'stacked',
        band: [0.4, 0.9],
        direction: 'sideways',
        fan: 'yes',
        stretch: 'enormous',
        shape: 'woodcut',
        maxSize: Number.NaN,
        frame: 'tilted',
      },
    ])
    expect(part).toEqual({
      content: { from: 'label' },
      orientation: 'stacked',
      band: [0.4, 0.9],
    })
  })

  it('keeps a numeric stretch', () => {
    const [part] = readParts([
      { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9], stretch: 1.6 },
    ])
    expect(part.stretch).toBe(1.6)
  })

  it('does not cap the list — the editor does', () => {
    const part = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    expect(readParts(Array.from({ length: MAX_PARTS + 2 }, () => part))).toHaveLength(MAX_PARTS + 2)
  })
})

describe('readPartList', () => {
  it('returns nothing rather than falling back', () => {
    expect(readPartList([{ orientation: 'spiral' }])).toEqual([])
    expect(readPartList('BANKRUPT')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/parts.test.ts`
Expected: FAIL — cannot resolve `./parts`.

- [ ] **Step 3: Write the reader**

`src/slice/parts.ts`:

```ts
import type { ContentTransform, Frame, Orientation, PartContent, SlicePart } from './types'

/** How many parts the editor offers. The data itself is uncapped. */
export const MAX_PARTS = 3

export const DEFAULT_PART: SlicePart = {
  content: { from: 'label' },
  orientation: 'stacked',
  // Type belongs in the outer half: a band that runs to the hub tapers itself
  // into unreadability, because the chord there goes to zero.
  band: [0.45, 0.94],
}

const ORIENTATIONS: Orientation[] = [
  'radial',
  'tangential',
  'curved',
  'stacked',
  'taperedRadial',
  'archedRim',
]

const TRANSFORMS: ContentTransform[] = ['full', 'firstName', 'initials', 'ellipsis']

const DERIVED = ['weight', 'index', 'position'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readContent(value: unknown): PartContent | null {
  if (!isRecord(value)) return null
  if (value.from === 'label') {
    const transform = TRANSFORMS.find((entry) => entry === value.transform)
    return transform ? { from: 'label', transform } : { from: 'label' }
  }
  if (value.from === 'text') {
    return typeof value.value === 'string' ? { from: 'text', value: value.value } : null
  }
  if (value.from === 'media') return { from: 'media' }
  if (value.from === 'derived') {
    const derived = DERIVED.find((entry) => entry === value.value)
    return derived ? { from: 'derived', value: derived } : null
  }
  return null
}

const clampUnit = (n: number): number => Math.min(1, Math.max(0, n))

function readBand(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return DEFAULT_PART.band
  const [a, b] = value
  if (typeof a !== 'number' || typeof b !== 'number') return DEFAULT_PART.band
  if (!Number.isFinite(a) || !Number.isFinite(b)) return DEFAULT_PART.band
  return [clampUnit(Math.min(a, b)), clampUnit(Math.max(a, b))]
}

function readStretch(value: unknown): SlicePart['stretch'] | undefined {
  if (value === 'none' || value === 'fill') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function readFrame(value: unknown): Frame | undefined {
  return value === 'level' || value === 'wheel' ? value : undefined
}

function readPart(value: unknown): SlicePart | null {
  if (!isRecord(value)) return null
  const orientation = ORIENTATIONS.find((entry) => entry === value.orientation)
  if (!orientation) return null
  const content = readContent(value.content)
  if (!content) return null

  const part: SlicePart = { content, orientation, band: readBand(value.band) }
  if (value.direction === 'rimInward' || value.direction === 'hubOutward') {
    part.direction = value.direction
  }
  if (typeof value.fan === 'boolean') part.fan = value.fan
  const stretch = readStretch(value.stretch)
  if (stretch !== undefined) part.stretch = stretch
  if (value.shape === 'glyphs' || value.shape === 'outline') part.shape = value.shape
  if (typeof value.font === 'string' && value.font !== '') part.font = value.font
  if (typeof value.maxSize === 'number' && Number.isFinite(value.maxSize) && value.maxSize > 0) {
    part.maxSize = value.maxSize
  }
  const frame = readFrame(value.frame)
  if (frame) part.frame = frame
  return part
}

/** The list as written, with unreadable entries dropped. May be empty. */
export function readPartList(value: unknown): SlicePart[] {
  if (!Array.isArray(value)) return []
  return value.map(readPart).filter((part): part is SlicePart => part !== null)
}

/**
 * An empty list is an authored value and stays empty. A list whose every entry
 * is unreadable is not: a preset from a newer build would otherwise come back
 * as a blank wheel.
 */
export function readParts(value: unknown): SlicePart[] {
  if (!Array.isArray(value)) return [DEFAULT_PART]
  if (value.length === 0) return []
  const parts = readPartList(value)
  return parts.length > 0 ? parts : [DEFAULT_PART]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/parts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/parts.ts src/slice/parts.test.ts
git commit -m "read and clamp a slice's part list"
```

---

### Task 4: `typeset` — content resolution and the three existing orientations

The first half of `typeset`: it resolves a part's content to a string or an
image, and hands the three orientations that already exist to `ctx.fit`,
emitting exactly the elements the shipped layouts emit today. Task 10 rewrites
those layouts on top of it.

**Files:**
- Create: `src/slice/typeset.ts`
- Test: `src/slice/typeset.test.ts`

- [ ] **Step 1: Write the failing test**

`src/slice/typeset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFit } from './fit'
import { typeset } from './typeset'
import type { Glyph, Measure, SliceContext, SlicePart } from './types'

/**
 * Per-character widths, so a slot assertion is arithmetic rather than a font.
 * jsdom has no canvas metrics, and the shipped estimate gives every character
 * the same width — which is the one thing half these rules are about.
 */
const WIDTHS: Record<string, number> = { I: 0.28, W: 0.95, M: 0.9 }
const measure: Measure = (text, size) =>
  [...text].reduce((sum, ch) => sum + (WIDTHS[ch] ?? 0.5), 0) * size

function context(overrides: Partial<SliceContext> = {}): SliceContext {
  return {
    segment: { id: 'a', label: 'Sleve McDichael', weight: 3 },
    arc: { start: 0, end: 0.125 },
    radius: 200,
    index: 2,
    count: 8,
    measure,
    fit: createFit(measure),
    ...overrides,
  }
}

const part = (overrides: Partial<SlicePart> = {}): SlicePart => ({
  content: { from: 'label' },
  orientation: 'stacked',
  band: [0.45, 0.94],
  ...overrides,
})

describe('content', () => {
  it('sets the segment label', () => {
    const [element] = typeset(part({ orientation: 'radial' }), context())
    expect(element).toMatchObject({ kind: 'text', text: 'Sleve McDichael' })
  })

  it('applies a content transform to the label', () => {
    const [element] = typeset(
      part({ orientation: 'radial', content: { from: 'label', transform: 'initials' } }),
      context(),
    )
    expect(element).toMatchObject({ text: 'SM' })
  })

  it('sets an authored word verbatim', () => {
    const [element] = typeset(
      part({ orientation: 'radial', content: { from: 'text', value: 'BANKRUPT' } }),
      context(),
    )
    expect(element).toMatchObject({ text: 'BANKRUPT' })
  })

  it('emits nothing when the content resolves to nothing', () => {
    expect(typeset(part({ content: { from: 'text', value: '' } }), context())).toEqual([])
    expect(typeset(part({ content: { from: 'media' } }), context())).toEqual([])
  })

  it('sets an emoji medium as a run of type', () => {
    const ctx = context({
      segment: { id: 'a', label: 'Ana', weight: 1, media: { kind: 'emoji', value: '🎯' } },
    })
    const [element] = typeset(part({ orientation: 'radial', content: { from: 'media' } }), ctx)
    expect(element).toMatchObject({ kind: 'text', text: '🎯' })
  })

  it('draws an image medium in its band', () => {
    const ctx = context({
      segment: { id: 'a', label: 'Ana', weight: 1, media: { kind: 'image', value: 'photo.png' } },
    })
    const [element] = typeset(part({ content: { from: 'media' }, band: [0.5, 0.8] }), ctx)
    expect(element).toMatchObject({ kind: 'image', href: 'photo.png', anchor: 0.65, size: 60 })
  })

  it('sets derived content', () => {
    const rendered = (value: 'weight' | 'index' | 'position') => {
      const [element] = typeset(
        part({ orientation: 'radial', content: { from: 'derived', value } }),
        context(),
      )
      return (element as { text: string }).text
    }
    expect(rendered('weight')).toBe('3')
    expect(rendered('index')).toBe('3')
    expect(rendered('position')).toBe('3/8')
  })
})

describe('the orientations that go through fit', () => {
  it('emits radial text along the radius', () => {
    const [element] = typeset(part({ orientation: 'radial' }), context())
    expect(element).toMatchObject({ kind: 'text', along: 'radial' })
  })

  it('emits tangential text across the wedge', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const [element] = typeset(part({ orientation: 'tangential' }), ctx)
    expect(element).toMatchObject({ kind: 'text', along: 'tangential' })
  })

  it('emits curved text on a fat wedge', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const [element] = typeset(part({ orientation: 'curved' }), ctx)
    expect(element).toMatchObject({ kind: 'curvedText' })
  })

  it('anchors on the middle of the band', () => {
    const ctx = context({ arc: { start: 0, end: 0.4 } })
    const [element] = typeset(part({ orientation: 'curved', band: [0.6, 0.8] }), ctx)
    expect(element).toMatchObject({ anchor: 0.7 })
  })

  it('carries the part frame, and lays a level run out horizontally', () => {
    const [element] = typeset(part({ orientation: 'radial', frame: 'level' }), context())
    expect(element).toMatchObject({ frame: 'level', along: 'tangential' })
  })

  it('emits nothing when the wedge cannot hold the run above the floor', () => {
    const ctx = context({ arc: { start: 0, end: 0.0002 } })
    expect(typeset(part({ orientation: 'radial' }), ctx)).toEqual([])
  })
})
```

The `Glyph` import is unused until Task 5; add it there rather than here, or
`noUnusedLocals` fails the build. Import only `Measure`, `SliceContext` and
`SlicePart` for now.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/typeset.test.ts`
Expected: FAIL — cannot resolve `./typeset`.

- [ ] **Step 3: Write the module**

`src/slice/typeset.ts`:

```ts
import type { Media } from '../wheel/types'
import { applyTransform } from './ladder'
import { MIN_SIZE } from './layouts/shared'
import type { PartContent, SliceContext, SliceElement, SlicePart } from './types'

/** What a part with no `maxSize` of its own may reach. */
export const DEFAULT_MAX_SIZE = 40

type Resolved = { kind: 'text'; text: string } | { kind: 'image'; href: string }

function resolveContent(content: PartContent, ctx: SliceContext): Resolved | null {
  switch (content.from) {
    case 'label':
      return { kind: 'text', text: applyTransform(content.transform ?? 'full', ctx.segment.label) }
    case 'text':
      return { kind: 'text', text: content.value }
    case 'media': {
      const media: Media | undefined = ctx.segment.media
      if (!media) return null
      return media.kind === 'emoji'
        ? { kind: 'text', text: media.value }
        : { kind: 'image', href: media.value }
    }
    case 'derived': {
      if (content.value === 'weight') return { kind: 'text', text: String(ctx.segment.weight) }
      if (content.value === 'index') return { kind: 'text', text: String(ctx.index + 1) }
      return { kind: 'text', text: `${ctx.index + 1}/${ctx.count}` }
    }
  }
}

type FittedOrientation = 'radial' | 'tangential' | 'curved'
type FittedPart = SlicePart & { orientation: FittedOrientation }

const isFitted = (part: SlicePart): part is FittedPart =>
  part.orientation === 'radial' ||
  part.orientation === 'tangential' ||
  part.orientation === 'curved'

/** The three orientations that predate parts, drawn exactly as they were. */
function fitted(part: FittedPart, ctx: SliceContext, text: string): SliceElement[] {
  const frame = part.frame ?? 'wheel'
  const [inner, outer] = part.band
  const placed = ctx.fit({
    text,
    orientation: part.orientation,
    frame,
    width: ctx.arc.end - ctx.arc.start,
    radius: ctx.radius,
    anchor: (inner + outer) / 2,
    maxSize: part.maxSize ?? DEFAULT_MAX_SIZE,
    minSize: MIN_SIZE,
  })
  if (!placed) return []

  // A level run is horizontal by construction, so it has no orientation left to
  // honor and always lays out as a straight line.
  if (frame === 'wheel' && part.orientation === 'curved') {
    return [
      { kind: 'curvedText', text: placed.text, anchor: placed.anchor, size: placed.size, frame },
    ]
  }
  return [
    {
      kind: 'text',
      text: placed.text,
      along: frame === 'level' || part.orientation === 'tangential' ? 'tangential' : 'radial',
      anchor: placed.anchor,
      size: placed.size,
      frame,
    },
  ]
}

export function typeset(part: SlicePart, ctx: SliceContext): SliceElement[] {
  const resolved = resolveContent(part.content, ctx)
  if (resolved === null) return []

  const [inner, outer] = part.band
  if (resolved.kind === 'image') {
    return [
      {
        kind: 'image',
        href: resolved.href,
        anchor: (inner + outer) / 2,
        size: (outer - inner) * ctx.radius,
        frame: part.frame,
      },
    ]
  }

  if (resolved.text.length === 0) return []
  if (isFitted(part)) return fitted(part, ctx, resolved.text)
  return []
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/typeset.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/typeset.ts src/slice/typeset.test.ts
git commit -m "typeset a part's content through the existing fit"
```

---

### Task 5: The glyph solve — `stacked` and `taperedRadial`

The spec's five rules, in one loop. Sizes are linear in a single fit unit, so
each pass is one division rather than a search; fanning re-weights by the chord
at each glyph's settled radius and repeats.

**Files:**
- Modify: `src/slice/typeset.ts`
- Test: `src/slice/typeset.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `Glyph` to the type import at the top of `src/slice/typeset.test.ts`:

```ts
import type { Glyph, Measure, SliceContext, SlicePart } from './types'
```

and append these helpers and describes:

```ts
function glyphsOf(overrides: Partial<SlicePart>, ctx: SliceContext = context()): Glyph[] {
  const [element] = typeset(part(overrides), ctx)
  expect(element?.kind).toBe('glyphRun')
  return (element as { kind: 'glyphRun'; glyphs: Glyph[] }).glyphs
}

const radiusOf = (glyph: Glyph): number => Math.hypot(glyph.x, glyph.y)

/** How much radius a run consumed: centre to centre, plus a half slot at each end. */
function radialSpan(glyphs: Glyph[], stepRatio: number): number {
  const radii = glyphs.map(radiusOf)
  const ends = glyphs[0].size * stepRatio + glyphs[glyphs.length - 1].size * stepRatio
  return Math.max(...radii) - Math.min(...radii) + ends / 2
}

describe('the stacked solve', () => {
  it('fills its band', () => {
    const glyphs = glyphsOf({
      content: { from: 'text', value: 'BANKRUPT' },
      band: [0.4, 0.9],
      fan: false,
    })
    // (0.9 - 0.4) * 200 units of radius, and a stacked step is size * (1 + tracking).
    expect(radialSpan(glyphs, 1.08)).toBeCloseTo(100, 0)
  })

  it('places one glyph per character, in order, rim inward', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'RYE' } })
    expect(glyphs.map((glyph) => glyph.char)).toEqual(['R', 'Y', 'E'])
    expect(radiusOf(glyphs[0])).toBeGreaterThan(radiusOf(glyphs[2]))
  })

  it('reverses the run when the direction is hubOutward', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'RYE' }, direction: 'hubOutward' })
    expect(glyphs.map((glyph) => glyph.char)).toEqual(['R', 'Y', 'E'])
    expect(radiusOf(glyphs[0])).toBeLessThan(radiusOf(glyphs[2]))
  })

  it('gives every glyph the same size when fan is off', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'ANTON' }, fan: false })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
  })

  it('grows the letters toward the rim when fan is on', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'ANTON' }, fan: true })
    expect(glyphs[0].size).toBeGreaterThan(glyphs[glyphs.length - 1].size)
  })

  it('caps a glyph at the chord at its own radius', () => {
    // A narrow wedge and a tall band: the fit unit and the max size are both
    // roomy, so only the chord can be what stops these letters.
    const glyphs = glyphsOf(
      { content: { from: 'text', value: 'WW' }, band: [0.1, 0.95], fan: false, maxSize: 60 },
      context({ arc: { start: 0, end: 0.02 } }),
    )
    for (const glyph of glyphs) {
      const room = 2 * radiusOf(glyph) * Math.sin(Math.PI * 0.02) * 0.86
      expect(glyph.size).toBeLessThan(60)
      expect(glyph.size * 0.95).toBeLessThanOrEqual(room)
    }
  })

  it('shrinks a long word to the floor rather than dropping letters', () => {
    const value = 'SCHWARZENEGGERBERGSTEIN'
    const glyphs = glyphsOf({ content: { from: 'text', value }, band: [0.7, 0.8] })
    expect(glyphs).toHaveLength(value.length)
    expect(Math.min(...glyphs.map((glyph) => glyph.size))).toBe(9)
  })

  it('never exceeds the part max size', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'AB' }, maxSize: 12, fan: false })
    expect(Math.max(...glyphs.map((glyph) => glyph.size))).toBeLessThanOrEqual(12)
  })

  it('keeps stacked letters upright on the wedge midline', () => {
    const ctx = context({ arc: { start: 0, end: 0.25 } })
    for (const glyph of glyphsOf({ content: { from: 'text', value: 'AB' } }, ctx)) {
      expect(glyph.rotate).toBeCloseTo(45)
    }
  })
})

describe('the tapered radial solve', () => {
  it('gives a narrow letter a narrower slot than a wide one at the same size', () => {
    // maxSize binds, so every glyph is the same size and the only thing that can
    // change how much radius each one takes is its own measured advance.
    const glyphs = glyphsOf({
      orientation: 'taperedRadial',
      content: { from: 'text', value: 'IIW' },
      band: [0.3, 0.95],
      fan: false,
      maxSize: 20,
    })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
    const gap = (a: number, b: number) => Math.abs(radiusOf(glyphs[a]) - radiusOf(glyphs[b]))
    expect(gap(1, 2)).toBeGreaterThan(gap(0, 1) * 1.5)
  })

  it('quarter-turns its letters', () => {
    const ctx = context({ arc: { start: 0, end: 0.25 } })
    const glyphs = glyphsOf(
      { orientation: 'taperedRadial', content: { from: 'text', value: 'AB' } },
      ctx,
    )
    for (const glyph of glyphs) expect(glyph.rotate).toBeCloseTo(-45)
  })
})

describe('stretch', () => {
  it('is off by default', () => {
    for (const glyph of glyphsOf({ content: { from: 'text', value: 'AB' } })) {
      expect(glyph.scale).toEqual([1, 1])
    }
  })

  it('widens a stacked glyph on its own x axis', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'II' }, stretch: 'fill', maxSize: 12 })
    expect(glyphs[0].scale[0]).toBeGreaterThan(1)
    expect(glyphs[0].scale[1]).toBe(1)
  })

  it('moves the other axis for a quarter-turned glyph', () => {
    const glyphs = glyphsOf({
      orientation: 'taperedRadial',
      content: { from: 'text', value: 'II' },
      stretch: 'fill',
      maxSize: 12,
    })
    expect(glyphs[0].scale[0]).toBe(1)
    expect(glyphs[0].scale[1]).toBeGreaterThan(1)
  })

  it('caps a fill so a short word cannot smear', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'I' }, stretch: 'fill', maxSize: 10 })
    expect(glyphs[0].scale[0]).toBe(3)
  })

  it('caps an authored stretch too', () => {
    const glyphs = glyphsOf({ content: { from: 'text', value: 'AB' }, stretch: 40 })
    expect(glyphs[0].scale[0]).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/slice/typeset.test.ts`
Expected: FAIL — `typeset` returns `[]` for `stacked`, so `element?.kind` is
`undefined`.

- [ ] **Step 3: Write the solve**

In `src/slice/typeset.ts`, extend the imports:

```ts
import { pointAt } from '../wheel/geometry'
import type { Media } from '../wheel/types'
import { chord } from './fit'
import { applyTransform } from './ladder'
import { MIN_SIZE } from './layouts/shared'
import type { Glyph, PartContent, SliceContext, SliceElement, SlicePart } from './types'
```

Add these constants below `DEFAULT_MAX_SIZE`:

```ts
/** Added to every glyph's step so letters do not touch. A fraction of the size. */
const TRACKING = 0.08
/** How much of the chord at a glyph's radius it may claim. */
const CHORD_FILL = 0.86
const MAX_STRETCH = 3
/** Re-weighting converges well inside this; it is a bound, not a tuning knob. */
const FAN_PASSES = 6
/**
 * A zero-advance character — a space — would otherwise divide the chord to
 * infinity when the width cap is computed.
 */
const MIN_ADVANCE = 0.3
/** How much of the em a capital spans vertically, for a quarter-turned glyph. */
const CAP_HEIGHT = 0.72

const round = (n: number): number => Number(n.toFixed(2))
const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n))
```

Add the solve, above `typeset`:

```ts
type Solved = { sizes: number[]; radii: number[] }

/**
 * One division per pass: sizes are linear in the fit unit, so `unit` is
 * `bandLength / Σ(weight × step)` rather than the result of a search. With fan
 * on, the next pass re-weights by the chord at each glyph's settled radius.
 */
function solveRadial(
  steps: number[],
  across: number[],
  part: SlicePart,
  ctx: SliceContext,
  maxSize: number,
): Solved {
  const width = ctx.arc.end - ctx.arc.start
  const [inner, outer] = part.band
  const length = (outer - inner) * ctx.radius
  const fan = part.fan ?? true
  const inward = (part.direction ?? 'rimInward') === 'rimInward'
  const sign = inward ? -1 : 1

  let weights = steps.map(() => 1)
  let sizes: number[] = []
  let radii: number[] = []

  for (let pass = 0; pass < (fan ? FAN_PASSES : 1); pass++) {
    const demand = steps.reduce((sum, step, i) => sum + weights[i] * step, 0)
    const unit = demand > 0 ? length / demand : 0
    let edge = (inward ? outer : inner) * ctx.radius
    sizes = []
    radii = []

    for (let i = 0; i < steps.length; i++) {
      const nominal = unit * weights[i] * steps[i]
      const centre = Math.max(edge + (sign * nominal) / 2, 1)
      const room = chord(width, centre) * CHORD_FILL
      const size = Math.max(MIN_SIZE, Math.min(unit * weights[i], maxSize, room / across[i]))
      const extent = size * steps[i]
      radii.push(edge + (sign * extent) / 2)
      sizes.push(size)
      edge += sign * extent
    }

    if (!fan) break
    weights = radii.map((radius) => chord(width, Math.max(radius, 1)))
  }

  return { sizes, radii }
}

function stretchOf(part: SlicePart, size: number, radius: number, across: number, width: number) {
  const stretch = part.stretch ?? 'none'
  if (stretch === 'none') return 1
  if (stretch === 'fill') {
    const room = chord(width, Math.max(radius, 1)) * CHORD_FILL
    const taken = across * size
    return taken > 0 ? clamp(room / taken, 1, MAX_STRETCH) : 1
  }
  return clamp(stretch, 1 / MAX_STRETCH, MAX_STRETCH)
}

/** `stacked` and `taperedRadial`: a run set along the radius. */
function radialRun(part: SlicePart, ctx: SliceContext, text: string): Glyph[] {
  const chars = [...text]
  const width = ctx.arc.end - ctx.arc.start
  const mid = ctx.arc.start + width / 2
  const stacked = part.orientation === 'stacked'
  const maxSize = part.maxSize ?? DEFAULT_MAX_SIZE
  const advances = chars.map((char) => Math.max(ctx.measure(char, 1), MIN_ADVANCE))

  // Upright letters step by the line; quarter-turned ones step by the advance.
  const steps = chars.map((_, i) => (stacked ? 1 : advances[i]) + TRACKING)
  // What already spans the wedge, per unit of size — the axis stretch works on.
  const across = chars.map((_, i) => (stacked ? advances[i] : CAP_HEIGHT))

  const { sizes, radii } = solveRadial(steps, across, part, ctx, maxSize)

  return chars.map((char, i) => {
    const [x, y] = pointAt(mid, radii[i])
    const factor = round(stretchOf(part, sizes[i], radii[i], across[i], width))
    return {
      char,
      x,
      y,
      size: round(sizes[i]),
      rotate: round(mid * 360 + (stacked ? 0 : -90)),
      scale: stacked ? [factor, 1] : [1, factor],
    }
  })
}
```

Replace `typeset`'s last two lines:

```ts
  if (isFitted(part)) return fitted(part, ctx, resolved.text)
  const glyphs = radialRun(part, ctx, resolved.text)
  return glyphs.length > 0 ? [{ kind: 'glyphRun', glyphs }] : []
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/slice/typeset.test.ts`
Expected: PASS.

If "fills its band" is off by more than a unit, `radialSpan`'s `1.08` and
`TRACKING` have diverged.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/typeset.ts src/slice/typeset.test.ts
git commit -m "solve a glyph run set along the radius"
```

---

### Task 6: `archedRim` — a run on an arc inside the rim

Constant radius, so nothing narrows and nothing tapers: one size for the whole
run, glyphs stepped by their own advances along the arc and each turned to sit
square on it. `fan` and `stretch: 'fill'` have no converging room to work with,
so they do nothing here.

**Files:**
- Modify: `src/slice/typeset.ts`
- Test: `src/slice/typeset.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/slice/typeset.test.ts`:

```ts
describe('the arched rim run', () => {
  const wide = () => context({ arc: { start: 0, end: 0.25 } })
  const arched = (overrides: Partial<SlicePart> = {}, ctx: SliceContext = wide()): Glyph[] =>
    glyphsOf({ orientation: 'archedRim', band: [0.8, 0.94], ...overrides }, ctx)

  it('sets every glyph at one size on one radius', () => {
    const glyphs = arched({ content: { from: 'text', value: 'WHEEL' } })
    expect(new Set(glyphs.map((glyph) => glyph.size)).size).toBe(1)
    const radii = glyphs.map(radiusOf)
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.02)
  })

  it('centres the run on the wedge and runs it clockwise', () => {
    const glyphs = arched({ content: { from: 'text', value: 'WHEEL' } })
    expect(glyphs[0].rotate).toBeLessThan(45)
    expect(glyphs[glyphs.length - 1].rotate).toBeGreaterThan(45)
  })

  it('turns each glyph square to its own point on the arc', () => {
    for (const glyph of arched({ content: { from: 'text', value: 'WHEEL' } })) {
      const turnDeg = (Math.atan2(glyph.x, -glyph.y) * 180) / Math.PI
      expect(glyph.rotate).toBeCloseTo(turnDeg, 0)
    }
  })

  it('gives a wide letter a wider slot than a narrow one', () => {
    const glyphs = arched({ content: { from: 'text', value: 'IIW' } })
    const gap = (a: number, b: number) =>
      Math.hypot(glyphs[a].x - glyphs[b].x, glyphs[a].y - glyphs[b].y)
    expect(gap(1, 2)).toBeGreaterThan(gap(0, 1) * 1.5)
  })

  it('caps the size on the thickness of its band', () => {
    const thin = arched({ content: { from: 'text', value: 'AB' }, band: [0.9, 0.94] })
    const thick = arched({ content: { from: 'text', value: 'AB' }, band: [0.6, 0.94] })
    expect(thin[0].size).toBeLessThan(thick[0].size)
  })

  it('shrinks a long word to the floor rather than dropping letters', () => {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const glyphs = arched(
      { content: { from: 'text', value } },
      context({ arc: { start: 0, end: 0.02 } }),
    )
    expect(glyphs).toHaveLength(value.length)
    expect(glyphs[0].size).toBe(9)
  })

  it('leaves a fill alone, having no narrowing room to fill', () => {
    for (const glyph of arched({ content: { from: 'text', value: 'AB' }, stretch: 'fill' })) {
      expect(glyph.scale).toEqual([1, 1])
    }
  })

  it('honours an authored stretch on the glyph x axis', () => {
    const glyphs = arched({ content: { from: 'text', value: 'AB' }, stretch: 1.5 })
    expect(glyphs[0].scale).toEqual([1.5, 1])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/slice/typeset.test.ts`
Expected: FAIL — `archedRim` currently falls into `radialRun`, so every glyph
sits on the wedge midline at a different radius.

- [ ] **Step 3: Write the arc run**

In `src/slice/typeset.ts`, extend the `./fit` import:

```ts
import { arcLength, chord } from './fit'
```

and add these constants beside the others:

```ts
const TAU = Math.PI * 2
/** How much of the wedge's arc a run may claim, matching the curved budget. */
const ARC_FILL = 0.85
const LINE_HEIGHT = 1.2
```

Add this function below `radialRun`:

```ts
/** `archedRim`: a baseline on an arc, so nothing narrows and nothing tapers. */
function arcRun(part: SlicePart, ctx: SliceContext, text: string): Glyph[] {
  const chars = [...text]
  const width = ctx.arc.end - ctx.arc.start
  const mid = ctx.arc.start + width / 2
  const [inner, outer] = part.band
  const baseline = ((inner + outer) / 2) * ctx.radius
  const advances = chars.map((char) => Math.max(ctx.measure(char, 1), MIN_ADVANCE))
  const demand = advances.reduce((sum, advance) => sum + advance + TRACKING, 0)

  const run = arcLength(width, baseline) * ARC_FILL
  const thickness = ((outer - inner) * ctx.radius) / LINE_HEIGHT
  const maxSize = part.maxSize ?? DEFAULT_MAX_SIZE
  const size = Math.max(MIN_SIZE, Math.min(maxSize, thickness, demand > 0 ? run / demand : 0))

  const factor =
    typeof part.stretch === 'number' ? clamp(part.stretch, 1 / MAX_STRETCH, MAX_STRETCH) : 1

  let along = -(size * demand) / 2
  return chars.map((char, i) => {
    const step = size * (advances[i] + TRACKING)
    const turn = mid + (along + step / 2) / (TAU * baseline)
    along += step
    const [x, y] = pointAt(turn, baseline)
    return { char, x, y, size: round(size), rotate: round(turn * 360), scale: [factor, 1] }
  })
}
```

Route to it in `typeset`, replacing the `radialRun` line:

```ts
  const glyphs =
    part.orientation === 'archedRim'
      ? arcRun(part, ctx, resolved.text)
      : radialRun(part, ctx, resolved.text)
  return glyphs.length > 0 ? [{ kind: 'glyphRun', glyphs }] : []
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/slice/typeset.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/typeset.ts src/slice/typeset.test.ts
git commit -m "set a run on an arc just inside the rim"
```

---

### Task 7: The `composed` layout

**Files:**
- Create: `src/slice/layouts/composed.ts`
- Modify: `src/slice/registry.ts`
- Modify: `src/form/fields.ts`
- Modify: `src/editor/RecipeForm.tsx`
- Test: `src/slice/layouts/composed.test.ts`
- Test: `src/slice/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/slice/layouts/composed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFit } from '../fit'
import { DEFAULT_PART } from '../parts'
import type { Glyph, Measure, SliceContext } from '../types'
import { composed } from './composed'

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

describe('composed', () => {
  it('draws its parts in order, each in its own band', () => {
    const elements = composed.draw(
      {
        parts: [
          { content: { from: 'text', value: 'AB' }, orientation: 'stacked', band: [0.7, 0.95] },
          { content: { from: 'text', value: 'CD' }, orientation: 'stacked', band: [0.3, 0.55] },
        ],
      },
      context(),
    )
    expect(elements).toHaveLength(2)
    const radiusOf = (index: number) => {
      const element = elements[index] as { kind: 'glyphRun'; glyphs: Glyph[] }
      return Math.hypot(element.glyphs[0].x, element.glyphs[0].y)
    }
    expect(radiusOf(0)).toBeGreaterThan(radiusOf(1))
  })

  it('emits nothing for a part whose content resolves to nothing', () => {
    const elements = composed.draw(
      {
        parts: [
          { content: { from: 'media' }, orientation: 'stacked', band: [0.7, 0.95] },
          { content: { from: 'label' }, orientation: 'stacked', band: [0.3, 0.55] },
        ],
      },
      context(),
    )
    expect(elements).toHaveLength(1)
  })

  it('draws a label composition when the params carry no parts at all', () => {
    const elements = composed.draw({}, context())
    expect(elements).toHaveLength(1)
    expect(elements[0].kind).toBe('glyphRun')
  })

  it('draws nothing when every slot has been cleared', () => {
    expect(composed.draw({ parts: [] }, context())).toEqual([])
  })

  it('starts on a one-part default', () => {
    expect(composed.defaults.parts).toEqual([DEFAULT_PART])
  })

  it('declares a field for each of its defaults', () => {
    const keys = composed.fields.map((field) => field.key).sort()
    expect(keys).toEqual(Object.keys(composed.defaults).sort())
  })
})
```

Add to `src/slice/registry.test.ts` (extending its existing import to include
`SLICE_LIST` if it does not already):

```ts
  it('resolves the composed layout by id', () => {
    expect(getSlice('composed')?.id).toBe('composed')
  })

  it('offers the composed layout in the list', () => {
    expect(SLICE_LIST.map((layout) => layout.id)).toContain('composed')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/slice/layouts/composed.test.ts src/slice/registry.test.ts`
Expected: FAIL — cannot resolve `./composed`.

- [ ] **Step 3: Add the `parts` field kind**

`composed` declares a field the form spec has no kind for. In
`src/form/fields.ts`, add a member to the `Field` union:

```ts
  /**
   * A repeating list of slice parts. `max` is how many slots the editor offers;
   * the stored list is uncapped, so lifting the cap is a UI change.
   */
  | { key: string; label: string; kind: 'parts'; max: number }
```

`RecipeForm`'s switch is exhaustive over `Field['kind']` and stops compiling.
Add a placeholder arm at the end of the switch in `src/editor/RecipeForm.tsx`,
which Task 12 replaces:

```ts
      case 'parts':
        return null
```

- [ ] **Step 4: Write the layout**

`src/slice/layouts/composed.ts`:

```ts
import { DEFAULT_PART, MAX_PARTS, readParts } from '../parts'
import { typeset } from '../typeset'
import type { SliceLayout } from '../types'

export const composed: SliceLayout = {
  id: 'composed',
  name: 'Composed',
  description:
    'Several pieces of type and imagery, each owning its own band of the radius. Nothing reflows when a neighbour changes.',
  defaults: { parts: [DEFAULT_PART] },
  fields: [{ key: 'parts', label: 'Part', kind: 'parts', max: MAX_PARTS }],
  draw(params, ctx) {
    return readParts(params.parts).flatMap((part) => typeset(part, ctx))
  },
}
```

- [ ] **Step 5: Register it**

In `src/slice/registry.ts`, add the import and both entries:

```ts
import { composed } from './layouts/composed'
```

```ts
export const SLICE_LAYOUTS: Record<SliceLayoutId, SliceLayout> = {
  auto,
  radial,
  tangential,
  curved,
  composed,
}

export const SLICE_LIST: SliceLayout[] = [auto, composed, curved, tangential, radial]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/slice/layouts/composed.test.ts src/slice/registry.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run check
git add src/slice/layouts/composed.ts src/slice/layouts/composed.test.ts src/slice/registry.ts src/slice/registry.test.ts src/form/fields.ts src/editor/RecipeForm.tsx
git commit -m "register a composed layout that draws a list of parts"
```

---

### Task 8: Render `glyphRun`

**Files:**
- Modify: `src/wheel/SliceElements.tsx`
- Test: `src/wheel/SliceElements.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('SliceElements', ...)` block in
`src/wheel/SliceElements.test.tsx`:

```tsx
  it('renders one text element per glyph, transformed where the solve put it', () => {
    const container = draw([
      {
        kind: 'glyphRun',
        glyphs: [
          { char: 'A', x: 10, y: -180, size: 24, rotate: 45, scale: [1.5, 1] },
          { char: 'B', x: 8, y: -150, size: 20, rotate: 45, scale: [1, 1] },
        ],
      },
    ])
    const texts = [...container.querySelectorAll('text')]
    expect(texts.map((text) => text.textContent)).toEqual(['A', 'B'])
    expect(texts[0].getAttribute('transform')).toBe('translate(10 -180) rotate(45) scale(1.5 1)')
    expect(texts[0].getAttribute('font-size')).toBe('24')
  })

  it('renders nothing for an empty glyph run', () => {
    const container = draw([{ kind: 'glyphRun', glyphs: [] }])
    expect(container.querySelector('text')).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wheel/SliceElements.test.tsx`
Expected: FAIL — the run falls through to the final `text` branch and renders
nothing usable.

- [ ] **Step 3: Add the branch**

In `src/wheel/SliceElements.tsx`, immediately after the `curvedText` branch:

```tsx
        if (element.kind === 'glyphRun') {
          return (
            <g key={key}>
              {element.glyphs.map((glyph, glyphIndex) => (
                <text
                  // Glyphs are positions in a solved run, not a keyed list.
                  // biome-ignore lint/suspicious/noArrayIndexKey: a glyph is its position.
                  key={`${key}-${glyphIndex}`}
                  className="wheel__label"
                  fontSize={glyph.size}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`translate(${glyph.x} ${glyph.y}) rotate(${glyph.rotate}) scale(${glyph.scale[0]} ${glyph.scale[1]})`}
                >
                  {glyph.char}
                </text>
              ))}
            </g>
          )
        }
```

The glyph positions already carry the wedge's own rotation, so this branch does
not use `midDeg`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/wheel/SliceElements.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/wheel/SliceElements.tsx src/wheel/SliceElements.test.tsx
git commit -m "render a positioned glyph run"
```

---

### Task 9: The fit report reads a glyph run

`FitReport` is the operator's answer to "what will each wedge actually say". A
composed wedge that reported nothing would read as a wedge that says nothing.

**Files:**
- Modify: `src/slice/report.ts:41-52`
- Test: `src/slice/report.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/slice/report.test.ts`, inside its existing describe:

```ts
  it('reads what a glyph run spells and the size it starts at', () => {
    const rows = fitReport(
      [{ id: 'a', label: 'RYE', weight: 1, slice: { id: 'composed', params: {} } }],
      undefined,
      200,
      (text, size) => text.length * 0.5 * size,
    )
    expect(rows[0].drawn).toBe('RYE')
    expect(rows[0].size).toBeGreaterThan(0)
    expect(rows[0].degraded).toBe(false)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/slice/report.test.ts`
Expected: FAIL — `drawn` is `null` and `degraded` is `true`.

- [ ] **Step 3: Read the new kind**

In `src/slice/report.ts`, replace the `const text = elements.find(...)` statement:

```ts
    const spelled = elements.flatMap((element) => {
      if (element.kind === 'text' || element.kind === 'curvedText') {
        return [{ text: element.text, size: element.size }]
      }
      if (element.kind === 'glyphRun' && element.glyphs.length > 0) {
        return [
          {
            text: element.glyphs.map((glyph) => glyph.char).join(''),
            size: element.glyphs[0].size,
          },
        ]
      }
      return []
    })
    const text = spelled[0]
```

The return statement below it stays as it is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/slice/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/slice/report.ts src/slice/report.test.ts
git commit -m "report what a glyph run spells"
```

---

### Task 10: The shipped layouts become one-part compositions

Every registered layout now emits through `typeset`. `auto` keeps its chooser —
the ladder still decides which orientation and which content transform fits —
and hands the result to `typeset` as a one-part composition rather than building
an element itself.

**Files:**
- Modify: `src/slice/layouts/shared.ts`
- Modify: `src/slice/layouts/radial.ts`
- Modify: `src/slice/layouts/tangential.ts`
- Modify: `src/slice/layouts/curved.ts`
- Modify: `src/slice/layouts/auto.ts`
- Test: `src/slice/layouts/layouts.test.ts` and `src/slice/layouts/auto.test.ts` — **not edited**. They must keep passing exactly as written; that is what this task is proving.

- [ ] **Step 1: Add the legacy-part helper**

In `src/slice/layouts/shared.ts`, widen the type import:

```ts
import type { FitSpec, Frame, Orientation, SliceContext, SliceParams, SlicePart } from '../types'
```

and append:

```ts
/**
 * A pre-parts layout's params as a single part. The band collapses to the
 * anchor, because `typeset` reads a fitted part's anchor as the band's midpoint.
 */
export function legacyPart(orientation: Orientation, params: SliceParams): SlicePart {
  const anchor = readNumber(params, 'anchor', 0.7)
  return {
    content: { from: 'label' },
    orientation,
    band: [anchor, anchor],
    frame: readFrame(params),
    maxSize: readNumber(params, 'maxSize', 26),
  }
}
```

- [ ] **Step 2: Rewrite the three shipped layouts**

`src/slice/layouts/radial.ts`, in full:

```ts
import { typeset } from '../typeset'
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart } from './shared'

export const radial: SliceLayout = {
  id: 'radial',
  name: 'Radial',
  description: 'The label runs outward along the radius. Fits narrow wedges best.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.62 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    return typeset(legacyPart('radial', params), ctx)
  },
}
```

`src/slice/layouts/tangential.ts`, in full:

```ts
import { typeset } from '../typeset'
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart } from './shared'

export const tangential: SliceLayout = {
  id: 'tangential',
  name: 'Tangential',
  description: 'The label runs across the wedge. Fits fat wedges with short labels.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.68 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    return typeset(legacyPart('tangential', params), ctx)
  },
}
```

`src/slice/layouts/curved.ts`, in full:

```ts
import { typeset } from '../typeset'
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart } from './shared'

export const curved: SliceLayout = {
  id: 'curved',
  name: 'Curved',
  description: 'The label follows the arc clockwise. Holds the longest labels on a fat wedge.',
  defaults: { ...COMMON_DEFAULTS, anchor: 0.78 },
  fields: COMMON_FIELDS,
  draw(params, ctx) {
    return typeset(legacyPart('curved', params), ctx)
  },
}
```

- [ ] **Step 3: Rewrite `auto` to emit through `typeset`**

`src/slice/layouts/auto.ts`, in full:

```ts
import { LADDERS, LADDER_OPTIONS, isLadderId, walkLadder } from '../ladder'
import { typeset } from '../typeset'
import type { SliceLayout } from '../types'
import { COMMON_DEFAULTS, COMMON_FIELDS, legacyPart, specOf } from './shared'

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

    // The ladder chose the orientation and already shortened the text; `typeset`
    // re-runs the same fit against the same spec and lands on the same size.
    return typeset(
      { ...legacyPart(placed.orientation, params), content: { from: 'text', value: placed.text } },
      ctx,
    )
  },
}
```

- [ ] **Step 4: Run every slice test, unchanged**

Run: `npx vitest run src/slice`
Expected: PASS, with no edits to `layouts.test.ts` or `auto.test.ts`.

If `auto.test.ts` fails on a *size*, `specOf` and `legacyPart` have diverged:
both must read `maxSize` from the params with a fallback of 26, and `anchor`
with a fallback of 0.7.

- [ ] **Step 5: Run the whole suite and type-check**

Run: `npm test`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run check
git add src/slice/layouts
git commit -m "draw every shipped layout as a one-part composition"
```

---

### Task 11: `readSlice` validates a stored part list

**Files:**
- Modify: `src/preset/storage.ts:60-65`
- Test: `src/preset/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('slice layouts', ...)` block in
`src/preset/storage.test.ts`, which already defines the `withSlice` helper:

```ts
  it('keeps a well-formed part list', () => {
    const parts = [
      { content: { from: 'text', value: 'BANKRUPT' }, orientation: 'stacked', band: [0.45, 0.94] },
    ]
    expect(withSlice({ id: 'composed', params: { parts } }).slice).toEqual({
      id: 'composed',
      params: { parts },
    })
  })

  it('clamps a band that runs outside the radius', () => {
    const slice = withSlice({
      id: 'composed',
      params: { parts: [{ content: { from: 'label' }, orientation: 'stacked', band: [1.4, -0.2] }] },
    }).slice
    expect((slice?.params.parts as { band: number[] }[])[0].band).toEqual([0, 1])
  })

  it('drops a part whose orientation names nothing', () => {
    const slice = withSlice({
      id: 'composed',
      params: {
        parts: [
          { content: { from: 'label' }, orientation: 'spiral', band: [0.4, 0.9] },
          { content: { from: 'label' }, orientation: 'archedRim', band: [0.8, 0.94] },
        ],
      },
    }).slice
    expect(slice?.params.parts).toHaveLength(1)
  })

  it('falls back to a plain label composition when parts is junk', () => {
    const slice = withSlice({ id: 'composed', params: { parts: 'BANKRUPT' } }).slice
    expect(slice?.params.parts).toEqual([
      { content: { from: 'label' }, orientation: 'stacked', band: [0.45, 0.94] },
    ])
  })

  it('leaves the params of another layout alone', () => {
    expect(withSlice({ id: 'curved', params: { anchor: 0.8 } }).slice?.params).toEqual({
      anchor: 0.8,
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: FAIL — params pass through untouched, so the junk band survives.

- [ ] **Step 3: Validate the parts**

In `src/preset/storage.ts`, add the import:

```ts
import { readParts } from '../slice/parts'
```

and replace `readSlice`:

```ts
function readSlice(value: unknown): SliceInstance | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const layout = getSlice(value.id)
  if (!layout) return undefined
  const params = isRecord(value.params) ? value.params : {}
  // Only the composed layout carries parts. Every other layout's params are
  // read by the layout itself, through fallbacks that cannot throw.
  if (layout.id === 'composed') {
    return { id: layout.id, params: { ...params, parts: readParts(params.parts) } }
  }
  return { id: layout.id, params }
}
```

`SliceInstance.params` is already `Record<string, unknown>`, so no preset
version bumps and nothing throws: a preset written by a newer build degrades to
something that still names its wedges.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/preset/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/preset/storage.ts src/preset/storage.test.ts
git commit -m "validate a stored part list on the way in"
```

---

### Task 12: The editor's three slots

Three fixed slots, always rendered. An empty slot shows only its Content row,
set to "None"; choosing a content fills it, and choosing "None" empties it. No
add or remove buttons, and no reordering — a slot's identity is its position.

Every slot uses the same row labels, so a test reaches a slot's control with
`getAllByLabelText(...)[n]`. Two jsdom facts govern those queries, both already
documented in `RecipeForm.test.tsx`: `SliderRow` wraps a readout *and* a range
input in one label, so a slider needs `{ selector: 'input[type="range"]' }`, and
a wrapping label associates with only its first labelable descendant.

**Files:**
- Create: `src/editor/PartsField.tsx`
- Modify: `src/editor/RecipeForm.tsx`
- Test: `src/editor/PartsField.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/editor/PartsField.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MAX_PARTS } from '../slice/parts'
import type { SlicePart } from '../slice/types'
import { PartsField } from './PartsField'

function Controlled({ initial, spy }: { initial: unknown; spy: (parts: SlicePart[]) => void }) {
  const [parts, setParts] = useState<unknown>(initial)
  return (
    <PartsField
      label="Part"
      max={MAX_PARTS}
      value={parts}
      onChange={(next) => {
        spy(next)
        setParts(next)
      }}
    />
  )
}

const onePart: SlicePart[] = [
  { content: { from: 'text', value: 'BANKRUPT' }, orientation: 'stacked', band: [0.45, 0.94] },
]

const slider = (label: string, index: number) =>
  screen.getAllByLabelText(label, { selector: 'input[type="range"]' })[index]

describe('PartsField', () => {
  it('renders one slot per allowed part', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getAllByLabelText('Content')).toHaveLength(MAX_PARTS)
  })

  it('shows only the content row for an empty slot', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getAllByLabelText('Orientation')).toHaveLength(1)
  })

  it('shows the authored word only when the content is an authored word', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Word')).toHaveValue('BANKRUPT')
    expect(screen.queryByLabelText('Shorten')).toBeNull()
  })

  it('shows the shortening choice only when the content is the label', () => {
    const parts: SlicePart[] = [
      { content: { from: 'label' }, orientation: 'stacked', band: [0.45, 0.94] },
    ]
    render(<PartsField label="Part" max={MAX_PARTS} value={parts} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Shorten')).toBeInTheDocument()
    expect(screen.queryByLabelText('Word')).toBeNull()
  })

  it('fills an empty slot on the part defaults', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Content')[1], 'label')

    expect(spy).toHaveBeenCalledWith([
      onePart[0],
      { content: { from: 'label' }, orientation: 'stacked', band: [0.45, 0.94] },
    ])
  })

  it('empties a slot when its content is set to none', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Content')[0], '')

    expect(spy).toHaveBeenCalledWith([])
    expect(screen.queryByLabelText('Orientation')).toBeNull()
  })

  it('changes one slot without touching another', async () => {
    const spy = vi.fn()
    const two: SlicePart[] = [
      ...onePart,
      { content: { from: 'label' }, orientation: 'archedRim', band: [0.8, 0.94] },
    ]
    render(<Controlled initial={two} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Orientation')[1], 'taperedRadial')

    expect(spy).toHaveBeenCalledWith([two[0], { ...two[1], orientation: 'taperedRadial' }])
  })

  it('keeps the band ordered when one edge is dragged past the other', () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    fireEvent.change(slider('Inner edge', 0), { target: { value: '0.99' } })

    const last = spy.mock.calls.at(-1)?.[0] as SlicePart[]
    expect(last[0].band[0]).toBeLessThanOrEqual(last[0].band[1])
  })

  it('offers a stretch of none, fill, or a chosen amount', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Stretch')[0], 'custom')
    expect(screen.queryAllByLabelText('Stretch amount')).not.toHaveLength(0)

    await userEvent.selectOptions(screen.getAllByLabelText('Stretch')[0], 'fill')
    expect(screen.queryAllByLabelText('Stretch amount')).toHaveLength(0)
    expect((spy.mock.calls.at(-1)?.[0] as SlicePart[])[0].stretch).toBe('fill')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/editor/PartsField.test.tsx`
Expected: FAIL — cannot resolve `./PartsField`.

- [ ] **Step 3: Write the component**

`src/editor/PartsField.tsx`:

```tsx
import { CheckboxRow, PropertyGroup, SelectRow, SliderRow, TextRow } from '@weasel-js/labkit'
import { DEFAULT_PART, readParts } from '../slice/parts'
import type { ContentTransform, Orientation, PartContent, SlicePart } from '../slice/types'

export type PartsFieldProps = {
  label: string
  max: number
  value: unknown
  onChange: (parts: SlicePart[]) => void
}

const NONE = ''

const CONTENTS: { value: string; label: string; make: () => PartContent }[] = [
  { value: 'label', label: 'The wedge label', make: () => ({ from: 'label' }) },
  { value: 'text', label: 'An authored word', make: () => ({ from: 'text', value: '' }) },
  { value: 'media', label: "The wedge's picture", make: () => ({ from: 'media' }) },
  { value: 'weight', label: 'Its weight', make: () => ({ from: 'derived', value: 'weight' }) },
  { value: 'index', label: 'Its number', make: () => ({ from: 'derived', value: 'index' }) },
  {
    value: 'position',
    label: 'Its number of the total',
    make: () => ({ from: 'derived', value: 'position' }),
  },
]

const contentValue = (content: PartContent): string =>
  content.from === 'derived' ? content.value : content.from

const ORIENTATIONS: { value: Orientation; label: string }[] = [
  { value: 'stacked', label: 'Stacked — upright, down the radius' },
  { value: 'taperedRadial', label: 'Tapered — turned, along the radius' },
  { value: 'archedRim', label: 'Arched — on an arc inside the rim' },
  { value: 'curved', label: 'Curved — one run along the arc' },
  { value: 'tangential', label: 'Tangential — one run across the wedge' },
  { value: 'radial', label: 'Radial — one run along the radius' },
]

const TRANSFORMS: { value: ContentTransform; label: string }[] = [
  { value: 'full', label: 'Not at all' },
  { value: 'firstName', label: 'First name' },
  { value: 'initials', label: 'Initials' },
  { value: 'ellipsis', label: 'Cut with an ellipsis' },
]

const STRETCHES = [
  { value: 'none', label: 'None' },
  { value: 'fill', label: 'Fill the wedge' },
  { value: 'custom', label: 'A chosen amount' },
]

const stretchValue = (part: SlicePart): string =>
  typeof part.stretch === 'number' ? 'custom' : (part.stretch ?? 'none')

export function PartsField({ label, max, value, onChange }: PartsFieldProps) {
  // The stored list is uncapped; the editor only ever shows `max` of it.
  const parts = readParts(value).slice(0, max)
  const slots: (SlicePart | undefined)[] = Array.from({ length: max }, (_, i) => parts[i])

  const write = (next: (SlicePart | undefined)[]) =>
    onChange(next.filter((part): part is SlicePart => part !== undefined))

  const replace = (index: number, part: SlicePart | undefined) =>
    write(slots.map((slot, i) => (i === index ? part : slot)))

  const edit = (index: number, patch: Partial<SlicePart>) => {
    const part = slots[index]
    if (part) replace(index, { ...part, ...patch })
  }

  const setContent = (index: number, choice: string) => {
    if (choice === NONE) {
      replace(index, undefined)
      return
    }
    const entry = CONTENTS.find((candidate) => candidate.value === choice)
    if (!entry) return
    replace(index, { ...(slots[index] ?? DEFAULT_PART), content: entry.make() })
  }

  const setStretch = (index: number, choice: string) => {
    if (choice === 'custom') edit(index, { stretch: 1.5 })
    else if (choice === 'fill') edit(index, { stretch: 'fill' })
    else edit(index, { stretch: 'none' })
  }

  // Written back ordered, so dragging one edge past the other narrows the band
  // rather than inverting it.
  const setBand = (index: number, edge: 0 | 1, next: number) => {
    const part = slots[index]
    if (!part) return
    const [a, b] = edge === 0 ? [next, part.band[1]] : [part.band[0], next]
    edit(index, { band: [Math.min(a, b), Math.max(a, b)] })
  }

  return (
    <>
      {slots.map((part, index) => (
        <PropertyGroup
          // A slot is a fixed position, not an entry in a reorderable list.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the identity.
          key={index}
          title={`${label} ${index + 1}`}
          pack="pairs"
        >
          <SelectRow
            label="Content"
            value={part ? contentValue(part.content) : NONE}
            options={[
              { value: NONE, label: 'None' },
              ...CONTENTS.map((entry) => ({ value: entry.value, label: entry.label })),
            ]}
            onChange={(next) => setContent(index, next)}
          />
          {part?.content.from === 'text' ? (
            <TextRow
              label="Word"
              value={part.content.value}
              onChange={(next) => edit(index, { content: { from: 'text', value: next } })}
            />
          ) : null}
          {part?.content.from === 'label' ? (
            <SelectRow
              label="Shorten"
              value={part.content.transform ?? 'full'}
              options={TRANSFORMS}
              onChange={(next) =>
                edit(index, { content: { from: 'label', transform: next as ContentTransform } })
              }
            />
          ) : null}
          {part ? (
            <>
              <SelectRow
                label="Orientation"
                value={part.orientation}
                options={ORIENTATIONS}
                onChange={(next) => edit(index, { orientation: next as Orientation })}
              />
              <SliderRow
                label="Inner edge"
                min={0}
                max={1}
                step={0.01}
                value={part.band[0]}
                onChange={(next) => setBand(index, 0, next)}
              />
              <SliderRow
                label="Outer edge"
                min={0}
                max={1}
                step={0.01}
                value={part.band[1]}
                onChange={(next) => setBand(index, 1, next)}
              />
              <SelectRow
                label="Direction"
                value={part.direction ?? 'rimInward'}
                options={[
                  { value: 'rimInward', label: 'Rim inward' },
                  { value: 'hubOutward', label: 'Hub outward' },
                ]}
                onChange={(next) => edit(index, { direction: next as 'rimInward' | 'hubOutward' })}
              />
              <CheckboxRow
                label="Grow toward the rim"
                value={part.fan ?? true}
                onChange={(next) => edit(index, { fan: next })}
              />
              <SelectRow
                label="Stretch"
                value={stretchValue(part)}
                options={STRETCHES}
                onChange={(next) => setStretch(index, next)}
              />
              {typeof part.stretch === 'number' ? (
                <SliderRow
                  label="Stretch amount"
                  min={1}
                  max={3}
                  step={0.05}
                  value={part.stretch}
                  onChange={(next) => edit(index, { stretch: next })}
                />
              ) : null}
              <SliderRow
                label="Max size"
                min={10}
                max={48}
                step={1}
                value={part.maxSize ?? 40}
                onChange={(next) => edit(index, { maxSize: next })}
              />
            </>
          ) : null}
        </PropertyGroup>
      ))}
    </>
  )
}
```

- [ ] **Step 4: Wire it into `RecipeForm`**

In `src/editor/RecipeForm.tsx`, add the import:

```ts
import { PartsField } from './PartsField'
```

and replace the placeholder `case 'parts'` arm from Task 7 with:

```tsx
      case 'parts':
        return (
          <PartsField
            key={field.key}
            label={field.label}
            max={field.max}
            value={value}
            onChange={(next) => set(field.key, next)}
          />
        )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/editor/PartsField.test.tsx src/editor/RecipeForm.test.tsx src/editor/SlicePanel.test.tsx`
Expected: PASS.

If `getAllByLabelText('Content')` finds fewer than `max`, `PropertyGroup` is
hiding a group it considers empty — every slot always renders its Content row,
so check that the group is not being passed `hidden`.

- [ ] **Step 6: Run everything**

Run: `npm test`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run check
git add src/editor/PartsField.tsx src/editor/PartsField.test.tsx src/editor/RecipeForm.tsx
git commit -m "edit a slice's three parts"
```

---

### Task 13: Look at it in a browser

jsdom paints nothing, so the look itself is only ever verified in a browser —
the same rule the theme work landed under. Nothing here is a unit test; it is
the step that catches a sign error in a rotation or a stretch on the wrong axis.

**Files:** none, unless it finds something.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:5173/#/edit`.

- [ ] **Step 2: Set up a wheel worth looking at**

Pick the `wof` theme, keep six to eight wedges, and give them a mix of short and
long labels (`ANA`, `BANKRUPT`, `SCHWARZENEGGER`).

Under **Slice layout**, choose **Composed**. Set Part 1 to: Content = the wedge
label, Orientation = Stacked, Inner edge 0.45, Outer edge 0.94, Direction = Rim
inward, Grow toward the rim = on, Stretch = Fill the wedge.

- [ ] **Step 3: Check each rule by eye**

- Letters run rim inward and read from outside the wheel, not upside down.
- Letters grow toward the rim. Turning off "Grow toward the rim" evens them out.
- No letter crosses a wedge edge, on the narrowest wedge on the wheel.
- A long name shrinks; it never loses a letter.
- `I` takes a narrower slot than `W` in the same word.
- Switching Orientation to **Tapered** turns the letters a quarter turn, they
  still read outward, and the stretch makes them *taller*, not longer. If the
  word smears along the radius, the stretch is on the wrong axis.
- Switching to **Arched** puts the word on an arc near the rim, each letter
  square on the arc rather than all tilted the same way.
- Switching to **Radial**, **Tangential** or **Curved** draws exactly what those
  layouts drew before this branch.

- [ ] **Step 4: Add a second and third part**

Part 2: Content = an authored word, Word = `BANKRUPT`, Orientation = Arched,
Inner edge 0.20, Outer edge 0.34. Part 3: Content = its number, Orientation =
Stacked, Inner edge 0.06, Outer edge 0.16.

Check: all three draw at once; changing Part 2's band moves nothing else; a
wedge with a long label does not push Part 2 anywhere.

- [ ] **Step 5: Spin it**

Check that a composed wedge animates in and out exactly as a plain label does —
one group, one presence — and that no letter drifts relative to its wedge
mid-spin.

- [ ] **Step 6: Screenshot, and open the image so it lands on screen**

If anything on the list is wrong, fix it in the module that owns the decision:
`typeset.ts` for a position, size, rotation or scale; `SliceElements.tsx` only
if the transform string itself is wrong. Add the unit test that would have
caught it, and commit the fix with its test.

---

## What this plan does not build

Each is the second plan's, and each is reachable from what this one lands:

- **Outline mode.** `shape` is read and stored; `typeset` ignores it, so an
  authored `outline` renders in glyph mode — which is the fallback the spec
  specifies for a face that has not finished parsing anyway.
- **The font registry, `FontId` validation, and `Theme.font`.** `font` is read
  and stored as a string; nothing resolves it.
- **The baked specimen paths and the face picker.**
- **The shear on an across-wedge glyph run.**
