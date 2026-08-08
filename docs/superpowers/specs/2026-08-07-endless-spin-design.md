# The spin that won't stop

A wheel that cruises at a dead-steady speed long past the point anyone expects
it to stop, then breaks hard into the winner. The audience gives up on it
ending; then it ends.

## What this is not

It is not a trick. A `Recipe` returns `Morph[]` — per-segment keyframes for
weight, color, label, and media. Rotation appears nowhere in that contract: it
lives in `useSpin` and `SpinConfig`, and `planSpin` fixes the winner and the
resting angle before the animation starts. Nothing a recipe can return reaches
the rotor.

So this is a **motion profile**: one optional field on `Motion`, and a rotation
track that can hold a speed and then break it.

## The illusion is speed continuity

The whole effect fails on a stutter. If the wheel visibly changes pace at the
handover from cruise to settle, the eye reads it as a dropped frame and the joke
becomes a bug report.

A single `cubic-bezier` cannot hold flat and then break — that is a curve with a
straight middle and a knee, which four control points cannot express. So the
rotation track becomes three keyframes with per-keyframe easing:

```
offset 0            offset C/D              offset 1
  from  ──linear──►  from + v·C  ──ease-out──►  to
        cruise (C ms)              settle (S ms)
```

### Solving it

The naive order — pick the turns, derive the speed — is what produces the
stutter, because nothing then constrains the settle to begin at the speed the
cruise ended at. Go the other way.

For a CSS `cubic-bezier(x1, y1, x2, y2)`, the initial slope of progress against
time is `y1 / x1`. Over a keyframe interval covering angle `A` in time `S`, the
instantaneous speed at its start is therefore `(A / S) · (y1 / x1)`. Matching
that to the cruise speed `v` gives

```
A = v · S · k          where k = x1 / y1
```

and the cruise covers `v · C`, so

```
total = v · C + v · k · S = v · (C + k·S)
```

Which inverts cleanly. Given a duration `D`, a settle `S` (so `C = D − S`), and
a requested turn count `N`:

```
delta = N · 360 + forward        // forward = angle needed to reach the winner
v     = delta / (C + k·S)
mid   = from + v · C             // the middle keyframe's angle
to    = from + delta
```

`mid + v·k·S = from + v·(C + k·S) = from + delta = to`, so the track lands on
exactly the angle `planSpin` asked for, and the handover is smooth by
construction rather than by tuning.

Turns are what make this solvable: any whole number of extra revolutions lands
the same angle, so `N` is free to absorb whatever the speed solve wants.

**Settle curve.** `cubic-bezier(0.33, 1, 0.68, 1)` gives `k ≈ 0.33` — the settle
covers about a third of the ground constant speed would have. It is a constant,
not a parameter: an operator choosing curve control points is a worse experience
than an operator choosing milliseconds, and `k` must stay positive or the solve
divides by zero.

### Degenerate inputs

- `S ≥ D` — a settle longer than the spin. Clamped to half the duration, the
  same posture `readFeedDefaults` takes with churn intervals.
- `S = 0` — no settle at all; the wheel stops dead from full speed. Permitted,
  and floored to one frame's worth (16ms) so the track never has a zero-length
  interval to divide by. Note that this is a different state from the field
  being **absent**: absent means the old single-easing path runs, while zero
  means the new track runs with its settle collapsed. The panel's empty field
  writes absent.
- **Reduced motion.** `useSpin` already collapses `durationMs` to 300ms. `S`
  scales with it (`S · 300 / D`), or the settle swallows the entire spin and the
  cruise disappears — which would leave the fake-out as an ordinary short spin
  rather than a broken one.

## Data model

`Motion` gains one optional field:

```ts
type Motion = {
  durationMs: number
  turns: number
  direction: Direction
  easing: string
  /** Absent: today's single-easing rotation, unchanged. */
  settleMs?: number
}
```

Absent means the existing single-keyframe-pair path runs byte-identically —
this is the migration story, and it is why no preset version bump is needed.
`readMotion` clamps `settleMs` on the way in, and a preset that never heard of
the field parses as it does today.

## Extracting the rotation math

The angle arithmetic currently sits inline in `useSpin.spin()`, tangled with the
mutex, the morph tick, and the animation lifecycle — none of which a test of the
math should have to stand up.

Extract a pure function:

```ts
type RotationTrack = { keyframes: Keyframe[]; durationMs: number }
function rotationTrack(from: number, restingDeg: number, motion: Motion): RotationTrack
```

`useSpin` then hands its result to `rotor.animate`. The direction handling
(`forward` versus `backward`, and the sign trap the existing comments call out)
moves with it, which is the point: that arithmetic has bitten this file twice
already and has never been directly testable.

## The motion panel

`durationMs` and `turns` are preset fields with no UI. A thirty-second fake-out
is unauthorable today without hand-editing JSON, which makes the feature
theoretically available and practically absent.

A `MotionPanel` in the editor's center column, beneath `Transport`, since motion
is a property of the spin rather than of the wheel or the roster:

| Control | Field | Kind |
|---|---|---|
| Duration (ms) | `durationMs` | number |
| Turns | `turns` | number |
| Direction | `direction` | select — cw / ccw |
| Settle (ms) | `settleMs` | number, empty for "no settle phase" |

Easing stays out of the panel. It is a raw CSS string today, and a text field
that accepts `cubic-bezier(…)` is a validation problem worth its own decision
rather than a row snuck into this one.

The panel writes through `update()` like every other editor panel, so an open
show window picks the change up through the storage event with nothing to apply.

## Testing

- `rotationTrack` — pure, so most of the value lands here. The keyframe angles
  and offsets for a given `(from, resting, motion)`; that the final angle equals
  `from + N·360 + forward`; that the middle keyframe sits at `C/D`; that a
  counter-clockwise spin produces a negative delta and a resting angle that is
  still in `[0, 360)`.
- **Speed continuity as an assertion, not an eyeball.** Sample the track's
  implied speed either side of the handover and pin that they agree within a
  tolerance. This is the property the whole design exists to hold, so it should
  fail loudly rather than look slightly wrong.
- Clamps: `settleMs` at, above, and below its bounds through `readMotion`.
- Reduced motion: the settle stays proportional when the duration collapses.
- `MotionPanel`: renders a control per field, writes numbers not strings, and
  persists through `update()`.

## Not in this design

Carried from the options considered and set aside, so they stay available rather
than getting reinvented:

- **A spin that genuinely never ends.** No winner, no reveal, no branch — the
  operator escapes by reloading. Rejected for now because every consumer of
  `winnerId` would need a null path, but it is the purest form of the joke.
- **Click-to-stop.** The Spin button becomes Stop; the wheel cruises until the
  operator lands it, then decelerates into a fairly-drawn winner. The most
  useful version as a live bit, and the most machinery: `planSpin` would have to
  run at stop time rather than at start time.
- **Wind up, hold, then stop.** A third phase before the cruise. The keyframe
  track designed here already subsumes it — it is one more interval with its own
  easing — so this is a parameterization later, not a rewrite.
