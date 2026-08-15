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

34 commits, 1127 tests, clean build. Merged with `main` at `5ca05f2`. Outline mode, the
font registry and the baked specimens are the second plan and are not started.

`shrink` and the overflow ladder have since landed; what is left of the list below is
item 2.

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

## Open

**`stretch: 'fill'` on a tapered run crosses the wedge edges.** 6.68° of overflow on `ANA`
at a 27.7° wedge; `Stretch: None` measures 0.00° everywhere, so it is entirely the fill
computation. `acrossFactor` sizes a tapered glyph so `CAP_HEIGHT × size × factor` equals
the chord at the glyph's *centre* radius, but 0.72 em understates what is drawn and the
glyph's inner corners sit where the wedge is narrower. This breaks the spec's rule that no
glyph exceeds the chord at its own radius. It is a `CAP_HEIGHT` / `GLYPH_CHORD_FILL`
decision, not a constant to nudge. `shrink: 'condense'` relieves it but does not answer it:
it takes the same understated measure from the other side.

Not a bug: a part banded inside r≈30 is painted over by the `wof` hub. The spec already
says type belongs in the outer half.

## Closed since this was written

**The editor preview is blind** — fixed. It passes `slice`, `theme` and `transitions`, plus
`layoutFrom`, `levelRef` and `held` gated on the condition the shown-geometry selector
already used. It stays muted; the show window is the one that makes noise.

**`shrink: 'proportional' | 'condense'`** — built, and it is what fills the band a chord cap
used to leave a run floating in.

**What `MIN_SIZE` may overrun** — decided: a run gives up its tracking, then its fan, before
the floor pushes it out of its band. Overflow is what is left when no rung fits. See the
spec's setting-a-word rules.

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
