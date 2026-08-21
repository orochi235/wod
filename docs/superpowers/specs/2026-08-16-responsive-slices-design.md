# Responsive slices

Whether a wedge should carry a different layout at a different width, and if so
where that decision belongs.

Audience: anyone about to build it. It answers one question — does this extend
`ladder.ts` or sit beside it — and flags the two things that will break if it is
built in the obvious place.

## What is already there

Two fallback mechanisms, at different layers, already coexisting.

**`ladder.ts`** is a fallback chain for one text run, used by exactly one layout
(`auto`). A rung is an orientation paired with a content transform — `curved` +
`full`, then `radial` + `firstName`, then `radial` + `initials`. `walkLadder`
takes the first rung that fits, where fitting means `fit()` returned a size at or
above the floor rather than null. Four named ladders; the layout picks one.

It only covers the three orientations that route through `fit`. A glyph run —
`stacked`, `taperedRadial`, `archedRim` — never touches it.

**`CONCESSIONS` in `glyphRun.ts`** is the glyph runs' own version: a run gives up
its tracking, then its fan, to stay inside its band before the size floor starts
pushing letters out.

## They do not compete

The ladder and a breakpoint answer different questions, and neither can answer
the other's.

A breakpoint asks **how much room is there**. That is geometry — known before
anything is measured, and the same for every wedge of that width.

A ladder asks **whether this particular text fits that room**. That depends on
the label, and is knowable only by measuring. Two wedges of identical width, one
labelled `Ana` and one `Bartholomew Cubbins`, want the same layout and different
rungs.

So a breakpoint selects, and whatever it selects still ladders and still
concedes inside that selection. Three mechanisms, one per layer, no overlap.

## Why not extend the ladder anyway

A rung varies orientation and content transform on a single run. It cannot swap
`composed`'s two parts for one initial, which is the change a wedge at a
forty-fifth of a turn actually needs.

Making rungs into whole `SliceInstance`s would work, and would be breakpoints
with extra steps: every rung would re-measure to discover what the width already
told us. Keep the ladder as it is.

## Where it goes

`resolveInstance` (`registry.ts`) is the one place layout resolution happens —
segment override beats wheel default beats built-in. It gains the wedge's width
and one more precedence step.

```ts
/** Turns. The narrowest wedge this instance still suits. */
type Breakpoint = { from: number; slice: SliceInstance }
```

Ordered widest-first and resolved by first match, so a list with no match falls
through to what a wedge gets today.

## Two things that will break

**Font preloading resolves without a width.** `Wheel.tsx` builds its face list
from `facesUsed(segments.map((s) => resolveInstance(s, slice)), theme.font)`.
Once resolution depends on width, that call has to gather the faces of *every*
breakpoint rather than the resolved one — otherwise a breakpoint's face is
requested only once a wedge reaches that width, and the run measures against the
fallback and caches it.

**A morph changes arcs every frame.** A wedge whose width is animating would
cross a breakpoint mid-spin and re-lay-out under the pointer. `Wheel` already
keeps `lastLayoutArcs` so a departing wedge is not re-fitted against its closing
arc; breakpoint resolution has to read that same layout arc, never the presence
arc.

## Why it is worth building

The studio already shows the failure. The name plate reads at a twelfth of a
turn and is unreadable at a forty-fifth, in the same row, at the same scale.
That row is also the authoring surface this needs — eight widths already on
screen, each of which could name the breakpoint it resolved to.
