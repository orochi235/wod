# wod editor — design

Date: 2026-07-30
Status: approved, not yet implemented
Builds on: `2026-07-29-wod-design.md`

## Summary

An editor for the wheel, at `/edit`, built on `@weasel-js/labkit` and
`@weasel-js/ui`. It edits the segment list and their relative weights, and it
manages a library of **tricks** — saved, parameter-bound instances of structural
**recipes**, of which the free-beer takeover is one instance rather than a
special case.

This covers steps 3 and 4 of the parent spec's build order (composer, presets,
`localStorage`) from the authoring side. It does not touch the rig channel, the
Meet source, or reveals.

## Goals

- Edit segments — add, delete, reorder, rename, recolor, reweight.
- Build a library of tricks that outlives any single meeting.
- Preview a trick precisely enough to catch a bad frame, not just watch it fly by.
- Keep the show window (`/`) free of editor chrome, because it is screen-shared.

## Non-goals (v1)

- **Multi-preset management.** One preset. The storage key is namespaced so
  additional presets are purely additive later.
- **Live-fired tricks.** Everything here is scheduled at launch. The rig channel
  and mid-spin firing remain step 5 of the parent spec.
- ~~**Editing reveals.**~~ Shipped since. Reveals are authored per segment and
  per override, and the overlay renders at the landing — see
  `2026-08-09-post-landing-lifecycle-design.md`.
- **A visual keyframe editor.** Recipes expose parameters, not raw keyframes.

## Core distinction: recipes and tricks

A **recipe** is structural and named for what it does to the wheel. A **trick**
is a recipe with its parameters bound, saved under whatever name the operator
finds memorable.

The free-beer gag is not a recipe. It is a `takeover` trick whose wedge
parameter happens to say "free beer". Recipe names never mention the joke.

```ts
type RecipeId = 'takeover' | 'vanish' | 'recolor' | 'relabel'

type TrickParams = Record<string, unknown>

/** All segments (including provided wedges), plus what the recipe needs to resolve. */
type RecipeContext = {
  trickId: string
  segments: Segment[]
  durationMs: number
}

type Recipe = {
  id: RecipeId
  /** Structural. "One wedge swallows the wheel", never "free beer". */
  name: string
  description: string
  defaults: TrickParams
  /** Drives the generated parameter form. */
  fields: RecipeField[]

  /** Weight-0 segments this recipe contributes. Usually empty. */
  provides(params: TrickParams, trickId: string): Segment[]

  /** Pure. The only thing that affects what actually runs. */
  resolve(params: TrickParams, ctx: RecipeContext): Morph[]

  /** Editor-facing only. Never consulted during resolution. */
  writes(params: TrickParams, ctx: RecipeContext): Write[]

  /** Human-readable reason this trick cannot run, or null. */
  validate(params: TrickParams, segments: Segment[]): string | null
}

type Write = {
  segmentId: string
  property: 'weight' | 'color' | 'label' | 'media'
}

/** Declarative form spec. The editor renders these; recipes never import React. */
type RecipeField =
  | { key: string; label: string; kind: 'slider'; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'number'; min?: number; max?: number }
  | { key: string; label: string; kind: 'color' }
  | { key: string; label: string; kind: 'text' }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  /** Multi-select over the current segment list, resolved at render time. */
  | { key: string; label: string; kind: 'segments' }

type Trick = {
  id: string
  name: string          // operator's free text, e.g. 'slow burn'
  recipe: RecipeId
  params: Record<string, unknown>
  enabled: boolean
}
```

`writes()` exists so the editor can badge conflicts. It is deliberately not
consulted by `resolveTricks`, so a wrong `writes()` can produce a misleading
badge but can never change what the wheel does.

### `Segment` is unchanged

Ownership of a provided wedge is **derived**, not stored: the editor recomputes
it by calling `provides()` for each enabled trick. The `wheel` module therefore
never learns that tricks exist, and `wheel/types.ts` needs no new field.

## Resolution

```ts
resolveTricks(
  segments: Segment[],
  tricks: Trick[],
  durationMs: number,
): { segments: Segment[]; morphs: Morph[] }
```

Two passes, and the order between them is load-bearing:

1. **Provide.** For each enabled trick in list order, append
   `recipe.provides(params, trick.id)` to the segment list.
2. **Resolve.** For each enabled trick in list order, concat
   `recipe.resolve(params, allSegments, durationMs)`.

