# Wheel themes

What a wheel is made of, how a look is stored and applied to it, and how the
flapper knows when a peg goes by.

Audience: anyone working in `src/wheel` or `src/preset`, or adding a look. The
first look this serves is a Wheel of Fortune one — a gold rim, chrome pegs,
lit panels, and a sprung flapper that ticks over the pegs as the wheel turns.

Builds on `2026-08-14-wedge-presence-design.md`, which is where a wedge's
animated values come from: a per-frame *presence* written onto each wedge's
group as CSS custom properties.

## Structure is rigid, materials are loose

A wheel has a fixed list of parts in a fixed order. The parts and their geometry
are what both the renderer and the flapper depend on — where a peg is, is where
the flapper hits — so they are a contract. Colors, glosses, and type choices are
a bag of tokens that can churn without anything else noticing.

A theme chooses which parts are on and what they are made of. It cannot add a
part. That is what keeps every part's geometry derivable rather than negotiated.

## The parts

Rendered in this order, outermost first:

| Part | Geometry comes from | Notes |
| --- | --- | --- |
| `stage` | the wheel's own bounds | The ground its shadow falls on. Not a set. |
| `shadow` | the face radius | One cast shadow under the whole wheel. |
| `rim` | the face radius | The ring outside the face. Carries the specular highlight. |
| `face` | the face radius | What the wedges are drawn on. |
| `wedge` | one live arc | A group carrying the presence custom properties. |
| `divider` | one arc boundary | Between neighbors, drawn inside the wedge. |
| `panel` | one live arc, inset | The lit slab a label sits on. |
| `label` | the arc midpoint | Existing `fitLabel` behavior, unchanged. |
| `inner-shadow` | the face radius | The rim casting inward onto the face. |
| `sheen` | the face radius | One key light across the whole face. |
| `peg` | the peg mode | Stands on the rim. What the flapper strikes. |
| `hub` | fixed | The center cap. |
| `flapper` | the pointer angle | Hinged above the rim. See below. |
| `pointer` | the pointer angle | Which wedge won. Existing behavior. |

Dividers and panels are derived from the live arcs — one per boundary, one per
arc — and are drawn inside the wedge group, so they inherit its presence and fly
in and shrink with it.

Pegs do not. They belong to the rim, which is machinery rather than roster, so a
wedge flying in from off-screen does not drag a peg across the screen with it.
Where they sit is the peg mode's business.

**Nothing inside a wedge may carry an SVG filter.** The wedge group's transform,
opacity, and clip are rewritten every frame, and a filtered subtree re-rasterizes
on each of them. Depth inside a wedge comes from gradients and strokes; filters
belong to the parts that hold still — the rim's highlight, a peg's shadow, the
wheel's cast shadow.

## Materials

A theme's materials are CSS custom properties applied to the wheel root, named
`--wheel-*` for whole-wheel values and `--wedge-*` for per-wedge ones. Which
property drives which paint stays in `Wheel.css`, as it already does for
presences: only values are set from JavaScript, never rules.

**This spec does not fix the token list.** The first look establishes one; a
second look is what will show which names were about a look and which were about
a wheel. Reads are lenient — an unknown token is kept and passed through, a
malformed value is dropped in favor of the default in the stylesheet.

Gradients and filters cannot be expressed as a custom property, so the named
paints a look needs live in one `defs` block in the renderer, and a token selects
among them: `--wheel-rim-fill: url(#wheel-gold)`. Rules stay in the stylesheet,
paints stay in `defs`, and a theme still only supplies values.

## The theme record

```ts
type WheelPart = 'stage' | 'shadow' | 'rim' | 'face' | 'divider' | 'panel'
  | 'inner-shadow' | 'sheen' | 'peg' | 'hub' | 'flapper'

type FlapperMode = 'silent' | 'click' | 'catch'

/** Where the pegs go: on the wedge boundaries, or evenly spaced regardless of them. */
type PegMode = { kind: 'bounds' } | { kind: 'fixed'; count: number }

/** Wheel units, against a face radius of 200. The renderer does arithmetic on these. */
type Metrics = {
  rimWidth: number
  pegRadius: number
  hubRadius: number
  /** The panel's inner and outer edge, as fractions of the face radius. */
  panel: [number, number]
}

type Theme = {
  id: string
  name: string
  /** Absent means the part's own default. Parts a look does not name stay as they are. */
  parts: Partial<Record<WheelPart, boolean>>
  metrics: Metrics
  tokens: Record<string, string>
  pegs: PegMode
  flapper: FlapperMode
}
```

