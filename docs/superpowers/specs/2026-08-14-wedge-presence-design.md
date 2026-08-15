# Wedge presence

A wedge joining or leaving the roster is a jump cut: the new one pops in, the
departing one vanishes, and every survivor's arc snaps to a new size. This spec
makes arrival and departure animate, makes the survivors' reflow part of the same
mechanism, and makes any two of those animations interrupt each other cleanly —
a wedge that leaves mid-arrival departs from wherever it got to, and one that
re-joins mid-departure turns around.

Audience: anyone working on the wheel's rendering, or adding a transition. Read
`2026-08-14-transitions-design.md` first for the transition vocabulary and the
boundary rule; this spec amends two of its decisions, listed at the end.

## Presence

Every wedge id has a presence: `entering`, `present`, or `exiting`, decided by
diffing the composed roster against the previous one. A presence holds the
values a transition animates.

```ts
type Presence = {
  /** 0…1 of the wedge's authored weight that it currently occupies. */
  hold: number
  opacity: number
  scale: number
  /** Radial, in wheel radii. */
  offset: number
  /** Degrees clockwise from 12 o'clock. */
  offsetAngle: number
  rotate: number
  aperture: number
}
```

`hold` is new and is the only one that touches geometry. It is sampled at
`enter` and `exit` only, on wedge-scope transitions only, and selection never
sees it — the guard section below says how that is enforced rather than merely
intended.

A wedge is drawn while any presence exists for its id, which outlives its
membership in the roster. It stops being drawn when its exit finishes.

A presence at `hold: 0` occupies no arc, and a zero-width arc has no path — so
such a wedge is drawn at its **last non-zero arc**, frozen, outside the layout.
That is the ghost the transitions spec describes, arrived at as the endpoint of
`hold` rather than as a separate rule: a `shrink` reaches zero only as it
finishes and is never a ghost, while a departure that releases its arc at once
is a ghost for its whole duration.

## One clock

A single `requestAnimationFrame` loop samples every presence and produces two
things the wheel renders:

- **the drawn roster** — each segment at `weight * hold`, exiting wedges
  included
- **a presentation map** — id to a CSS transform and a `clip-path`

Arcs come from the drawn roster, so survivors expanding into a shrinking
neighbor's space is not a separate feature. It is what `arcs()` already does,
given weights that move.

Wedges do not use the Web Animations API. The rotor's rotation still does: it is
one transform on one element for the length of a spin, which is the case a
compositor-driven animation is for. A wedge's presentation has to be readable
mid-flight by the next thing that interrupts it, and WAAPI cannot be asked where
an animation currently is without committing it to inline style. Sampling in
JavaScript makes the current value the ordinary thing to read, and it is the
reason chaining below is one rule instead of a mechanism.

## Chaining

Retargeting is a single rule:

> When a transition starts on a wedge that is already animating, the current
> sample becomes the implicit base for the incoming keyframes, and a declared
> `at: 0` frame is discarded.

`morph.ts` already carries most of this. `bracket()` finds the keyframes
surrounding a progress value, and `withImplicitBase()` synthesizes an `at: 0`
frame from a property's current value when the first declared frame arrives
later. The change is that during an interrupt the implicit base outranks a
declared zero frame instead of yielding to it.

This diverges from Web Animations, where a new animation snaps to its own 0%.
The divergence is the feature: a `fly` entrance interrupted by a `fly` exit
continues from the position and opacity it reached, and a wedge that re-joins
while exiting retargets toward `present` from its current sample rather than
starting a second, duplicate arrival at the same id.

A transition's stagger delay holds progress at 0, which is the same substitution
one step earlier: an interrupted wedge has no frame at 0, so it waits at the
sample it was interrupted on, while a fresh one waits at its declared start. A
staggered exit therefore freezes an interrupted wedge where it stands until its
turn comes, instead of snapping it back to a resting pose it had already left.

## Declaring a transition

`PresentationKeyframe` gains `hold`. `TransitionContext` gains `moment`, so a
transition writes its own departure rather than having its arrival reversed —
leaving the way you came is one choice among several, not the mechanism. A
transition also declares which moments it serves, so the editor can offer only
the ones that apply.

