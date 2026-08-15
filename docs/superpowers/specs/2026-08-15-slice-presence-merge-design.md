# Slice and presence on one wheel

Two features landed in parallel and both rewrote the same render. On `main`, the
slice registry decides what is drawn *inside* a wedge — a layout per segment that
fits a label radially, tangentially or along the arc. On
`feat/wedge-presence-impl`, a per-frame presence sampler replaced the WAAPI
entrance path and decides *which* wedges exist and what arc each one holds while
it arrives or leaves. Merging them conflicts in five files. Four are mechanical.
`Wheel.tsx` is a design question, and this spec answers it.

Audience: whoever resolves the merge.

## The division

`usePresence` owns which wedges are drawn, the arc each holds this frame, and its
color. The slice registry owns what is drawn inside a wedge. Neither knows about
the other, and `Wheel` is the only place they meet.

## Two arcs per wedge

A wedge is drawn at its **presence arc** — what `drawList` returns, which moves
every frame while a transition runs, because `hold` scales the weight the layout
is computed from. It fits its slice layout against its **layout arc**:
`arcs(layoutFrom ?? segments)`, keyed by id.

This is not a new rule. `main` already draws at one arc and resolves layouts
against another, because a morph changes weights every frame and re-fitting
against those pops labels between orientations mid-spin. A transition moves the
same numbers for a different reason, so it gets the same treatment: the label a
wedge had at full width is the label it keeps while its arc closes under it.

A departing wedge is absent from the composed roster and so has no layout arc.
`Wheel` remembers the last layout arc seen per id and reads from that, pruning
the memory to what is currently drawn. The presence arc is the final fallback,
for a wedge that has never been laid out at all.

```tsx
const drawn = usePresence(segments, transitions, held)
const layoutArcs = rememberById(arcs(layoutFrom ?? segments))

drawn.map(({ segment, arc: presenceArc, presence }, index) => {
  const layoutArc = layoutArcs.get(segment.id) ?? presenceArc
  const instance = resolveInstance(segment, slice)
  const elements = getSlice(instance.id)?.draw(instance.params, {
    segment, arc: layoutArc, radius, index, count: drawn.length, measure, fit,
  }) ?? []

  return (
    <g key={segment.id} className="wheel__wedge" data-segment-id={segment.id}
       style={styleOf(presence, { angle: midDeg(presenceArc), radius, pivot: radius * 0.6 })}>
      <path className="wheel__segment" d={arcPath(presenceArc.start, presenceArc.end, radius)}
            fill={segment.color} />
      <SliceElements elements={elements} arc={presenceArc} radius={radius} id={segment.id}
                     levelRef={levelRef?.(segment.id, -midDeg(layoutArc))} />
    </g>
  )
})
```

The sketch leaves out both existing guards — a non-positive width and an empty
path still skip the wedge, as on either side today.

`SliceElements` keeps taking the presence arc: it places what the layout produced,
so the label travels with its wedge even though its size and orientation were
settled elsewhere.

`ctx.index` and `ctx.count` both come from the draw list, so a wedge's index is
always within its count. No registered layout reads either one; the pair being
consistent matters only to the first one that does.

## Three things that follow

**`levelRef` registers the layout angle, not the presence angle.** A level
element is one that stays upright while the rotor turns, and `spin()` reads its
registrations synchronously — before the `held → settle` re-render lands. A wedge
caught mid-departure would otherwise register the angle it happened to be passing
through. The layout angle is already what the settle is about to produce.

That change means nothing until a second one lands with it: `useSpin` memoizes
its ref callback per segment id, so the angle a wedge reports on its first render
is the angle it keeps, however far the roster later moves it. The element is what
has to be registered on mount; the angle has to be read when the spin is planned.
This is a defect on `main` — a level label tilts after any roster change — and
the merge only makes it reachable in more ways.

**`paletteColor(index)` leaves `Wheel`.** `usePresence` assigns colors by id,
which is what ends the recolor-on-departure the wheel has always had. A fallback
in `Wheel` would only hide a missing assignment behind a plausible color.

**`fitLabel` and `src/wheel/label.ts` are deleted**, along with the branch's
"flips labels that would otherwise read upside down" test. `main` already
replaced that rendering with the slice registry, and `main`'s "gives every wedge
the same handedness" covers the same concern through the layouts.

## The other four conflicts

| File | Resolution |
| --- | --- |
| `useSpin.ts` | Return the union: `layoutSegments` and `levelRef` from `main`, `held` from the branch |
| `App.tsx` | Destructure the union; pass all of `layoutFrom`, `slice`, `levelRef`, `transitions`, `held` |
| `Wheel.css` | Keep both rule blocks — `.wheel__level`'s transform box and `.wheel__wedge`'s custom properties |
| `.gitignore` | Keep both lines |

## Where the merge happens

Merge `main` into `feat/wedge-presence-impl`, in the worktree that branch already
has, so the integration gets a test loop of its own. `main` takes the finished
result. Nothing lands on `main` until both suites are green against the merged
component.

## Tests

Most of the value is that both existing suites pass against one render — they
exercise it from opposite sides. Beyond that, one test per rule this spec
invents, each checked by mutation:

- A wedge at `hold` 0.5 fits its layout against its full arc. Swapping the layout
  arc for the presence arc must fail it.
- A departing wedge, gone from the composed roster, keeps its remembered layout
  arc.
- A spin counter-rotates by where a wedge is now, not by where it first mounted.
- `levelRef` registers the layout angle. Registering the presence angle must fail
  it — that failure is invisible until someone spins mid-departure.

The memory's prune gets no test. Nothing can read a stale entry: every id in the
current layout is overwritten before the lookup runs, and the ids that fall
through to the memory instead are exactly the ones still being drawn. It bounds
the map across a session of churn and has no other observable effect.
- A wedge with no authored color still gets a fill.

Then a browser pass on `#/`, which is the only page that animates anything: arm a
curved layout and `shrink`, drop a wedge, and confirm the label holds its
orientation and travels with its wedge.

## What this leaves

**A curved label can overrun its own path.** `SliceElements` builds `curvedText`
as a `<textPath>` along the presence arc, so a label fit for the full arc has
more text than the path can hold once the wedge closes. An overflowing `textPath`
can drop out entirely rather than clip, which would read as the label blinking
off partway through a departure. The wedge is nearly transparent by then; whether
that is acceptable is a judgment for the browser pass, not an assertion.

**The editor preview animates nothing and shows the default layout.** Its
`<Wheel>` takes neither `slice` nor `transitions`, so the operator arms both in
one window and can only see either in the other. This predates the merge on both
sides. Wiring it means deciding what `held` should mean in a window with no spin
of its own.
