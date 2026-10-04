# Handoff: moving wod's timing and animation onto blits

For the next session picking up the blits migration. The design and its build
status live in `docs/superpowers/specs/2026-10-03-blits-migration-design.md`;
read that first. This file only holds what the spec can't: where things stand,
what's next, and the traps.

## State

- Work lands on `main`. Phases 1 (one ticker in `src/clock/`), 2 (wheel angle
  and flapper on the wheel mix), 3 (outage blackout, `dark` and sparks), 4
  (trick morphs as voices on the wedge mix) and 5 (wedge transitions as voices
  on the wedge mix) are merged. `git log --oneline @{u}..HEAD` lists what is unpushed; pushing is
  the owner's call.
- blits is pinned at exactly `0.4.0`, which carries `hold`, `Mix.inert` and
  `handle.played`.

## Next, in order

1. **Plan phase 6** (editor scrub over the whole show) with
   superpowers:writing-plans. The spec's "Editor scrub" section and its open
   point on `history` cost are the starting place; nothing of it is built.
2. The `App.test` case "rolls a material for a wedge that names none" failed
   once in a combined run and then passed 3 of 3 runs alone and the next
   combined run. The failure text was not captured. Unexplained.
3. Deferred from review: `TickerTiming.caf` is never called by the ticker.
4. After a landing, klieg's own loop (the winner banner) requests a frame 60
   times a second for as long as the banner shows; measured in the browser on
   2026-10-04. The wheel's ticker sleeps. Unexamined whether the banner needs it.

## Decisions made in conversation

All are recorded in the spec: blend tricks by weight, keep the rotor on WAAPI,
scrub the whole show, `hold` as blits' name for WAAPI's fill, `inert` and its
rules, and the `share` rename.

## Traps

- `~/src/blits` is usually checked out on a working branch (`voice-lane`), not
  `main`. Read blits APIs with `git show main:…` or from the published tarball,
  never from the working tree, and don't switch that checkout: another session
  works there.
- Measured on blits 0.3.0 and re-measured on 0.4.0, all still true:
  - `keys` loops by default.
  - Stock `last()` switches value halfway between stops.
  - `probe` drops channels no voice touches.
  - A mix without `history` forgets announced marks once `sync` passes them.

  The spec records what wod does about each.
- wod never calls blits `rebase()`. The ticker's clock must stay on the same
  document timeline as the rotor's WAAPI animation.
