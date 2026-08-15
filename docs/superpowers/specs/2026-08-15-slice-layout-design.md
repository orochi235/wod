# Slice layout

How a wedge decides what to draw inside itself: a registry of layouts, a
`draw()` that returns elements rather than DOM, and a rule for what happens when
the label does not fit.

Audience: anyone working on `src/wheel` or `src/editor`. It replaces the label
handling in `Wheel.tsx` and `label.ts` outright.

## The problem

`Wheel.tsx` draws one thing per wedge, one way: a single line of text running
outward along the radius, shrunk to the arc's chord, truncated to the radius,
and dropped entirely below 8px. A weight-0.5 wedge renders no text at all, and a
rigged wedge the room cannot read is a rigged wedge the room cannot verify.

Underneath that is a second problem the live roster makes permanent. The flip
that keeps left-half labels reading left-to-right is a function of where a wedge
sits, so when someone joins the Meet call every arc shifts and labels that
crossed the vertical reverse. The typography changes because a stranger arrived.

## Frame

A wedge's contents are drawn in one of two frames, and this is the axis the rest
of the taxonomy hangs off.

**`wheel`** — painted on and riding the rotation, like a physical prize wheel.
One handedness for the whole wheel, so nothing is decided per wedge and nothing
is destabilized by roster churn. Legibility at any instant is whatever the
geometry gives; a spinning object owes no more than that. **This is the default.**

**`level`** — the anchor orbits, the orientation never rotates. Horizontal at
every rotation, mid-spin included, which makes it the only frame where "is this
readable" has an answer that does not depend on where the spin stopped.

Handedness in `wheel` frame is clockwise, uniformly: curved text sweeps
clockwise, radial and tangential text runs outward. No wedge is special-cased,
including the one under the pointer — the rotor's angle adds to every wedge's
screen angle, so a rest-time claim about 12 o'clock holds for exactly one
rotation out of all of them and is not worth writing code for.

Level frame costs fit budget. Horizontal text inside an orbiting wedge has to
stay inside that wedge at *every* rotation, so its budget is the distance from
the anchor to the nearest edge — a disc, not a radial run. That is the whole
reason both frames ship instead of just the correct one.

## Taxonomy

Four independent axes. A layout is a point in this space; `auto` is a walk
through it.

| Axis | Values | What it changes |
| --- | --- | --- |
| frame | `wheel`, `level` | whether orientation rides the rotor |
| orientation | `radial`, `tangential`, `curved` | which dimension bounds the text |
| content | `full`, `firstName`, `initials`, `ellipsis` | what text is even attempted |
| anchor | 0..1 of radius, plus the band thickness claimed | where it sits |

Orientation matters because the three differ in what constrains them, not in how
they look:

| Orientation | Length budget | Thickness budget | Wins on |
| --- | --- | --- | --- |
| `radial` | the hub-to-rim run — **independent of arc width** | chord `2r·sin(πw)` | narrow arcs |
| `tangential` | chord at the anchor radius | radial extent | fat arcs, short labels |
| `curved` | arc length `2πr·w` — **grows with radius** | band thickness | fat arcs, long labels |

In `level` frame, orientation collapses: text is horizontal, and the only budget
is the rotation-invariant disc.

Radial is the one orientation that ignores the anchor. A radial line is centered
on where it sits, so anchoring it near the rim and then spending a full budget
puts half the label outside the wheel; it centers on the hub-to-rim run instead.
Every budget also keeps a margin — a line that exactly fills its arc reads as one
continuous string across the wedge boundary, and a level disc tangent to the rim
touches it.

## The ladder

The ladder is the answer to "it doesn't fit." Today that answer is hardcoded and
terminal — shrink, truncate, vanish. A ladder is an ordered list of rungs, each
an `(orientation, content)` pair, and the engine takes the first that measures
under budget:

```
curved/full → tangential/full → radial/full → radial/firstName
            → curved/initials → radial/initials → none
```

