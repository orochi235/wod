# Transitions

The wheel has two ways to move: the rotor turns, and morphs animate wedge
properties during a spin. Nothing animates outside a spin, and nothing moves a
wedge independently of its arc — a roster change just re-renders with a new
layout, instantly. This spec adds a presentation layer so wedges can arrive,
leave, and be spun with visual character.

Audience: anyone working on the wheel's rendering, or adding a transition.

## The boundary

A transition may set opacity, scale, radial offset, rotation, and aperture. It
may never touch weight or arc layout.

Geometry decides outcomes here. A wedge at zero weight cannot win, a wedge that
swallows the circle must win, and `planSpin` aims at the distribution the pointer
will meet. A transition that could change geometry could change the winner, or
leave the pointer and the announced name disagreeing. Morphs own geometry and the
whole trick system is built on them; transitions own everything else and can
never alter who wins.

## Moments

| Moment | Fires when |
| --- | --- |
| `enter` | A wedge id joins the composed roster |
| `exit` | A wedge id leaves it |
| `spin` | Wraps the rotation, alongside it |
| `reveal` | The announce overlay appears |

Membership only: a morph relabeling a wedge or a trick recoloring one is not an
arrival. First paint is `enter` for every wedge at once, not a fifth moment —
the same animation with `count` set to the whole roster.

## What a transition declares

```ts
export type PresentationKeyframe = {
  /** Position within the transition's own duration, 0..1. */
  at: number
  opacity?: number
  scale?: number
  /** Radial, in wheel radii: 1 is one radius out from the hub. */
  offset?: number
  /** Degrees, about the wedge's arc midpoint or about the hub. */
  rotate?: number
  /** 0..1 of the arc, closing from both edges. */
  aperture?: number
}

export type TransitionContext = {
  index: number
  count: number
  /** The wedge's arc midpoint in degrees, so a wedge can fly in from its own side. */
  angle: number
  durationMs: number
}

export type TransitionId = 'fade' | 'fly' | 'shutter' | 'zoom'

/** Same shape as TrickParams: whatever a transition's own fields produce. */
export type TransitionParams = Record<string, unknown>

export type Transition = {
  id: TransitionId
  /** Structural. "Wedges fly in from outside", never "the big entrance". */
  name: string
  description: string
  scope: 'wedge' | 'wheel'
  defaults: TransitionParams
  fields: Field[]
  /** Pure. The only thing that affects what actually runs. */
  frames(params: TransitionParams, ctx: TransitionContext): {
    keyframes: PresentationKeyframe[]
    delayMs: number
  }
}
```

`frames` computes its own stagger from `index` and `count` rather than taking a
separate stagger rule, so a transition that wants a non-linear one — dealing the
last wedge slower than the first — needs nothing added.

There is no `validate`. A transition names no wedges, so unlike a recipe it has
nothing that can dangle.

`Field` is the declarative form spec the editor already renders for recipes,
moved from `tricks/types.ts` to `src/form/fields.ts` and re-exported there under
its old name. Recipes and transitions both need it and neither should import the
other.

## The starter set

| | Scope | Params | Reads as |
| --- | --- | --- | --- |
| `fade` | wedge | `durationMs`, `staggerMs` | The baseline, and what everything degrades to |
| `fly` | wedge | `distance` (−1…3 radii), `from` (own side / top / hub / random), `tumbleDeg` (0…720), `staggerMs`, `durationMs` | Wedges hurtle in from outside and slot into place |
| `shutter` | wheel | `direction` (open / close / close-then-open), `holdMs`, `durationMs` | A camera aperture, which at `spin` slams shut mid-turn and reopens on a different wheel |
| `zoom` | wheel | `fromScale` (0…2), `tumbleDeg`, `durationMs` | Punch in on spin start, settle out on landing |

`fly` covers dealing from the hub at `distance: -0.1` with a heavy stagger. A
separate deal transition would share almost every frame with it.

`TRANSITIONS` and `getTransition` mirror the recipe registry, including the
`Object.hasOwn` guard: ids come out of localStorage, and a stored id of
`constructor` or `__proto__` resolves through the prototype chain to something
that is not a transition.

## Reduced motion

Under `prefers-reduced-motion`, every transition becomes `fade` at
`REDUCED_MOTION_MS` with no stagger. One rule rather than a reduced variant per
transition, and it matches how `useSpin` already shortens the rotation. A
twenty-person roster staggering in would otherwise outlast the meeting.

## Where it runs

Per-wedge transitions animate the `<g>` that `Wheel` already keys by segment id.
Wheel-scope transitions animate a new wrapper `<g>` around the rotor, never the
rotor itself, so a shutter's transform cannot fight the rotation WAAPI is
driving.

`reveal` takes a wheel-scope transition applied to the Reveal panel, where
`offset` is relative to the panel's own size and `aperture` clips it
horizontally. No third scope, and no property that silently does nothing.

Two rules the implementation has to honor:

- **A departing wedge is drawn at its last arc, above the layout and excluded
  from it.** It is already gone from `segments`, so the wheel keeps a copy until
  its exit finishes. If it participated in layout instead, every other wedge's
  arc would shift while it animated — a geometry change from a presentation
  feature, which is the one thing this layer must not do.
- **A spin cancels in-flight enter and exit animations** and snaps those wedges
  to their resting presentation. Otherwise the pointer can name a wedge that is
  still half-transparent and mid-flight, in the one moment the winner must look
  certain.

## In the preset

```ts
transitions?: {
  enter?: TransitionInstance
  exit?: TransitionInstance
  spin?: TransitionInstance
  reveal?: TransitionInstance
}

type TransitionInstance = { id: TransitionId; params: TransitionParams }
```

Optional, so the version stays at 3: an absent field means today's behavior
exactly. `parsePreset` drops an instance naming an unknown transition rather than
rejecting the preset, matching how it treats an unknown recipe.

Transitions stay visible in a locked editor. They are cosmetic, they show on the
shared screen anyway, and hiding them would tell a guest there is something to
hide.

## Tests

- `frames` per transition: keyframe count, endpoints, and that `delayMs` scales
  with `index`. Pure, so these look exactly like the recipe tests.
- A locked editor still offers the transitions panel.
- Reduced motion collapses every transition to a fade with no stagger.
- A spin during an enter leaves no wedge mid-flight.
- An exiting wedge does not move any other wedge's arc. This is the one that
  protects the boundary; the rest check cosmetics.
