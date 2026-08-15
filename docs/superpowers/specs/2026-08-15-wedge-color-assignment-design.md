# Wedge color assignment

A wedge with no authored color takes one from the palette. Today two different
pieces of code decide which one, by two different rules, and they disagree the
moment the roster churns. This says where that decision should live instead, and
adds a hook for a consumer to make it themselves.

For whoever implements the change. Assumes the slice/presence merge has landed.

## The problem

`usePresence.withColor` assigns a swatch **by id** and keeps it: a wedge holds
its color for as long as it is drawn, so a neighbor leaving never recolors the
rest of the wheel.

`effectiveColor` computes a swatch **by roster position** — `segments[i].color ??
paletteColor(i)`. After a single departure it reports a color for every uncolored
wedge that the wheel is not painting.

`recolor`, `swap` and `takeover` each call `effectiveColor` to build the `at: 0`
keyframe a morph needs. On a churned roster the animation starts from a color the
wedge does not have, and it jumps on the first frame of the spin. A live feed
churns constantly, so this is the normal case, not the edge one.

Making `effectiveColor` sticky as well would leave two implementations of one
rule and no structural reason for them to stay equal.

## Where assignment lives

Inside `resolveTricks`, between its two existing passes.

That is the only point where the roster is complete and no color has been read
yet: pass 1 has appended every `provides()` wedge, and pass 2 is the first
consumer. A wedge a trick invents is colored on the same terms as one a feed
published.

```
composeBase  →  resolveTricks( provide → ASSIGN → resolve )  →  useSpin  →  Wheel
                                          │                                   │
                                          └── one assignment, read by both ───┘
```

`ResolvedTricks` gains a `colors` field. App holds the returned map in a ref and
passes it back on the next render, so `resolveTricks` stays a pure function of
its arguments.

The memo around it is load-bearing. It recomputes on the composed roster, and
reads the color and retained refs at that moment; the refs are deliberately not
dependencies. Memoizing on anything narrower re-runs assignment against a roster
it has already colored, and anything wider re-runs it on every frame of a spin.

## The module

`src/wheel/colors.ts`, pure, no React.

```ts
export type ColorContext = {
  index: number
  count: number
  taken: ReadonlySet<string>
  origin: Origin | undefined
  palette: readonly string[]
}

export type ChooseColor = (segment: Segment, ctx: ColorContext) => string | undefined

export function assignColors(
  segments: Segment[],
  previous: ReadonlyMap<string, string>,
  retained: ReadonlySet<string>,
  choose?: ChooseColor,
): { segments: Segment[]; colors: Map<string, string> }
```

`origin` comes from the map `resolveTricks` already holds. Without it a callback
that wants to color one feed's wedges has to parse `feed:item` ids by hand.

`resolveTricks` takes them as one optional sixth parameter, defaulting to an
empty assignment. Nineteen call sites exist and most are tests that do not care
about color; converting the five positional parameters to an object would churn
all of them to no purpose.

Four production callers: `App.tsx` and `Editor.tsx` directly, `evaluateWheel` in
`spin/resolve.ts` (which every scripted-spin path and both `resolveLate` closures
route through), and `conflicts.ts`, which is editor-facing and passes nothing.

## Precedence

Authored `segment.color` → `choose()` → sticky palette pick.

The callback overrides the palette assignment, not authored data. Feed defaults
and per-item editor overrides both arrive as `segment.color`, and a callback that
could veto them would break the editor in a way that is harder to see than the
bug being fixed.

A chosen color is **not** stored in the sticky map. It is recomputed every pass,
so a consumer whose mapping changes — a participant switches team — sees the
change rather than being frozen at first sight. It is added to `taken`, so the
default picker never duplicates it. The sticky map therefore holds only default
assignments, which is what stickiness exists to protect.

`choose` is app-level wiring, not preset data: it is a function and cannot
serialize.

## Keeping an exiting wedge's swatch

A departing wedge holds its color for the length of its exit, so an arrival must
not be handed it. The set of ids still being drawn — roster plus wedges animating
out — is known only to `usePresence.tracks`, which sits below the assigner.

`usePresence` writes those ids to a ref that `Wheel` accepts as a prop, and App
reads it on its next render. Writing a ref during render is the established
pattern in both files, each with its own note on why it is safe under StrictMode;
`assignColors` is pure and returns a fresh map, so a double call agrees with
itself.

The read is never stale where it matters. Assignment runs only when App
re-renders, and `resolveTricks` is memoized on the composed roster — so it runs
exactly when the roster changes. A presence tick re-renders only `Wheel`, whose
`tick` state lives in that subtree, so the rAF loop does not drag App through a
render every frame. Whenever assignment runs, the ref holds what `Wheel` wrote at
its most recent render.

Lag can only delay *releasing* a swatch, never cause an early reuse. The worst
case is an arrival taking the next free swatch instead of a just-freed one.

`retained` is unioned with the live roster inside `assignColors`, so an empty ref
on first mount cannot drop colors for wedges that are plainly present. The prop
is therefore optional: a `<Wheel>` rendered without it still paints, it just
recycles swatches more eagerly.

The prop is public surface. It gets a named type in `wheel/colors.ts` and a
stated contract — *ids this wheel is still drawing, including ones animating
out* — not a bare ref into `usePresence`.

## What this deletes

- **`effectiveColor`.** `palette.ts` keeps `DEFAULT_PALETTE` and `paletteColor`.
- **`withColor`** and its `colors` ref in `usePresence`, which stops being a
  color authority and paints what it is given.
- `swap`'s two-way null guard and `recolor`'s `?? '#888888'`. Recipes read
  `segment.color`, now always defined.

`takeover.writes` guards on `effectiveColor(ctx.segments, id)`, which returns
null only for an id that is not on the wheel. It is an existence check wearing a
color check's clothes, and it becomes one: `ctx.segments.some(...)`.

One behavior changes as a consequence rather than by intent: `taken` is currently
seeded only from the sticky map's values, not from authored colors, so an
authored swatch can collide with a palette pick on the next wedge. A single
assignment makes seeding from authored colors the natural implementation, which
fixes the collision and changes what some existing rosters render.

## The editor

`Editor.tsx` builds its preview from `resolveTricks` output, so it gets concrete
colors with no further wiring. It passes no retained ids, so its preview recycles
swatches eagerly. Only palette colors can differ from the show; every authored
color agrees.

## Testing

The color block in `usePresence.test.tsx` moves to `colors.test.ts` and gets
simpler, because it no longer has to drive a React render to reach the rule.
Three behaviors carry over unchanged: distinct fills across a roster, every drawn
wedge has a fill including mid-animation, and a swatch is not reused while its
wedge is exiting. The second is the guard for this whole change.

Earned by the change, and impossible to write before it:

- Churn the roster, resolve a `recolor`, assert its `at: 0` keyframe equals the
  fill the wheel paints.
- `choose` precedence, all three tiers.
- A chosen color lands in `taken` and is not duplicated by the default picker.
- A provided wedge with no color of its own gets an assignment.

The other ~65 `<Wheel>` render sites never read a fill.

## Out of scope

Preset-carried palette data for a callback to read. Wiring `slice` and
`transitions` into the editor preview, which the merge plan already tracks.