```ts
type PresentationKeyframe = {
  at: number
  hold?: number
  opacity?: number
  scale?: number
  offset?: number
  offsetAngle?: number
  rotate?: number
  aperture?: number
}

type TransitionContext = {
  index: number
  count: number
  angle: number
  durationMs: number
  moment: Moment
}

type Transition = {
  // …as before, plus:
  moments: Moment[]
}
```

## Defaults

A transition that declares no `hold` gets the behavior that already ships: an
arriving wedge occupies its full arc from the first frame, and a departing one
releases its arc at once and animates out over survivors that have already
reflowed.

So `shrink` — a wedge collapsing into nothing while its neighbors grow into the
space — is an ordinary transition that declares `hold` decaying to zero, and
easing the reflow is a consequence of that declaration rather than a setting.
Nothing is defaulted into a behavior an operator would have to find and turn
off, and `fly`'s existing entrance is unchanged by this spec.

## The selection guard

The drawn roster and the true roster are allowed to disagree while something is
in flight. A wedge at `hold: 0.2` cannot be won at one fifth of its weight, and
a departing wedge still on screen cannot be won at all. Three rules:

- Selection samples the roster the wheel composed, never the drawn one. `App`
  already does this — `onSpin` reads `base`, and `planSpin` is reached only
  through it.
- Starting a spin settles every presence to its target in the same tick:
  exiting wedges are dropped, entering and present wedges go to full presence
  and a resting pose. This is the transitions spec's cancel rule, and settling
  is retargeting with a zero duration rather than new machinery.
- Under `prefers-reduced-motion`, every transition is `fade` at
  `REDUCED_MOTION_MS` with no stagger and `hold` released immediately, matching
  how `useSpin` already shortens a rotation.

## Shape

| | |
| --- | --- |
| `transition/sample.ts` | the keyframe kernel, generalized off `morph.ts`'s `bracket` and implicit base |
| `transition/usePresence.ts` | presences, the rAF clock, and settling — replaces `useEnter.ts` |
| `wheel/Wheel.tsx` | draws the drawn roster and applies the presentation map |
| `transition/transitions/*` | `hold` in keyframes, `moment` in context, and `shrink` |

## What this amends

Two decisions in `2026-08-14-transitions-design.md` change.

A departing wedge is no longer *required* to be excluded from the layout. That
rule protected geometry from a presentation feature, and it still holds for
every property except `hold`, which changes geometry on purpose and is fenced by
the guard above. Exclusion becomes the `hold: 0` case rather than the only case,
so a transition that declares no `hold` behaves exactly as that spec described.

Wedge presentation no longer runs on the Web Animations API. The reason is in
the clock section: WAAPI animations cannot be retargeted from their current
value without committing them to inline style, and they are invisible to the
test suite, which stubs `Element.prototype.animate` outright because jsdom
implements none of it.

## What this does not cover

A transition here compiles to one transform and one `clip-path` on one element.
An effect that turns one wedge into many — shards, particles, trails — needs a
transition that brings its own rendering, which is a second kind with its own
plan. The sampled model is renderer-agnostic by construction: nothing in a
`Presence` knows whether an SVG group or some other scene graph consumes it.

`spin` and `reveal`, and the two wheel-scope transitions, remain where the
transitions spec left them.

## Tests

The kernel and every transition's `frames` are pure, so they test like the
recipe tests already do: keyframe endpoints, `hold` where declared, and
`delayMs` scaling with `index`.

The rules worth testing are the ones that would otherwise be found by hitting
them:

- An interrupted transition starts from the current sample, not from a declared
  zero frame.
- A wedge that re-joins while exiting ends up present, once, at its own id.
- A wedge whose `hold` reaches zero is still drawn, at its last non-zero arc,
  and moves no other wedge's arc.
- Starting a spin leaves no wedge mid-flight and no departed wedge drawn.
- The roster `planSpin` receives is never the drawn roster. This is the one that
  protects the boundary; the rest check cosmetics.
