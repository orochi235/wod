# Moving timing and animation onto blits

For whoever works on the spin, tricks, wedge transitions, the outage or the
editor's transport. It answers: how wod's clocks and animated values move onto
[`@msb235/blits`](https://www.npmjs.com/package/@msb235/blits), what changes for
the viewer, and in what order it lands. **Phases 1 to 5 built** (clock, wheel
angle and flapper, outage visuals, tricks, wedge transitions); phase 6 (scrub)
unbuilt and unplanned.

## Why

wod runs three `requestAnimationFrame` loops during a spin (the morph loop in
`useSpin`, the presence loop in `usePresence`, the angle readback in
`useWheelAngle`), plus `setTimeout` schedulers for the outage, a delayed WAAPI
blackout and two easing systems. Nothing blends: two tricks on one wedge
property resolve as last-write-wins, and an interrupted wedge transition rebases
by hand. blits is a host-driven effects mixer: effects ("voices") each run on
their own clock with their own weight and are folded into one value per subject
per frame, and the host supplies the time. One loop, one fold, one notion of now.

## What changes for the viewer

| Area | Before | After |
|---|---|---|
| Two tricks on one wedge's weight | later trick wins | their changes add |
| Two tricks on one wedge's color | later trick wins | colors crossfade in OKLCH by voice weight |
| Label, media, reveal overlaps | later trick wins | unchanged |
| A single trick | — | unchanged, except color interpolates in OKLCH rather than sRGB |
| Flapper settle | 1.5° per frame, so faster on faster displays | a spring, the same at any frame rate |
| Editor scrub slider | trick morphs only | the whole show: rotation, morphs, outage visuals, flapper; silent |

Presets that relied on a later recolor overriding an earlier one will now show
a blend. This was chosen, not inherited.

## Prerequisite: blits 0.4.0 `hold`

A blits voice today contributes nothing outside `[start, end]`: a one-pass
`keys` voice snaps back to base when it ends, and by default it loops
(measured against 0.3.0: a 1000 ms voice read at 1500 ms equals its read at
500 ms; with `loop: false` it reads base at 1000 ms). Tricks must hold their end
value until reset, and staggered wedge entrances must hold their first frame
during their delay.

blits 0.4.0 adds `hold?: 'before' | 'after' | 'both'` to `VoiceSpec`, WAAPI's
`fill` under another name: the voice's phase clamps to 0 before `start` and/or
to 1 after its end, instead of the voice being absent. Unset keeps today's
behavior. This is on blits `main` (`2dd0e19`), unreleased. wod depends on:

- A voice holding after enters state `held` and leaves only on `fade()`,
  `mute()` or `drop()`; `probe` keeps returning the held value.
- A mix flag `inert`: true when every voice is held or done (or there are none),
  so another frame would change nothing. `live` stays true while anything is
  held, so wod's ticker runs while `!inert` or a `stay()` hold is out, not while
  `live`; otherwise it ticks every frame under a landed wheel. A motion voice
  (the flapper's `spring`) counts as inert while every subject it has met is at
  rest, so the wheel mix sleeps once the flapper settles; a held voice with a
  signal weight does not count. Both shipped in 0.4.0.

wod pins blits to an exact version (`"0.4.0"`, not `"^0.4.0"`); every 0.x minor
so far has broken something.

## Structure

```
src/clock/
  ticker.ts         the only requestAnimationFrame caller
  motion.ts         wheelKit, wedgeKit, createMotion, useMotionRoot
  morphVoices.ts    Morph → VoiceSpec[], cueMorphs
  compose.ts        base + pose → Segment, segmentsAt on a scratch mix
  testing.ts        fakeMotion, a clock tests step by hand
```

**Ticker.** `createTicker(mixes, { now?, raf?, caf? })` returns
`{ now(), subscribe(fn: (t: number) => void), stay(), wake() }`; `stay()` keeps frames
coming until released, for work no mix sees, such as the spark cues. Time is
`document.timeline.currentTime` and nothing else, the same timeline the rotor's
WAAPI animation runs on. Each frame it calls `sync(t)` on every mix, then
notifies subscribers; it sleeps when no mix is `live` and nothing holds it. wod never calls
`rebase()`: a hidden tab keeps advancing the document timeline under the rotor,
and the angle model must advance with it. Tests inject `now` and `raf`.

**One motion per page.** App and Editor each own one through `useMotionRoot()`
and pass it to what needs it. The React context, and the wedge mix, arrive with
phase 4, where the wheel's children first need them.

**Two kits.**

| Mix | Subject | Channels |
|---|---|---|
| wedges | wedge id (string; `drop` when it leaves) | `weight: sum()` (a delta), `color: hex()`, `label`, `media`, `reveal: last()`, `share`, `opacity`, `scale`, `aperture: mul()`, `offset`, `rotate: sum()`, `offsetAngle: last()` with a numeric lerp |
| wheel | `'wheel'` | `angle` (unwrapped degrees, `sum()`), `deflection`, `blackout: max()`, `dark: last()` with a lerp that steps at the stop (stock `last` steps halfway between stops; measured) |

`share` is the presence field once called `hold`, renamed so it is not
confused with the voice option. Presence travels as numbers: a CSS string
cannot blend in a locus, and only the Wheel knows the angle and radius the
strings need.

**Readers write the DOM.** Subscribers write CSS variables and attributes onto
refs. React renders only on structural change: a wedge arrives or leaves, a
spin starts or ends, a winner is decided. This removes the three per-frame
Wheel renders (morph `setDisplaySegments`, presence `tick`, flapper
`setDeflection`).

**Base values are wod's job.** `probe` does not keep values passed in `out`
(measured: with no voices it returns `{ weight: 0 }` and drops `label`). wod
composes the frame: `weight = max(0, base.weight + pose.weight)`,
`color = pose.color ?? base.color`, likewise for the discrete channels. The
weight channel has no `bounds`, because a bound on the delta would clamp
vanish's negative delta.

**Removed:** the morph loop in `useSpin`, the `tick` loop in `usePresence`,
`useWheelAngle`, `applyMorphs` and its samplers, `morphProgress`, `lerpColor`,
`spinTime`, `sampleTrack`/`samplePresence`, `src/keyframes/bracket.ts`,
`playBlackout`, the `dark` timers in `useOutageFx`, the `setTimeout` sparks in
`fx.ts`.
**Stays:** recipes returning `Morph[]`, `EASINGS` (blits accepts easing
functions; see Tricks for how stops are retimed), `parseHex` (now
`src/wheel/hex.ts`, which recipes validate colors with), the rotor's WAAPI
animation, the audio graph on the audio clock, klieg, magicsmoke,
`schedule.ts` as the one show timeline.

## Tricks

`morphVoices(morph, base, startAt)` turns one morph into up to three `keys`
voices, each weight 1, subject `morph.segmentId`, `hold: 'after'`:

| Voice | Stops | Combines across tricks |
|---|---|---|
| weight | `keyframe.weight − base.weight`; the implicit 0% stop is 0 | deltas add |
| color | absolute colors, `locus: 'color:<id>'`; implicit 0% stop is the base color | crossfade within the locus |
| discrete | label, media, reveal on `last()`; a swap's `null` reveal survives | later wins |

A voice is emitted only for channels the morph touches. A locus normalizes
equal weights (measured: blue and green at weight 1 each give `#00bbe3`;
at 0.25/0.75 the result leans green, `#00e89f`).

A morph eases its whole timeline, with stops on eased progress; blits eases
each segment. So each stop moves to the time the morph's easing reaches it
(`EASING_INVERSES`), and each segment takes that slice of the curve. A golden
test pins every recipe to the old `applyMorphs` output at 0, ¼, ½, ¾ and 1.

Trick voices start at `startedAt + prologueMs` (0 without an outage), which
replaces `spinTime`'s gating, and play at `authored ÷ actual` duration under
reduced motion. `resolveLate` runs before the rotation starts, so the swap is
cued at the start like any other trick: no seek.

Until phase 5 writes arc geometry straight to the DOM, the wedge frame is
composed by a ticker subscriber in `useSpin`, which re-renders only on frames
where the composed segments changed.

`landingSegments(segments, morphs, durationMs)` keeps its signature but runs
`segmentsAt`, which cues `morphVoices` on a scratch mix and probes at
`durationMs`: winner selection, the editor scrub and the live spin share one
path, and selection sees the blended layout.

`findConflicts` stays editor-only; its badge reads "blends with" for weight and
color; for label, media and reveal the later trick reads "overrides another
trick on …" and the earlier "overridden by a later trick on …".

## Wedge transitions

`advance` still diffs the roster (arrivals, departures, returns, `ghostArc`)
but no longer samples. Each transition is one `keys` voice on the wedge mix,
writing the presence channels it touches, in `locus: 'presence:<id>'`.
Transitions stay authored as `PresentationKeyframe`s; `stopsOf` turns them into
stops, giving every channel a stop at 0 because blits holds a channel's first
stop before it. The mix carries numbers; `styleOf` builds the CSS strings, and
`paintPresence` writes them onto the wedge from the ticker. React renders when
a wedge arrives, leaves or finishes, or an arc moves.

An interruption probes the wedge, fades the old voice over 0 and cues the new
one with `from: 'current'`, which starts from the last probe (measured) and
carries its speed: a fade-out cut into a fade-in at 40% rises from 0.40 to
0.49 before it falls. A fresh entrance does not use `from: 'current'`, which
would start it at rest. Channels the new transition is silent on go to rest
(entrance) or hold (exit).

Entrances hold `'both'`, so a staggered wedge shows its first frame through its
delay. A fresh exit holds `'after'`; an exit that interrupts another transition
holds `'both'`, so a staggered wedge stays where it was cut until its turn. A
voice holding after never resolves `done` until faded, so wod retires a
transition on the frame its voice reads `held` (rather than awaiting
`handle.played`, which settles a microtask later): an entrance's voice is
faded (its last frame is rest), an exit's is faded, the wedge dropped and its
ghost arc removed. While `held`, every presence voice is faded over 0. A
transition of 0 ms cues no voice.

Unmounting the wheel drops every wedge it drew from the wedge mix, which also
clears per-subject state that trick voices on those wedges keep. Harmless while
the wheel and `useSpin` share a motion and unmount together.

## The wheel

**Angle.** A custom `patch` whose `at(phase)` returns
`angleAt(track, phase × total)`, built from the same `RotationTrack` and
`OutagePlan` given to `rotor.animate()`, started at the same `startedAt`,
`hold: 'after'`. The patch also writes `speed`, the track's slope, 0 once the
track ends. Each of the rotor's WAAPI animations is given `startTime =
startedAt`, the motion clock's time, so the voice and the pixels share a start.
The angle is wrapped only where it is drawn.

**Flapper.** `trackFlapper` aims a `spring` on `deflection` at `deflectionDeg`
(the peg's push at the current angle) while the wheel turns, and at 0 once its
speed is under `STILL_SPEED`, retargeting only when the target changes. A
subscriber writes the arm's `rotate()` onto `.wheel__flapper-arm` and counts
`pegCrossings` for the clicker, whose speed is the angle voice's `speed`
channel. The arm and its clicker carry on while `dark`: the clicker is
mechanical, and pegs still strike it with the lights out.

**Outage visuals.**

| Before | After |
|---|---|
| `playBlackout(delayMs, depth)` | `keys` voice on `blackout`, stops from `blackoutKeyframes(depth)`, `start = popAt` |
| `useOutageFx` timers for `dark` | `keys` voice stepping `dark` from the schedule |
| `fx.ts` `setTimeout` sparks | a precomputed cue list fired by a ticker subscriber with a cursor; cues more than 250 ms late are skipped |
| `playOutage(ctx, when)` | unchanged, `when` from `startedAt` |

Sparks do not use blits marks: measured on 0.3.0, a mix without `history` drops
announced marks once `sync` passes them, so `marks(prev, t)` after `sync(t)`
returns nothing.

## Editor scrub

`Transport` builds a preview pair of mixes from the planned spin, with
`startedAt = 0` and `MixOptions.history: { ms: totalMs }`, and the slider calls
`project(t)` on both; the same writers paint the result. While scrubbing, the
rotor's WAAPI animation is canceled and its transform is written from the
projected angle. No audio, sparks or marks fire; blackout and `dark` render.
The slider stays disabled mid-spin and spans the whole show, prologue included.

## Build order

Each phase ships on its own and leaves the app working.

| Phase | Lands | Needs |
|---|---|---|
| 1. Clock | blits pinned (0.3.0 until 0.4.0 ships), ticker, provider, two empty mixes | — |
| 2. Wheel angle and flapper | blits bumped to 0.4.0, angle patch, flapper spring, `useWheelAngle` removed | blits 0.4.0 |
| 3. Outage visuals | blackout, `dark`, sparks on the wheel mix | 2 |
| 4. Tricks | `morphVoices`, blended tricks, `landingSegments`, badges | 2 |
| 5. Wedge transitions | presence voices, `share` rename | 2 |
| 6. Scrub | preview mixes, whole-show slider | 2–5 |

## Tests

Time is injected everywhere: the ticker takes `now` and `raf`; mix tests call
`sync` with literal timestamps. These replace the hand-rolled
`requestAnimationFrame` stubs and the fake `Element.prototype.animate`
bookkeeping where those only existed to drive time.

**blits 0.4.0 (in blits):** a one-pass voice with `hold: 'after'` reads its end
value at `end + 5000` and its `state` is `'held'` until `fade()`; `mix.inert` is
true while every voice is held or done, and false while any plays, fades or is
pending; `hold: 'before'` reads the first stop before `start`.

**Tricks**

| Case | Expect |
|---|---|
| Weight becomes deltas | base 3, keyframes 0→3, 1→0 give stops 0 and −3 |
| Implicit 0% stop | only `{ at: 1, color: '#0000ff' }` on a red base starts red |
| Easing passes through | `easeIn` sample at 0.5 equals `EASINGS.easeIn(0.5)` |
| Reveal cleared | `{ at: 0.5, reveal: null }`: base at 0.49, cleared at 0.5 |
| Only touched channels | a weight-only morph emits one voice |
| Single trick matches today | each recipe fixture at 0, ¼, ½, ¾, 1: weight and discrete equal old `applyMorphs`; color within an OKLCH tolerance |
| Weight deltas add | vanish (base 2) + takeover (+3) end at 3 |
| Weight floors at 0 | two vanishes on base 2 end at 0 |
| Colors crossfade | recolors to blue and green end at `#00bbe3` |
| Discrete later wins | relabels A then B end at B |
| Holds after end | read at `durationMs + 5000` equals the end value |
| No phase wrap | reads at `durationMs` and `durationMs + 1` equal the end value |
| Untouched wedge | composes to its base |
| Outage prologue | with `prologueMs` 12000: 11999 equals 0; `12000 + d/2` equals the no-outage `d/2` |
| One landing path | `landingSegments` deep-equals the live mix at `startedAt + d` |
| Winner from blend | overlapping vanish + takeover put wedge X under the pointer only when blended; `planSpin` picks X under a fixed RNG |
| Badges | two color tricks "blends with"; two relabels "overrides" |

**Wedge transitions**

| Case | Expect |
|---|---|
| Enter matches today | `fade`, `fly`, `shrink` at 0, ½, 1 equal old `samplePresence` |
| Staggered enter | `delayMs: 200` reads opacity 0 at 100 ms |
| Exit interrupts enter at 40% | the frames either side of the interrupt agree within ε |
| Enter interrupts exit | same continuity; ends fully at rest |
| Exit holds, then drops | opacity 0 until `done`, then dropped and the ghost arc gone |
| `shrink` reflows | at 50%, neighbors widen by the lost `share` |
| Spin starts mid-transition | next frame has every wedge at rest |
| No per-frame render | a render counter on Wheel stays flat across 60 frames of an enter |
| Reduced motion | duration collapses as today |

**Wheel**

| Case | Expect |
|---|---|
| Angle matches the model | probe at 0, ¼, ½, ¾, 1 of a settle track and an outage track equals `angleAt` |
| Angle holds | at `end + 5000`, angle is `restingRotationDeg` and the wheel mix is `inert` |
| Hidden tab | a 4 s clock jump reads `angleAt(start + elapsed)` |
| Peg lift | a peg coming under the hinge lifts the arm past half of `MAX_DEFLECTION_DEG` |
| Settle ignores frame rate | the same crossing at 30 and 120 fps agrees within ε at +200 ms |
| Clicker speed | matches the analytic slope in cruise and in settle |
| Blackout | matches `blackoutKeyframes` at each offset |
| `dark` | flips at the schedule's times, to the frame |
| Sparks fire once | each shot fires once; re-reading a range does not re-fire |
| Ticks in the dark | crossings while `dark` still reach the clicker |

**Scrub**

| Case | Expect |
|---|---|
| Scrub matches live | `project(t)` equals the live probe at `startedAt + t` |
| Backward | 8 s, 3 s, 8 s: both 8 s frames equal, deflection included |
| Silent | a full sweep fires no sparks and makes no audio nodes |
| Rotor handoff | scrub cancels the rotor animation; leaving restores rest |
| Outage visible | inside the dark window, `blackout` > 0 and `dark` true |

## Open points

- `history` cost over a whole show (tens of seconds, two mixes) is unmeasured;
  phase 6 measures it before relying on it.
