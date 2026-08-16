# Slice studio

An authoring page for a wedge's contents, at `#/slice`, and the three type
controls it needs: `color`, `tracking`, and `leading` on `SlicePart`.

Audience: anyone working on `src/slice` or `src/editor`. It adds a route and a
directory; it changes no existing rendering behavior at default values.

## The problem

`SlicePart` is the richest record in the app — six optional knobs before you
reach `font` and `maxSize` — and the only way to see what a change does is to
edit a preset, go to the show page, and read one wedge out of twelve at whatever
size the roster happens to give it. A part is authored per wedge but only ever
previewed as a wheel.

Three properties a typographer reaches for first are also missing outright.
Color is fixed by the theme, tracking is the constant at `glyphRun.ts:7`, and
leading is `LINE_HEIGHT` at `fit.ts:17`. All three are compile-time.

## The page

`#/slice` routes to `src/studio/`: `SliceStudio`, `WedgePreview`, `wedge.ts`.

It edits `preset.slice` and saves live, the way `Editor` does. Controls are
`SlicePanel` verbatim — the studio adds a preview, not a second control surface,
and a panel that drifts from the editor's is a bug with two places to fix it.

**Six wedges at once, each cropped to the wedge rather than the wheel.** Five
are the fixed widths worth checking against — 4 / 8 / 12 / 20 / 30 degrees — and
the sixth carries a scrubber over the whole range.

Px-per-unit is held constant across all six: one `viewBox`, sized to the widest
the scrubber reaches. Cropping each wedge to its own box instead would rescale
the type and show the same setting six times, which is the one thing a row of
six exists to disprove — narrowing the arc has to visibly squeeze the run.

## The three controls

These are per-segment already, and no new plumbing makes them so. A part lives
in a `SliceInstance`; `resolveInstance` (`registry.ts:58`) reads `segment.slice`
ahead of the wheel default, and `SegmentList.tsx:128` already exposes per-segment
layout choice. A segment carrying its own slice carries its own color, tracking,
and leading with it.

| Field | Default | Replaces | Emits |
|---|---|---|---|
| `color` | theme ink | — | `SliceElement.ink` |
| `tracking` | `0.08` glyph runs, `0` fitted | `TRACKING`, `glyphRun.ts:7` | glyph step, `letterSpacing` |
| `leading` | `1.2` along a baseline, `1.08` stacked | `LINE_HEIGHT`, `fit.ts:17` | line box, arc band thickness |

`color` is hex-validated on read.

**Tracking is the horizontal space and leading is the vertical one**, and which
of them a run answers to is decided by how that run steps. Text set along a
baseline — fitted, tapered, arched — steps by the advance, so tracking widens it
and leading is its line box. A `stacked` run puts each letter on its own line
down the radius, so it steps by leading alone; tracking has no say there at all.
Tracking is not kerning: kerning is the face's own per-pair fit, and nothing here
touches it.

Both have two baselines, because both paths have two today and the defaults must
reproduce what already ships. A glyph run has always stepped by `0.08` tracking
while a fitted run is one `<text>` the browser spaces and has never carried
letter-spacing at all. A stacked run's line box has always been the glyph's own
extent plus that same `0.08` of separation, which is where `1.08` comes from — a
line box for letters, not for lines of text.

**`tracking` must enter `fit.ts`'s size solve, not just the draw.** The solve
decides a size from how much room the run needs; if tracking widens the run only
at paint time, a fitted run overflows the box that was solved for it. It also has
to reach the emitted `letterSpacing` so the DOM matches the solve.

All three gate through `readPart` in `parts.ts`, so storage round-trips for free
— that function is the only door preset JSON comes through.

## Defaults are the current constants

Every default reproduces today's output exactly. A preset written before this
change renders identically after it, and the test that proves it is worth more
than any of the new controls.

## Testing

`fit` and `glyphRun` get unit tests at non-default tracking and leading — that a
wider tracking solves to a smaller size is the assertion that catches the
overflow bug the table above warns about. `parts.test.ts` covers the read path
including a rejected color and a leading of zero, which would otherwise divide a
band into an infinite size. The studio gets a render test: all six wedges
present, the scrubber drives the sixth, every render shares one `viewBox`, and
edits reach storage.

Verification is `npm test`, `npm run build`, `npm run check`, then the page on
screen.

## Not in scope

Motion, themes, and the wheel-level look. The studio previews one wedge's
contents; it is not a second editor.
