# Band editor

Authoring breakpoints as bands on a width axis instead of as a list of floors
typed in degrees.

Audience: anyone about to build it. It answers one question — what is on screen
and what backs it — and names the four things that will bite. It assumes
`2026-08-16-responsive-slices-design.md`, which is where `Breakpoint` and
`sliceAt` come from.

## What is there now

`BreakpointPanel` lists one subpanel per breakpoint, each with a degrees number
field and a full layout form. Three problems, all the same problem.

A floor is authored blind: nothing shows what span it claims, so the only way to
learn that a breakpoint at 12° covers everything up to the next one at 20° is to
read the list and do the arithmetic. The panel sorts widest-first and the list
gives no sense of an axis, so a wheel's worth of breakpoints reads as unordered
rows. And every breakpoint nests a layout form, so the column grows with the
list — it went from 22rem to 26rem for the first one.

## A band is derived, never stored

`Breakpoint { from, slice }` and `sliceAt` do not change. Sort the floors
ascending and band *i* spans `from[i]` up to `from[i + 1]`, the last running to
the axis ceiling. Bands come out of floors, so a gap or an overlap is not
representable — there is nothing to keep consistent.

The span *below* the lowest floor is drawn too, muted, labelled with the wheel's
own layout. That region is `sliceAt` returning undefined, and a track that
skipped it would claim coverage the resolver does not have. It closes to nothing
when the lowest floor sits at the axis minimum.

## Degrees underneath, ratios on the labels

Stored values stay turns and the control's own math is degrees. Two things are
not:

**Spacing is logarithmic.** 2°–10° is where the layout decisions happen and it is
the left fifth of a linear track. Log spacing gives 2°–4° the same room as
20°–40°. Only the pixel↔value mapping is log.

**Labels are ratios.** `1/45`, not `8°` — the share of the wheel is what says
what a wedge has to hold. `turnFraction` already prints them, and moves
from `studio/wedge.ts` to `slice/turns.ts` where the editor reaches it too.

Stops snap to 1°, which is what keeps a ratio legible: 8° is `1/45` and 8.5° is
`17/720`. A preset carrying a finer floor keeps it until someone drags that stop.

The axis runs 2°–120°. `WIDE_ARC_STEPS` already goes to 120° and a three-wedge
wheel is exactly that.

## The control

`src/editor/BandTrack.tsx`, on the multi-thumb `Slider` from
`@weasel-js/labkit/weasel-ui`. N floors, N thumbs, `constraint: 'ordered'`, and
`Thumb.bounds` holding a one-step minimum either side. Ordered matters for more
than tidiness: a stop dragged past its neighbour would swap which layout owns
which side of the boundary, and the panel's current sort-on-write would then
renumber the list under a live drag. `renderTrack` paints the bands and sets
each one's layout name in it.

The band arithmetic is pure and lives apart from the component, in
`src/editor/bands.ts`: `floorsOf`, `bandsOf`, `splitBand`, `removeBand`, and the
log scale both ways. That file carries the unit tests. `BandTrack`'s own
test covers selection and one drag round-trip, nothing more.

## Split and merge

There is no "add breakpoint" button. **Split band** cuts the selected band in
two and the upper half inherits the split band's slice with its params copied,
so a split resolves every width exactly as it did a moment before. **Remove**
merges a band down into the neighbour below, as does dragging its stop off the
track.

Both are named for what they do to the axis. "Add a breakpoint at 12°" leaves
open what 12° resolved to before and what it resolves to after; "split this band"
does not.

A click on the track selects — splitting is a button rather than a click on the
band, because one click cannot both choose a band and cut it.

## The panel

`BreakpointPanel` keeps the track at the top, holds the selected band, and
renders one layout form below — the lit band's. The stacked subpanels go away,
and the column stops growing with the list.

The band no breakpoint claims is selectable and starts selected, which is what
makes an empty list authorable: splitting it is how the first breakpoint gets
made, and it inherits the wheel's own slice. Its form offers only the split —
the layout it names is the wheel's, and the wheel's layout is edited in the
panel above.

## Four things that will bite

**Selection is an index into a list that sorts itself.** `write` sorts
widest-first on every write while the track reads ascending. Selection has to
survive a drag, which ordered thumbs make safe, and a split, which does not —
after a split, select the new band explicitly rather than trusting the index to
still mean what it meant.

**A zero-width band is representable in the data.** Two equal floors are legal
JSON and the resolver picks one arbitrarily. `Thumb.bounds` stops a drag from
authoring one; a hand-edited preset can still arrive carrying one, and the track
has to draw it as nothing rather than divide by it.

**The fall-through region is not an entry.** It has no `Breakpoint` behind it,
so `removeBand` and the layout form both have to refuse it — its `source` is
null, not an index.

**wod resolves labkit through a local link.** labkit shipped none of
weasel-ui's CSS modules, so the passthrough `Slider` arrived with class names
matching no rule and a track of no height; `BandTrack.css` carried a shim that
styled it by role and data attribute instead. That is fixed upstream (weasel
`08585a05`, unreleased), and the shim is gone. wod reaches the fix by `npm link
@weasel-js/labkit` against the local weasel checkout — `package.json` still
declares `^0.1.0`, so **an `npm install` re-resolves to the published 0.1.0 and
collapses the control.** Relink until a release carries the fix and the
dependency is bumped.
