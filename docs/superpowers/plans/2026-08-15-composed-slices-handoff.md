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

30 commits, 1087 tests, clean build. Outline mode, the font registry and the baked
specimens are the second plan and are not started.

## Where it lives

| File | What it owns |
| --- | --- |
| `src/slice/typeset.ts` | One part to `SliceElement[]`. Resolves content, routes to a run or to `ctx.fit`. |
| `src/slice/glyphRun.ts` | The two glyph solves — `runAlongRadius`, `runAlongArc` — and their constants. |
| `src/slice/parts.ts` | `readParts` / `readPartList`, `DEFAULT_PART`, `MAX_PARTS`. |
| `src/slice/layouts/composed.ts` | The `composed` layout: a part list, concatenated. |
| `src/slice/layouts/{radial,tangential,curved,auto}.ts` | One-part compositions over `typeset`. |
| `src/editor/PartsField.tsx` | Three fixed slots. |
| `src/wheel/SliceElements.tsx` | Renders `glyphRun`. Decides nothing. |

`typeset.ts` → `glyphRun.ts` is the only edge between those two; both take `MIN_SIZE` and
`DEFAULT_MAX_SIZE` from `layouts/shared.ts`, which depends on neither.

## Open, in the order worth doing

**1. The editor preview is blind.** `Editor.tsx:230` renders `<Wheel segments={shown}
rotorRef={rotorRef} />` — no `slice`, no `theme`, no `transitions`. `App.tsx:124` passes
all three, so the show page is right and only the editor is wrong. The Slice layout and
Look panels change nothing in the wheel the operator is watching. This predates the plan
and defeats the parts editor that just landed. Fix this before anything else here.

**2. `stretch: 'fill'` on a tapered run crosses the wedge edges.** 6.68° of overflow on
`ANA` at a 27.7° wedge; `Stretch: None` measures 0.00° everywhere, so it is entirely the
fill computation. `stretchOf` sizes a tapered glyph so `CAP_HEIGHT × size × factor` equals
the chord at the glyph's *centre* radius, but 0.72 em understates what is drawn and the
glyph's inner corners sit where the wedge is narrower. This breaks the spec's rule that no
glyph exceeds the chord at its own radius. It is a `CAP_HEIGHT` / `GLYPH_CHORD_FILL`
decision, not a constant to nudge.

**3. `shrink: 'proportional' | 'condense'`** — specced, not built. Today the chord cap
takes the whole glyph down, so a long name loses height as well as width. Worse, the fit
unit is `bandLength / Σ(weight × step)`, so a glyph the cap shortened takes less than its
share and **the run stops short of its band** — a long name on a narrow wedge shrinks and
then floats. `'condense'` keeps the band-solved height and squeezes only the across-wedge
axis. It is the same axis as `stretch` in the opposite direction, so it belongs in
`stretchOf`, not beside it. This also relieves (2).

**4. What `MIN_SIZE` may overrun.** Stacked `SCHWARZENEGGER` floors at size 9 by its third
letter and runs to r=52 when its band's inner edge is r=90 — it would collide with a part
banded at 0.20–0.34. An arched run overflows sideways into its neighbours the same way
(the browser pass caught copies colliding into a continuous `BANKRUPTBANKRUPT` ring). The
spec accepts overflow as the price of never dropping a letter but did not anticipate parts
colliding with each other. Wants a decision: clip to the band, let the ladder shorten
before the floor binds, or accept and document.

Not a bug: a part banded inside r≈30 is painted over by the `wof` hub. The spec already
says type belongs in the outer half.

## Decided, so don't re-litigate

**A type member lands with the code that consumes it.** `SLICE_LAYOUTS` is a
`Record<SliceLayoutId, …>` and `SliceElements` narrows `SliceElement` by elimination, so
adding an id or a union member alone leaves the build red across a commit boundary. This
cost a revert; the plan's task order encodes the fix.

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

## Two things that will cost you time otherwise

**jsdom paints nothing, and it hid a real bug for the whole plan.** Every tapered word
rendered reversed — `BANKRUPT` as `TPURKNAB` — because `runAlongRadius` ignored
`direction` when rotating, and the test had baked the wrong sign in as `toBeCloseTo(-45)`.
1085 passing tests did not notice. Anything about appearance gets checked in a browser or
it is not checked. The technique that caught the layout rewrite's regressions was a
throwaway differential harness: import the pre-change module from `HEAD`, run both over a
swept input space, diff the output.

**The test fixture's widths are deliberate and easy to trip over.** `WIDTHS` in
`typeset.test.ts` gives real advances only to `I` (0.28), `W` (0.95) and `M` (0.9);
everything else is a flat `0.5`. A test about per-glyph advance that does not use those
letters silently measures uniform widths and proves nothing.

**Untracked in the worktree:** `.shots/` (browser-pass screenshots — delete when done) and
`font-mockup.html`, which predates this work.
