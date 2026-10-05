# Handoff: moving wod's timing and animation onto blits

For the next session picking up the blits migration. The design and its build
status live in `docs/superpowers/specs/2026-10-03-blits-migration-design.md`;
read that first. This file only holds what the spec can't: where things stand,
what's next, and the traps.

## State

- Work lands on `main`. Phases 1 (one ticker in `src/clock/`), 2 (wheel angle
  and flapper on the wheel mix), 3 (outage blackout, `dark` and sparks), 4
  (trick morphs as voices on the wedge mix), 5 (wedge transitions as voices
  on the wedge mix) and 6 (editor scrub over the whole show) are merged. `git log --oneline @{u}..HEAD` lists what is unpushed; pushing is
  the owner's call.
- blits is pinned at exactly `0.4.0`, which carries `hold`, `Mix.inert` and
  `handle.played`.

## Open items

1. Nothing reads the wheel mix's `dark` channel since the clicker kept ticking
   in the dark (`0934914`). Either something should paint it or the voice goes.

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
