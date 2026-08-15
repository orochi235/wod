# Composed slices — handoff

**What this is:** the state of `feat/wheel-themes` after both plans in
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

**A part names the face it is set in**, out of a catalogue of 33 self-hosted faces, and
falls back to the one the look names — `wof` names Bevan. The editor lists the catalogue
by class and previews each face with a baked specimen, loading none of them.

**`shape: 'outline'` warps the run's real glyph outlines into the wedge**, so a letter
converges with the wedge's own sides instead of keeping parallel sides and stepping at
every join. It is the same solve as glyph mode — switching shape reflows nothing — and it
falls back to glyphs whenever the face has not arrived or does not carry a character.

1214 tests, clean build.

## Where it lives

| File | What it owns |
| --- | --- |
| `src/slice/typeset.ts` | One part to `SliceElement[]`. Resolves content and face, applies `caps`, routes to a run or to `ctx.fit`, and picks the shape. |
| `src/slice/glyphRun.ts` | The two solves — `placeAlongRadius`, `placeAlongArc` — into run space, and `toGlyphs`. |
| `src/slice/outline.ts` | A placed run plus a `GlyphSource` to one warped `d`. Pure. |
| `src/slice/parts.ts` | `readParts` / `readPartList`, `DEFAULT_PART`, `MAX_PARTS`. |
| `src/slice/registry.ts` | `DEFAULT_SLICE`, which is the name plate. |
| `src/slice/fonts/catalog.ts` | The 33 faces: id, name, class, family, file. Data only. |
| `src/slice/fonts/registry.ts` | `getFont`, `resolveFamily`, `resolveFont`. Validates an id. |
| `src/slice/fonts/load.ts` | Fetch, parse and flatten a face once. The only file that knows opentype.js. |
| `src/slice/fonts/usage.ts` | Which faces a wheel loads, and which of them anything wants warped. |
| `src/slice/fonts/specimens.ts` | Generated. One baked run per face. |
| `src/wheel/useFaces.ts` | Asks for those faces; its token retires the measurer when one lands. |
| `src/wheel/fonts.css` | Generated. One `@font-face` per catalogue entry. |
| `src/editor/FontField.tsx` | The face picker, and the specimen under it. |
| `scripts/fonts.mjs`, `scripts/specimens.mjs` | Download the catalogue; bake the previews. |

`typeset.ts` → `glyphRun.ts` → `outline.ts` is the only chain between those three; all of
them take `MIN_SIZE` and `DEFAULT_MAX_SIZE` from `layouts/shared.ts`, which depends on
none of them.

## Open

**The wedge panel is machinery with no user.** The `wof` look turned `panel` off — the
gloss plate over each wedge — so `panelPath`, `.wheel__panel`, `metrics.panel` and their
tests are now reachable only by a look that does not exist. Either a second look wants it
or it goes; nothing in between is worth carrying.

**A look cannot be given a face from the editor.** `Theme.font` is authored in code, like
the rest of a look, and only a part's face is editable. That is a UI gap, not a data one.

Not a bug: a part banded inside r≈30 is painted over by the `wof` hub. The spec already
says type belongs in the outer half.

## Decided, so don't re-litigate

**One TrueType file per face, serving both the stylesheet and the parser.** opentype.js
cannot read WOFF2 without a Brotli decompressor, and a second smaller copy for the
stylesheet would be a second source of metrics. A face costs three to five times its
WOFF2 — Bevan 99KB against 25KB — and only a wheel that names it pays. `scripts/fonts.mjs`
downloads them, with the license each ships under.

**`wof` is set in Bevan, against the spec's Anton**, because the look was tuned in Bevan.
Anton is in the catalogue and one pick away.

**Outline mode does not change the solve.** The size, spacing and position of every letter
come from the same run; the shape only decides how it is drawn. That is why a part can
switch shape mid-session — and why the fallback to glyphs, when a face is still loading, is
invisible except in the letterforms.

**The taper scales a point's across-offset by its own radius.** The wedge's sides are
straight, so its room is proportional to radius; a letter that converges the same way fits
wherever glyph mode's inner corner fit. No new bound was needed.

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

**`placeAlongRadius` and `placeAlongArc` keep their small duplication.** The solves differ
enough — multi-pass fan versus single-shot size — that sharing would add indirection
without removing complexity. No fourth orientation is planned.

## Five things that will cost you time otherwise

**A class beats a presentation attribute, and that hid a wrong face for a whole plan.**
`.wheel__label` set `font-family`, so every wedge painted in the look's face while the
measurer had sized it in the part's — a Lobster label, measured in Lobster, painted in
Bevan, with 1203 tests green. The default face now lives on `.wheel` and is inherited.
Anything about appearance gets checked in a browser or it is not checked.

**jsdom paints nothing, and it hid a real bug for the plan before this one.** Every
tapered word rendered reversed — `BANKRUPT` as `TPURKNAB` — because `runAlongRadius`
ignored `direction` when rotating, and the test had baked the wrong sign in. 1085 passing
tests did not notice. The technique that caught the layout rewrites both times was a
throwaway differential harness: import the pre-change module from `HEAD`, run both over a
swept input space, diff the output.

**A test that measures the drawing with the layout's own assumption proves nothing.** The
solve reserved 0.72 em across the wedge for a quarter-turned glyph and the face painted up
to 0.99, so filled runs crossed their wedge's edges. Written with `GLYPH_EXTENT` on both
sides, the test that was meant to catch it reported no overflow at all. Before trusting a
geometry test, break the thing it checks and watch it fail — `outline.test.ts` was written
that way, one mutation per assertion.

**The label face and the measurer have to agree, and nothing at runtime would say
otherwise.** Every fitted size comes from a canvas measured in that part's family
(`src/slice/measure.ts`); `.wheel` and the element's own attribute decide what paints it.
`Wheel.css.test.ts` pins both ends. A webfont also arrives after the first render, which is
why `useFaces` retires the measurer as each face lands — the cache is per family and string
and would otherwise hold the fallback's numbers for the session.

**The test fixture's widths are deliberate and easy to trip over.** `WIDTHS` in
`typeset.test.ts` gives real advances only to `I` (0.28), `W` (0.95) and `M` (0.9);
everything else is a flat `0.5`. A test about per-glyph advance that does not use those
letters silently measures uniform widths and proves nothing.

**Untracked in the worktree:** `font-mockup.html`, which predates this work.
