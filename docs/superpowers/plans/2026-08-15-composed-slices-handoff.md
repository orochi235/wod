# Composed slices — handoff

**What this is:** the state of `feat/wheel-themes` after the first of the two plans in
`docs/superpowers/specs/2026-08-15-composed-slices-design.md`.

**Who it's for:** whoever picks this branch up next, in a session with none of the
context that built it.

**The question it answers:** what works, what is decided, and what is still open.

## What shipped

A wedge can carry several *parts* — a name, an authored word, a portrait — each owning
its own *band* of the radius, written as `[inner, outer]` fractions. Three new
orientations set a word glyph by glyph: `stacked` (upright, reading outward, stepping down
the radius — the Wheel of Fortune look), `taperedRadial` (the same run quarter-turned) and
`archedRim` (a baseline on an arc inside the rim). The three orientations that predate
this — `radial`, `tangential`, `curved` — are unchanged in output and now reach it through
the same entry point.

A wedge with nothing configured draws the **name plate**: given name on an arc inside the
rim, surname in capitals down the wedge. Two parts rather than one run, because a full
name set either way alone is bad at the size a roster needs — horizontal it is bounded by
the chord, stacked it solves below the floor and overruns its band. `auto`, which was the
built-in default, is now one choice among the layouts.

Labels are set in Bevan, served from `public/fonts` rather than a CDN.

44 commits ahead of `main`, which was merged in at `5ca05f2`. 1145 tests, clean build.
Outline mode, the font registry and the baked specimens are the second plan and are not
started.

## Where it lives

| File | What it owns |
| --- | --- |
| `src/slice/typeset.ts` | One part to `SliceElement[]`. Resolves content, applies `caps`, routes to a run or to `ctx.fit`. |
| `src/slice/glyphRun.ts` | The two glyph solves — `runAlongRadius`, `runAlongArc` — and their constants. |
| `src/slice/parts.ts` | `readParts` / `readPartList`, `DEFAULT_PART`, `MAX_PARTS`. |
| `src/slice/registry.ts` | `DEFAULT_SLICE`, which is the name plate. |
| `src/slice/layouts/composed.ts` | The `composed` layout: a part list, concatenated. |
| `src/slice/layouts/{radial,tangential,curved,auto}.ts` | One-part compositions over `typeset`. |
| `src/editor/PartsField.tsx` | Three fixed slots. |
| `src/wheel/SliceElements.tsx` | Renders `glyphRun`. Decides nothing. |

`typeset.ts` → `glyphRun.ts` is the only edge between those two; both take `MIN_SIZE` and
`DEFAULT_MAX_SIZE` from `layouts/shared.ts`, which depends on neither.

## Open

**The wedge panel is machinery with no user.** The `wof` look turned `panel` off — the
gloss plate over each wedge — so `panelPath`, `.wheel__panel`, `metrics.panel` and their
tests are now reachable only by a look that does not exist. Either a second look wants it
or it goes; nothing in between is worth carrying.

Not a bug: a part banded inside r≈30 is painted over by the `wof` hub. The spec already
says type belongs in the outer half.

## Decided, so don't re-litigate

**A type member lands with the code that consumes it.** `SLICE_LAYOUTS` is a
`Record<SliceLayoutId, …>` and `SliceElements` narrows `SliceElement` by elimination, so
adding an id or a union member alone leaves the build red across a commit boundary. This
cost a revert; the plan's task order encodes the fix.

**A run gives up its tracking, then its fan, before the floor pushes it out of its band.**
`CONCESSIONS` in `glyphRun.ts`, and deliberately not called a ladder: `slice/ladder.ts`
already owns that word for the fit path's climb through orientations and content
transforms. Overflow is what is left when no concession is enough, because a word never
truncates.

**`shrink: 'condense'` and `stretch` are one mechanism.** Both move the axis that crosses
the wedge, in opposite directions, so `acrossFactor` bounds one chord-driven factor above
by what `stretch` asks for and below by what `shrink` allows. A part asking for both gets
whichever the chord demands.

**`lastName` resolves to nothing for a one-word label.** The name plate pairs it with
`firstName` on the same wedge, and returning the whole word would set it twice.

**`curved` with `frame: 'level'` changed on purpose.** It used to emit `curvedText`, which
`SliceElements` handles *above* its level-frame branch — so the operator's "Level — stays
horizontal" choice silently did nothing. It now emits horizontal text, matching what
`auto` always did. Visible change for a stored preset using that combination. Pinned by a
test in `layouts.test.ts`.

**Emptying an editor slot compacts the ones after it.** The stored list is dense; a part's
place on the wedge is its band, not its slot index, so a hole has nothing to mean and the
wheel renders identically. Pinned by a test.

**`runAlongRadius` and `runAlongArc` keep their small duplication.** The solves differ
enough — multi-pass fan versus single-shot size — that sharing would add indirection
without removing complexity. No fourth orientation is planned.

## Four things that will cost you time otherwise

**jsdom paints nothing, and it hid a real bug for the whole plan.** Every tapered word
rendered reversed — `BANKRUPT` as `TPURKNAB` — because `runAlongRadius` ignored
`direction` when rotating, and the test had baked the wrong sign in as `toBeCloseTo(-45)`.
1085 passing tests did not notice. Anything about appearance gets checked in a browser or
it is not checked. The technique that caught the layout rewrite's regressions was a
throwaway differential harness: import the pre-change module from `HEAD`, run both over a
swept input space, diff the output.

**A test that measures the drawing with the layout's own assumption proves nothing.** The
solve reserved 0.72 em across the wedge for a quarter-turned glyph and the face painted up
to 0.99, so filled runs crossed their wedge's edges. Written with `GLYPH_EXTENT` on both
sides, the test that was meant to catch it reported no overflow at all; written with what
a face actually inks, it reported 3.2°. Before trusting a geometry test, break the thing
it checks and watch it fail.

**The label face and the measurer have to agree, and nothing at runtime would say
otherwise.** Every fitted size comes from a canvas measured in `FONT_STACK` at
`FONT_WEIGHT` (`src/slice/measure.ts`); `.wheel__label` in `Wheel.css` paints it. The two
drifting apart mis-sizes every wedge silently, so a test in `Wheel.css.test.ts` pins them
together. The webfont also arrives after the first render, which is why `Wheel` retires
its measurer on `document.fonts.ready` — the cache is per string and would otherwise hold
the fallback's numbers for the session.

**The test fixture's widths are deliberate and easy to trip over.** `WIDTHS` in
`typeset.test.ts` gives real advances only to `I` (0.28), `W` (0.95) and `M` (0.9);
everything else is a flat `0.5`. A test about per-glyph advance that does not use those
letters silently measures uniform widths and proves nothing.

**Untracked in the worktree:** `font-mockup.html`, which predates this work.