Pass 1 must complete before pass 2 begins. Otherwise a `recolor` targeting every
segment would miss a wedge that a later `takeover` injects.

### Composition is last-write-wins, in trick-list order

`applyMorphs` already loops over every morph hitting a given segment, threading
the accumulated value forward. But a morph with an explicit `at: 0` keyframe
overwrites that accumulated value rather than building on it. The resulting
semantics, which this design adopts rather than changes:

> Tricks with disjoint targets compose freely. Tricks that write the same
> (segment, property) resolve last-write-wins, where "last" means lowest in the
> trick list.

Reordering the trick list is the resolution mechanism. `morph.ts` is not
modified.

### Known sharp edge: relational recipes go last

`takeover` shrinks "everyone else" by baking absolute weights at resolve time.
When another weight-writing trick sits *below* it in the list, that trick wins
and `takeover`'s proportional math is left computed against weights that no
longer apply.

There is no automatic fix within last-write-wins semantics. The mitigations are:

- The editor badges any (segment, property) written by more than one enabled
  trick, using `writes()`.
- Recipe documentation states that relational recipes belong at the bottom of
  the list.

This is accepted rather than solved. The alternative — a multiplicative
`weightScale` keyframe channel that composes commutatively — was considered and
rejected as machinery ahead of a gag that needs it.

## Recipe catalog v1

Four recipes, chosen to cover four distinct code paths rather than four jokes.

| Recipe | Structural name | Path it exercises |
|---|---|---|
| `takeover` | One wedge swallows the wheel | provides a wedge; relational weight math |
| `vanish` | Named wedges shrink away | targets existing segments; weight → 0 |
| `recolor` | Named wedges change color | continuous non-weight property (lerped) |
| `relabel` | Named wedges change label | discrete non-weight property (step-sampled) |

`recolor` and `relabel` are not redundant: `morph.ts` interpolates color through
`lerpColor` but samples label and media through `sampleStep`. They are different
branches and both need a recipe exercising them.

### `takeover`

```ts
type TakeoverParams = {
  /** A new wedge this trick owns, or an existing segment it drives. */
  wedge: { mode: 'new'; label: string; color: string }
        | { mode: 'existing'; segmentId: string }
  holdUntil: number     // 0..1 — sit at base weight until here
  endShare: number      // 0..1 — share of the circle at landing, default 1
  endColor?: string
  easing: EasingName
}
```

In `new` mode, `provides()` returns one segment at weight 0, with an id derived
from the trick id. In `existing` mode it returns nothing.

`resolve()` emits a growth morph for the wedge and a shrink morph for every
other segment. When `endShare` is 1 the others go to 0, which is what makes the
wedge guaranteed to win — the parent spec's geometry-enforced rigging, reached
without a special case.

### The other three

`vanish`, `recolor`, and `relabel` all take `targets: string[]` (empty meaning
every segment) plus a timing parameter and an easing, and emit one morph per
target. None of them provide segments.

## Adding a recipe

One new file under `tricks/recipes/`, one registry entry. No change to the
editor, which generates its parameter form from `fields`; no change to `wheel`,
`selection`, or `morph`. This is the extension point the parent spec asks for.

## The editor

Route `#/edit`, rendered in a labkit `LabShell`. Three columns.

Routing is hash-based and hand-rolled — about fifteen lines in `main.tsx`, no
router dependency. A static SPA on GitHub Pages cannot serve a clean `/edit`
path without a server rewrite, and the parent spec's `/admin` window has the
same constraint, so hash routes are the honest choice for both.

### Left — segment list

A labkit `PropertyPanel` wrapping one compact row per segment: rename, reorder,
delete, a `NumberRow` weight and a `ColorRow`.

Not `LayerStack`, despite it being the obvious candidate. Its API is built
around effect *kinds* — it requires `paletteKinds`, `kind`, and
`onPrimaryChange` per item — and segments have no kind. Forcing a segment list
through it would mean inventing a fake kind for every person on the wheel.
`PropertyPanel` plus rows is the primitive that actually fits.

Trick-owned wedges appear as dimmed rows with a read-only weight, tagged with
the owning trick's name. Clicking one selects that trick in the right column.
Deleting the trick removes the wedge; the segment list cannot delete it
directly.

### Center — wheel and transport

The existing `<Wheel>` plus two controls:

- **Scrub** — a slider over 0..1 driving
  `applyMorphs(segments, morphs, t * durationMs)` with the wheel stationary.
  `applyMorphs` is already pure, so scrubbing needs no new animation machinery
  and shares exactly the code path a real spin uses.
- **Play** — a real `spin()` with the resolved morphs.

Scrubbing is what catches a degenerate frame at t=0.9 that a real spin blurs
past. It is the reason preview is not just a play button.

### Right — trick library

A labkit `EffectCardList` — enable/disable cards with expandable bodies and
drag reorder, which is exactly the required shape. Below it, a `PropertyPanel`
whose rows are generated from the selected recipe's `fields`, mapping
`RecipeField` types onto labkit's `SliderRow`, `NumberRow`, `ColorRow`,
`SelectRow`, `TextRow`, and `ToggleRow`.

Cards carrying a write conflict show a ⚠ badge naming the contested segments.

### Styling

All styling in CSS classes, per the parent spec and the repo's standing rule.
Data-driven values arrive as CSS custom properties. No inline style rules, no
`!important`.

## Persistence

`localStorage`, extending the parent spec's `Preset` with `tricks: Trick[]`.
One preset in v1, stored under a namespaced key so additional presets are
additive.

`/edit` writes; `/` reads. A `storage` event listener on the show window picks
up edits live, so an open screen-shared wheel updates without a reload.

Presets export and import as JSON, through a download link and a file picker in
the editor header. Import runs through the same defensive parser as load, so a
hand-edited or stale file degrades rather than throwing.

### Loading is defensive

A stored trick is validated against its recipe on load. Unknown recipe id,
missing parameter, or a target segment that no longer exists degrades that trick
to disabled-with-a-warning. It never throws and never blocks the editor, per the
parent spec's rule that the wheel never breaks the bit.

## Dependencies

`@weasel-js/ui` and `@weasel-js/labkit` from the weasel monorepo, which are
version-locked at 0.7.0 and ship labkit's `./weasel-ui` passthrough. The
standalone `~/src/labkit` checkout (`@lab-kit/react`) is a stale predecessor and
is not used.

## Seed data — the free beer wedge starts at zero width

Two changes to today's `App.tsx`:

1. The `beer` segment's weight goes from `0.02` to `0`. It is invisible at rest,
   so the wedge does not exist until the trick grows it. A 0.02 sliver telegraphs
   the gag.
2. `BEER_TAKEOVER` stops being a hardcoded `Morph[]`. It becomes seed data for a
   `takeover` trick in the default preset, and `App.tsx` reads the preset instead
   of holding constants.

The hardcoded arrays in `App.tsx` are deleted, not kept alongside.

## Testing (Vitest)

**Recipes** — for each of the four:

- `resolve()` touches only the segments its parameters name.
- `resolve()` is deterministic for fixed inputs.
- `provides()` returns segments at weight 0, or nothing.
- `writes()` agrees with the (segment, property) pairs `resolve()` actually
  emits. This is the test that keeps the conflict badge honest.

**`resolveTricks`:**

- A wedge provided by one trick is visible to another trick's `resolve()` —
  the two-pass ordering, asserted directly.
- Disabled tricks contribute neither segments nor morphs.
- Overlapping writes resolve to the lower trick in list order, and reordering
  flips the result.
- `takeover` with `endShare: 1` drives every other segment to zero at landing,
  so `landingSegments` leaves exactly one candidate and selection is forced.

**Persistence:**

- Preset survives a JSON round trip.
- A trick naming a deleted segment loads disabled rather than throwing.
- An unknown recipe id loads disabled rather than throwing.

**Editor:**

- Segment add, delete, reorder, and weight edit update the preset.
- The scrubber at `t` renders exactly `applyMorphs(segments, morphs,
  t * durationMs)`.
- A trick-owned row is not directly deletable, and deleting its trick removes it.

Animation quality remains verified by eye, per the parent spec.

## Build order

1. `tricks/` module — types, registry, `resolveTricks`, and the four recipes,
   with tests. No UI.
2. Preset persistence and defensive loading.
3. `App.tsx` reads the preset; beer wedge to weight 0; hardcoded arrays deleted.
4. `/edit` route and `LabShell` scaffold.
5. Segment list column.
6. Trick library column and generated parameter forms.
7. Scrub and play transport.
8. Conflict badges.

Steps 1–3 are shippable on their own: the gag keeps working, driven by data
instead of constants, before any editor UI exists.