`Bobson Dugnutt` at weight 0.3 lands on initials instead of on nothing.

The ladder is not a config concept. It lives inside the shipped `auto` layout as
one of its params, chosen from a handful of named ladders through an ordinary
`select`. That keeps the configuration surface identical to a transition's —
`{ id, params }` — and keeps the editor free of a reorder UI nobody has asked
for.

## draw()

A layout is the same shape as a transition, which is the precedent it should
match:

```ts
type SliceLayout = {
  id: SliceLayoutId
  name: string
  description: string
  defaults: SliceParams
  fields: Field[]
  /** Pure. Returns elements, never DOM. */
  draw(params: SliceParams, ctx: SliceContext): SliceElement[]
}
```

```ts
type SliceContext = {
  segment: Segment
  arc: { start: number; end: number }   // turns
  radius: number
  index: number
  count: number
  /** Advance width of `text` at `size`, in user units. Injected, never imported. */
  measure: (text: string, size: number) => number
  /** The budget table above, callable: returns a placement or null. */
  fit: (spec: FitSpec) => Placement | null
}
```

`draw` returns a list, not nodes:

```ts
type Drawn =
  | { kind: 'text'; text: string; along: 'radial' | 'tangential'; anchor: number; size: number }
  | { kind: 'curvedText'; text: string; anchor: number; size: number }
  | { kind: 'image'; href: string; anchor: number; size: number; clip?: 'circle' | 'wedge' }
  | { kind: 'path'; d: string; fill?: string; opacity?: number }
  | { kind: 'raw'; node: ReactNode }

/** `frame` overrides the layout's own, so a portrait can ride while its caption stays level. */
type SliceElement = Drawn & { frame?: Frame }
```

`raw` is the escape hatch: anything the vocabulary cannot say yet goes through it
without an engine change. Everything else stays pure data, so a layout is tested
by asserting on the elements it returns — the way `frames()`, `arcs()`, and
`fitLabel` are tested today — and `Wheel.tsx` remains the only file that touches
the DOM.

## Measurement

The 0.55-glyph-ratio estimate budgets `Rey McSriff` and `WWWW WWWWWWW`
identically. A rung that fits by estimate and overflows on screen is worse than
the truncation it replaced, because by then the wheel is spinning.

Measurement is canvas `measureText`, taken once per `(text, font)` at size 1 and
scaled, cached for the session. It is injected as `ctx.measure` rather than
imported, so the one impure thing sits at the `Wheel.tsx` edge where the DOM
already lives, tests pass a deterministic measurer, and the environments without
a canvas (jsdom) get the old estimate as a swap rather than a branch.

SVG `textPath` advances glyphs along a curve, so a canvas measurement runs a hair
short on tight radii. The curved rungs carry a safety margin; they do not carry a
promise.

## Configuration

`{ id, params }`, resolved out of the registry by id — a `SliceInstance`, shaped
exactly like `TransitionInstance`. Precedence follows `color` and `reveal`
through compose:

```
Segment.slice → ItemOverride.slice → Preset.slice → built-in `auto`
```

Every new field is optional, so no preset version bump. The *rendering* default
does change: single handedness replaces the positional flip, deliberately.

## Mid-spin stability

A morph changes weights every frame, so arcs change every frame, so a
per-frame ladder walk can pop a label between orientations mid-spin.

The rule: **while a spin owns the geometry, resolve against the landed frame, not
the live one.** `useSpin` already computes `landedFrame` before the rotation
starts. Idle renders resolve against live geometry as normal.

## Level frame without a rAF loop

The rotor runs one WAAPI animation built by `rotationTrack`. A level element
runs the same track with negated rotation values — identical offsets, identical
easing, identical duration — on an inner `<g>` at the element's own origin. It
is *n* animations set up once per spin, not per-frame JavaScript, and the
inverse is derived from the same track object rather than recomputed, so the two
cannot drift apart.