Metrics are typed numbers rather than tokens because the renderer computes with
them — where a peg sits is arithmetic, and a CSS custom property is a string.
Anything the renderer only hands to the stylesheet is a token.

`wedge`, `label`, and `pointer` are not switchable: a wheel without them is not a
wheel.

## Where the pegs go

`bounds` puts one peg on every wedge boundary, so the pegs are the roster: they
move as the arcs reflow, and the tick rate at a given speed tells you how many
people are on the wheel. `fixed` spaces a set count evenly and ignores the roster
entirely, which is what the machine being imitated actually does — the tick stays
even whether two people are on the wheel or twenty.

One function turns the mode and the live arcs into a list of peg angles. Nothing
downstream — the renderer, the flapper, a click — knows which mode produced them.

The modes differ in one way that matters beyond looks. In `bounds` a peg sits
exactly on the line between two wedges, so a `catch` that parks the wheel against
one leaves the pointer on that line, where which wedge won is a rounding
question. A planned catch therefore resolves to one side, never onto the
boundary. `fixed` has no such case: its pegs land wherever they land.

## Storage

`Preset` goes to version 5 with an optional `theme`. Absent means the flat look
that ships today, so every stored preset renders exactly as it does now.
Validation follows `storage.ts` as it stands — lenient reads, prototype-safe
lookups on anything that indexes by a stored string.

## The flapper

**Where its angle comes from.** Once per frame, read the rotor's composited
transform and recover the wheel's angle from it. This is a third clock beside the
morph clock `useSpin` already runs during a spin.

Reading the composited transform rather than computing the angle from the
animation's timing is deliberate: the eye sees what the compositor drew, and this
project's rule is that what is drawn and what is announced agree. It also holds
for any motion — including one that speeds up and slows down repeatedly — without
the flapper knowing how that motion was authored.

**Speed** is the difference between successive angles. Every consumer that wants
to know how fast the wheel is going (the flapper's stiffness, a click's pitch,
the sheen's sweep) reads that, rather than a stage name. A named stage would be a
lossy summary of the thing they actually wanted.

**Deflection** is a pure function of the wheel's angle, the peg angles, and the
flapper's own geometry: which peg is under the hinge, how far past it the wheel
has turned, and therefore how far the arm is pushed. Pure, so it is testable
without a browser — and it takes peg angles rather than arcs, so the peg mode is
the only thing that ever knows the difference between the two.

**Modes:**

- `silent` — the motion only.
- `click` — one click per peg crossing, its gain and pitch scaled by speed.
  Browsers refuse audio before a user gesture, so sound stays off until one
  arrives, and a mute control is part of the look's controls rather than a
  setting buried in a preset.
- `catch` — the flapper can hold a dying wheel back onto the previous wedge.
  **Planned, not emergent:** the deflection is folded into the resting angle
  before the animation starts, so the pointer's answer is decided when it always
  was. A catch resolved after the fact would contradict the announced winner and
  break forced targets, which is the one thing the selection guard exists to
  prevent.

## What this does not change

Arc geometry, the selection guard, and the transition contract. A wedge is still
one group carrying presence custom properties, so entrances and departures
animate exactly as they do now — a shrinking wedge simply takes a divider and a
panel with it.

## Testing

- **Structure:** the parts render in order, one divider per boundary, and a part
  a theme turns off is absent.
- **Peg angles:** a pure function of mode and arcs — one per boundary under
  `bounds`, evenly spaced and roster-independent under `fixed`, and nothing at a
  count of zero.
- **Tokens:** jsdom applies no stylesheet, so a renamed property would leave the
  suite green and the wheel unpainted. `Wheel.css` is read as a `?raw` import and
  asserted to consume every token a theme emits — the guard the wedge-presence
  work added for the same hazard.
- **Flapper:** deflection and speed are pure functions, unit tested against
  hand-driven angles.
- **Look:** not testable in jsdom. Verified in a browser.

## Open

- **The token list**, deliberately. It settles when a second look exists.
- **Where a participant's photo goes.** The panel's inner radius is what would
  reserve room for one; `2026-08-14-participant-avatars-design.md` owns the
  question of getting the photo at all.
- **Cost during a spin.** Filters are confined to parts that hold still, but the
  ceiling has not been measured against the presence loop with a large roster.
