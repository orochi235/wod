# Composed slices

**What this is:** the design for setting several pieces of type and imagery inside one
wedge, and for the three typesetting styles a Wheel of Fortune wedge needs. It replaces
the rule that one registered layout owns a whole wedge.

**Who it's for:** whoever implements it, and whoever later makes slices freeform.

**The question it answers:** what is a slice made of, and how does a word get its size,
its spacing, and its shape inside a wedge that narrows toward the hub.

A *slice* is how one wedge's contents are drawn. A *part* is one piece of that — a name,
an authored word, a portrait. A *band* is the stretch of radius a part occupies, written
as fractions of the wheel's radius.

## The model

A slice is an ordered list of parts:

```ts
type SlicePart = {
  content: PartContent
  orientation: Orientation
  /** Inner and outer edge, as fractions of the radius. */
  band: [number, number]
  /** Default 'rimInward'. */
  direction?: 'rimInward' | 'hubOutward'
  /** Letters keep their relative growth toward the rim. Default on for stacked and tapered. */
  fan?: boolean
  /** Widen each glyph to the room at its radius. Default 'none'. */
  stretch?: 'none' | 'fill' | number
  /** How the run is drawn. Default 'glyphs'. */
  shape?: 'glyphs' | 'outline'
  /** A registry id. Absent means the theme's default face. */
  font?: FontId
  maxSize?: number
  frame?: Frame
}

type PartContent =
  | { from: 'label'; transform?: ContentTransform }
  | { from: 'text'; value: string }
  | { from: 'media' }
  | { from: 'derived'; value: 'weight' | 'index' | 'position' }
```

`Orientation` gains `stacked` (upright letters down the radius), `taperedRadial`
(quarter-turned letters along the radius, narrowing with the wedge), and `archedRim` (a
baseline on an arc just inside the rim) beside today's `radial`, `tangential`, `curved`.

The params are the freeform shape from the start. The editor caps the list at three
parts; lifting that cap later is a UI change and not a data migration.

A band that runs to the hub tapers itself into unreadability — the chord goes to zero, so
the last letters hit the size floor. Type belongs in the outer half; the WoF theme's own
parts should stop around 0.45.

Parts do not negotiate for space. Each owns its band outright, overlap is the author's
business, and nothing reflows when a neighbouring part changes — a part's position is a
property of the part, so a look holds still as names come and go.

## Setting a word

Five rules, all of them load-bearing. Each is stated as the thing that goes wrong
without it, because each was found by a render that looked wrong.

**A glyph's step is its measured advance, plus a tracking constant.** Never a nominal
fraction of the size: a constant step gives `I` the same slot as `W` and leaves holes in
the middle of a word.

**The run fills its band.** Sizes are linear in a single fit unit, so the solve is one
division per pass rather than a search: `unit = bandLength / Σ(weight × step)`. Fanning
re-weights by the chord at each glyph's settled radius and repeats; a handful of passes
converge.

**No glyph exceeds the chord at its own radius.** The wedge narrows toward the hub, and
a letter sized for the rim overruns the sides further in.

**A word never truncates; it shrinks to `MIN_SIZE` and stops.** Dropping letters changes
what a wedge says, which is worse than small type. The existing content ladder — full,
first name, initials — remains the author's tool for names that are too long to read,
not something the fit applies on its own.

**Stretch is measured in wedge space, not glyph space.** A quarter-turned letter has
swapped its axes, so the stretch applies to the other one and "the room" means its height
rather than its advance. Backwards, the type smears along the radius instead of across
the wedge. Stretch is capped near 3× so a short word cannot smear.

Height and width are independent: height comes from the band solve, width from the chord.
That separation is what lets a name fill a wedge without the letters ballooning, and it is
why `stretch` is its own field rather than a mode of `fan`.

## Two shapes for a run

`shape: 'glyphs'` places each character with its own affine transform — scale, the
stretch above, and, for a run set *across* the wedge, a shear that leans it to follow the
converging sides. A run set along the radius is centred on it and needs no shear, which
is why a tapered radial word looks the same in both shapes. Real `<text>`, any font, no
loading. The taper is stepwise at the letter joins: invisible on short words, and
increasingly not on long ones.

`shape: 'outline'` sets the word once and warps its outlines into the wedge, so the run
is one continuous shape. This is the smoother result and the one to reach for. Being
non-affine, it cannot be a transform: the points themselves move, which means the glyph
geometry has to be available.

Outline mode emits a single `{ kind: 'path', d }` — the element kind already exists.
Only glyph mode needs a new one, `glyphRun`: a list of positioned, sized, rotated,
stretched characters. The renderer gains that one kind and stays dim; every decision is
made in the pure layer.

## Where outlines come from

The font file, parsed on demand, cached per glyph. Nothing is baked at build time.

No browser API hands back a glyph's outline — canvas gives advances and bounding boxes,
`document.fonts` gives the file's identity, and SVG cannot extract a path from `<text>`.
So outline mode fetches the face and parses it (opentype.js), lazily: glyph mode never
pays for the parser, and a face is parsed once. Glyph paths are memoised by face and
character, so a roster of repeating letters costs one parse each.