The registration follows `useEnter`: a ref registrar hands `useSpin` the level
groups by segment id.

## Editor

One new panel and one per-row disclosure.

**Slice layout panel** — a `SelectRow` over the registry plus a `RecipeForm`
driven by the layout's `Field[]`, structurally identical to `TransitionPanel`.
Layout, frame, ladder, anchor, and max size are all existing field kinds;
`form/fields.ts` gains nothing.

**Per-wedge override** — inside the existing per-row disclosure where
`RevealEditor` already lives. The rows are six controls wide at a 14rem minimum
and a seventh takes the label field down to about six characters, which is
unreadable in the field that edits `Darryl Archideld`.

**Fit report** — what each wedge actually resolved to, with the degraded ones
marked. The engine already returns the resolved rung, so this is a list of what
it returned. It exists so the operator learns that `Todd Bonzalez` renders as
`TB` in the editor rather than on a shared screen mid-show.

## Modules

| Module | Change |
| --- | --- |
| `src/slice/types.ts` | **New.** `SliceLayout`, `SliceContext`, `SliceElement`, `Frame` |
| `src/slice/registry.ts` | **New.** `getSlice`, mirroring `getTransition`'s prototype guard |
| `src/slice/layouts/{auto,radial,tangential,curved}.ts` | **New.** The shipped draws |
| `src/slice/fit.ts` | **New.** Budgets per orientation and frame |
| `src/slice/measure.ts` | **New.** Canvas measurer, cache, estimate fallback |
| `src/slice/ladder.ts` | **New.** Named ladders and the walk |
| `src/wheel/Wheel.tsx` | Renders `SliceElement[]`; loses its inline label and flip logic |
| `src/wheel/label.ts` | **Deleted.** Absorbed by `fit.ts` |
| `src/wheel/useSpin.ts` | Counter-animates level groups from the rotation track |
| `src/wheel/types.ts` | `Segment` gains optional `slice` |
| `src/preset/types.ts` | `Preset` gains optional `slice` |
| `src/preset/storage.ts` | Validates it, drops it when malformed |
| `src/compose/compose.ts` | The precedence chain above |
| `src/editor/SlicePanel.tsx` | **New.** Picker plus generated form |
| `src/editor/FitReport.tsx` | **New.** Resolved rung per wedge |
| `src/editor/SegmentList.tsx` | Layout override joins the per-row disclosure |

## Tests

- `fit` — each orientation's budget; a narrow arc where only radial survives; a
  fat arc where curved holds a name the others cannot.
- `ladder` — takes the first fitting rung; falls to initials before `none`;
  `none` is reached only when every rung fails.
- `measure` — a repeat measurement costs no second canvas call; with no canvas,
  the estimate answers and nothing throws.
- `layouts` — each `draw` is asserted on returned elements, with a deterministic
  measurer. No DOM.
- `compose` — a segment override beats an item override beats the preset default.
- `Wheel` — renders each element kind; a `raw` element mounts its node.
- `useSpin` — a level group gets an inverse animation whose keyframes negate the
  rotor's; the ladder resolves against the landed frame while a spin is held.

Fixtures use Fighting Baseball names. They are varied enough in length and glyph
width to catch the estimate errors that motivated real measurement.

## Not in scope

- **Avatars on wedges.** The `image` element exists in the vocabulary, but the
  `portrait` layout that uses it, and the photo fetching behind it, belong to
  `2026-08-14-participant-avatars-design.md`.
- **Custom ladders.** Named ladders only. A reorderable rung editor waits for
  someone to want a ladder that isn't shipped.
- **Wrapping to multiple lines.** `fit` takes a line count so the door stays
  open; no layout passes anything but 1.
- **State-aware layouts.** A layout that draws differently once its wedge has
  won would put spin state in `SliceContext` and re-render every wedge on every
  landing. Worth doing with the post-landing lifecycle, not before.
