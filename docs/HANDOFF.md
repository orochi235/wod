# Handoff: moving wod's timing and animation onto blits

For the next session picking up the blits migration. The design and its build
status live in `docs/superpowers/specs/2026-10-03-blits-migration-design.md`;
read that first. This file only holds what the spec can't: where things stand,
what's next, and the traps.

## State

- Work is on `main`; there is no feature branch. Phases 1 (one ticker in
  `src/clock/`) and 3 (outage blackout, `dark` and sparks on the wheel mix) are
  merged. `git log --oneline @{u}..HEAD` lists what is unpushed; pushing is
  the owner's call.
- blits is pinned at exactly `0.3.0`. Phases 2, 4, 5 and 6 need blits 0.4.0,
  which must ship both `hold` (already merged on blits `main`, `2dd0e19`) and
  `Mix.inert`.
- `inert` is committed on blits branch `inert` (`2c4e9f3`, in a worktree of the
  blits session `blits-17`), not yet merged or published. The rules it will follow are in the
  spec's "Prerequisite" section.

## Next, in order

1. **Build phases 2, 4 and 5** once blits 0.4.0 is published, in that order, from
   `docs/superpowers/plans/2026-10-03-blits-wheel-angle.md`, `…-blits-tricks.md` and
   `…-blits-transitions.md`. Each plan opens with the readings it took where the spec was
   ambiguous or wrong; accepted on 2026-10-04.
   Phase 2's Task 1 stops if 0.4.0 lacks `hold` or `inert`. Phase 6 (scrub) comes after, unplanned.
2. The `App.test` case "rolls a material for a wedge that names none" failed
   once in a combined run and then passed 3 of 3 runs alone and the next
   combined run. The failure text was not captured. Unexplained.
3. Deferred from review: `TickerTiming.caf` is never called by the ticker.

## Decisions made in conversation

All are recorded in the spec: blend tricks by weight, keep the rotor on WAAPI,
scrub the whole show, `hold` as blits' name for WAAPI's fill, `inert` and its
rules, and the `share` rename.

## Traps

- `~/src/blits` is usually checked out on a working branch (`voice-lane`), not
  `main`. Read blits APIs with `git show main:…` or from the published tarball,
  never from the working tree, and don't switch that checkout: another session
  works there.
- Measured on blits 0.3.0, and still true until checked against 0.4.0:
  - `keys` loops by default.
  - Stock `last()` switches value halfway between stops.
  - `probe` drops channels no voice touches.
  - A mix without `history` forgets announced marks once `sync` passes them.

  The spec records what wod does about each.
- wod never calls blits `rebase()`. The ticker's clock must stay on the same
  document timeline as the rotor's WAAPI animation.