A build-time subset was considered and rejected. It buys a smaller first load for outline
mode, and costs a second source of metrics — a word would fit one way from the baked JSON
and another from the parser, a difference invisible until someone screenshots it. One
source cannot disagree with itself.

Using the face's own metrics is also why `typeset` becomes exactly testable: today's
advances come from canvas measurement, which jsdom fakes.

**Parsing is async, so a part in outline mode renders in glyph mode until its face is
ready.** The face is requested when the theme resolves, not when the first wedge draws,
so the one swap lands at load and never mid-spin.

A character the face does not carry — an emoji, most obviously — drops **the whole part**
to glyph mode. One missing character never leaves a half-warped word, and never changes
what the wedge says.

## Which face

Faces live in a registry, on the precedent `src/slice/registry.ts` and
`src/transition/registry.ts` set: an id, a display name, and the file to load. A part
carries `font?: FontId` and falls back to the theme's default, so adding a third face is
a registry entry and a file — no type changes, and a wedge can reach for any bundled face
rather than only the ones its theme nominated.

Two faces to start, both OFL:

- **Anton** — the default. Condensed, heavy, and the only candidate that stays legible at
  fourteen letters in one wedge.
- **Rye** — the woodtype, for short authored words like BANKRUPT. Its inline detail
  muddies at small sizes, which is why it is not the default and why nothing long should
  be set in it. Bevan is the fallback choice if that proves too fragile.

Because outline mode can only warp a face we bundle, `font` is an id from the registry
and never a raw family string: a free string would let a part silently render unwarped.

## Modules

| File | Responsibility |
| --- | --- |
| `src/slice/typeset.ts` | *new* — pure. A part and a context to concrete placements: the solve, the caps, fan, stretch, direction. |
| `src/slice/outline.ts` | *new* — placements to one warped `d`. Pure given a glyph source; owns the memo, not the fetch. |
| `src/slice/fonts/registry.ts` | *new* — `FONTS`, `FONT_LIST`, `getFont`. Loads and parses a face once, on demand. |
| `src/slice/layouts/composed.ts` | *new* — reads `parts`, maps each through `typeset`, concatenates the elements. |
| `src/slice/layouts/{radial,tangential,curved}.ts` | Keep their ids, names, fields and defaults; each becomes a one-part composition. One code path. |
| `src/slice/layouts/auto.ts` | Unchanged in spirit: still chooses an orientation by what fits. |
| `src/slice/types.ts` | `SlicePart`, `PartContent`, the widened `Orientation`, `composed` on `SliceLayoutId`, the `glyphRun` element kind. |
| `src/slice/SliceElements.tsx` | Renders `glyphRun`. No filters inside a wedge — the group is rewritten every frame. |
| `src/editor/RecipeForm.tsx` | A repeating parts field, three slots. |
| `src/preset/storage.ts` | `readSlice` validates parts. |

## Storage

`SliceInstance.params` is already `Record<string, unknown>`, so v5 presets need no
version bump. `readSlice` validates: an unknown orientation drops that part, a band
outside 0..1 or inverted is clamped, a non-array `parts` falls back to a one-part label
composition. Nothing throws, and a preset written by a newer build degrades to something
that still names its wedges.

## What this does not change

Arc geometry, the selection guard, the transition contract, and the theme's part list. A
wedge is still one group carrying presence custom properties, so a composed slice
animates in and out exactly as a plain label does today. Themes still own the wheel's
furniture; slices own what is written on a wedge.

## Testing

`typeset` and `outline` are pure, so the rules above get unit tests that fail when the
rule is broken, not tests that restate the code: a run fills its band; the chord cap binds
on a short word; the floor binds on a long one; direction reverses the order; fan off
makes every size equal; stretch on a quarter-turned glyph moves the correct axis; a
narrow letter takes a narrower slot than a wide one at the same size.

Beyond the pure layer: a composed layout renders its parts in order in their own bands; a
part whose content resolves to nothing emits no element; junk params survive `readSlice`
as a plain label; the baked subset and the parser agree on advances.

jsdom paints nothing, so the look itself is only ever verified in a browser — the same
rule the theme work landed under.

## Suggested order

Two plans, not one. Composition with glyph mode is a complete feature on its own: parts,
bands, the three orientations, the solve, the editor, and validation. Outline mode adds a
bundled face, a build step, a lazy parser and a warp, and nothing in the first half waits
on it — `shape` simply defaults to `glyphs` until it lands.

## Open

- Which face to bundle, if outline mode is built. It needs a heavy display weight to read
  at wedge sizes and a licence permitting baked outlines; Anton or Archivo Black (both
  OFL) are the obvious candidates. Whatever is chosen also becomes the wheel's label face
  in glyph mode, or the two shapes would set the same name differently.
- Whether `archedRim` should also warp its outlines. The lean is subtler on an arc than
  on a converging wedge, so glyph mode may be enough; decide by looking at it.
