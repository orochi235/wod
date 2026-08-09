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
covers about a third of the ground constant speed would have. It is the
*default*, not a constant; see "Curves are data" below for why the difference
matters more than it looks.

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

## Curves are data

Both curves — the settle, and the launch easing that has always been there — are
meant to become editable. That is a decision about *storage*, made now, even
though the controls ship later.

A CSS easing string cannot support it. `k = x1/y1` is a question about control
points, and `"ease-out"` does not have any until you consult a table; `"steps(4)"`
has no meaningful initial slope at all. Editing a curve stored as a string means
either a keyword table plus a `cubic-bezier()` parser scattered wherever the
slope is needed, or a data migration once the panel arrives. Both are worse than
storing four numbers today.

```ts
/** Control points x1, y1, x2, y2, as CSS orders them. */
type Curve = [number, number, number, number]
```

Strings survive only at the parse boundary. `readMotion` accepts the legacy
form — the five CSS keywords and `cubic-bezier(…)` — and emits a `Curve`;
`useSpin` serializes back to `cubic-bezier(…)` when handing keyframes to the Web
Animations API, which is the only thing that still wants a string. One
representation everywhere in between.

Keyword equivalents, which the parser needs anyway:

| Keyword | Curve |
|---|---|
| `linear` | `[0, 0, 1, 1]` |
| `ease` | `[0.25, 0.1, 0.25, 1]` |
| `ease-in` | `[0.42, 0, 1, 1]` |
| `ease-out` | `[0, 0, 0.58, 1]` |
| `ease-in-out` | `[0.42, 0, 0.58, 1]` |

### Initial slope, including where the formula breaks

`k = x1/y1` assumes the first control point is not the origin. `ease-out` is
exactly the case where it is — `[0, 0, 0.58, 1]` — and there the expression is
`0/0`.

The geometry gives the answer. A cubic Bézier's tangent at `t = 0` points from
`P0` toward `P1`; when `P1 = P0` it points toward `P2` instead. So:

```
slope(curve) = y1 / x1        when (x1, y1) ≠ (0, 0)
             = y2 / x2        when it is, and (x2, y2) ≠ (0, 0)
             = 1              otherwise
```

and `k = 1 / slope`. A settle whose slope is zero or negative has no defined
handover speed; `readMotion` rejects such a curve and falls back to the default,
because the alternative is a division that silently produces an infinite or
backwards rotation.

**Overshoot is allowed and is a feature.** CSS constrains `x` to `[0, 1]` but
lets `y` leave it, so a settle curve like `[0.33, 1.4, 0.68, 1]` carries the
wheel past the winner and drifts back — a bounce. The landing stays exact
regardless, because the track's final keyframe is the resting angle at `t = 1`
whatever route the curve took to get there. The parser clamps `x` and leaves `y`
alone.

## Data model

```ts
type Motion = {
  durationMs: number
  turns: number
  direction: Direction
  /** Parsed from the legacy string form on read. */
  easing: Curve
  /** Absent: today's single-curve rotation, unchanged. */
  settle?: { ms: number; curve: Curve }
}
```

`settle` absent means the existing single-keyframe-pair path runs identically,
which is the migration story for the profile. `easing` changing from `string` to
`Curve` is a change in the parsed shape only: `readMotion` reads both forms, so
every stored preset — including the v1 fixtures, which carry `'linear'` and
`'ease-in'` — parses without a version bump.

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
| Settle (ms) | `settle.ms` | number, empty for "no settle phase" |

**Curves are not in this panel, and that is a scheduling call rather than a
design one.** Four numeric fields per curve is a hostile way to ask for a
feeling, and the control that would actually work — presets plus a draggable
preview — is its own piece of design work. Storing curves structurally (above)
is what makes that a later addition to this panel rather than a migration.

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
- Clamps: `settle.ms` at, above, and below its bounds through `readMotion`.
- Reduced motion: the settle stays proportional when the duration collapses.
- **Curve parsing round-trips**: every keyword and a `cubic-bezier(…)` string
  parse to the expected tuple, and serializing back produces a string the Web
  Animations API accepts. A stored preset carrying `'linear'` still spins.
- **`initialSlope` at its edges**: the ordinary case, `ease-out`'s `P1 = P0`
  degeneracy, and a curve whose slope is zero or negative falling back to the
  default rather than producing an infinite speed.
- An overshoot curve still lands on exactly the resting angle.
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
- **Curve editing in the panel.** Wanted, and the reason curves are stored as
  four numbers from the start. What it needs beyond the data: a set of named
  presets, a preview that animates rather than draws a static graph — a curve is
  a feeling, and nobody reads `[0.33, 1, 0.68, 1]` and pictures it — and a
  decision about whether overshoot is offered openly or left to people who type
  numbers. Applies to both curves through one control.
- **The launch easing, while a settle is present.** The cruise is linear by
  construction, so `motion.easing` governs nothing until the settle is removed
  again — two launch curves that differ only from each other produce
  byte-identical tracks. Restoring the launch curve's effect is exactly the
  wind-up phase above: a bend before the cruise, parameterized in later.
