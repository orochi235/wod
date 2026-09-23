# The outage trick

For whoever works on tricks, the spin, or the show page's effects. It answers:
what the `outage` trick does to a spin, and how its sound, blackout and stall
stay in step.

## What it does

Partway through a spin the wheel shorts out. Sparks build on it while it
brakes, it pops and stops dead, and the window goes black. The dark stretch
plays a synthesized imitation of the power-down/power-up passage in Eric
Carmen's "Make Me Lose Control" (4:07.20–4:10.7): six falling swoops, two drum
hits, a low drone, then one chord stab. The window flickers on the hits and
comes fully back on the chord, and the wheel spins back up and lands where it
was always going to land.

## A trick with a cue, not a morph

A recipe may return **cues** from an optional `cues(params, ctx)`: timed events
that belong to no wedge. `outage` returns one:
`{ kind: 'outage', at, sparkMs }` — `at` is where in the spin the wheel starts
braking (0.1–0.9 of the authored duration), `sparkMs` how long sparks build
before the pop. It writes nothing and provides nothing, so it never appears in
a conflict badge. Cues ride `resolveTricks` → `Resolution` → `SpinConfig.outage`
the same way morphs do, so branches enable and disable it like any trick. A
spin runs at most one outage: the first enabled one in trick order.

The dark stretch is fixed by the sound, so it is not a parameter.

## The spin clock

The rotation is planned exactly as before over the authored duration. An outage
adds a **warp** from real time to spin time:

| Phase   | Real length | Spin clock speed |
|---------|-------------|------------------|
| cruise  | until `at`  | 1                |
| brake   | 400 ms      | 1 → 0, linear    |
| dark    | 3390 ms     | 0                |
| restart | 700 ms      | 0 → 1, linear    |
| finish  | the rest    | 1                |

The spin runs `400/2 + 3390 + 700/2` ms longer. The rotor's angle at real time
`t` is the unwarped track's angle at `warp(t)`, sampled into linear keyframes at
60 Hz; level elements and riders invert or copy that track as today, and the
flapper reads the compositor as today. Morphs read `warp(t)` too, so they freeze
while the room is dark. The landing angle is unchanged by construction.

Reduced motion drops the outage before the track is built. The editor's scrub
bar scrubs spin time, which the warp does not change.

## The show

t = 0 is the pop, which is the silence at 4:07.20.

| t (ms) | Sound                  | Window                          |
|-------:|------------------------|---------------------------------|
|  −spark| magicsmoke crackle     | sparks build (`fault.blow`)     |
|      0 | silence                | pop; black                      |
|    100 | swoop 196 → 87 Hz      | black                           |
|    360 | swoop 129 → 87 Hz      | black                           |
|    970 | drum hit               | dim flicker                     |
|   1080 | drum hit               | dim flicker                     |
|   1800 | swoop 188 → 86 Hz      | flicker                         |
|   2190 | swoop 124 → 81 Hz      | flicker                         |
|   2640 | swoop 156 → 81 Hz      | flicker                         |
|   3040 | swoop 145 → 86 Hz      | flicker                         |
|   3390 | E-major chord stab     | fully on; wheel restarts        |
|   3500 | chord faded            |                                 |

A drone near 87 Hz sits under 100–1100 ms. The timings and pitches were
measured from the recording with an STFT; the recording is not in the repo.

**Flash safety.** No one-second window holds more than three flickers, and a
flicker lifts the black only partway, so a full-window flash stays under the
WCAG 2.3.1 threshold. A test pins the schedule.

**Layers.** magicsmoke's overlay canvas sits above everything (its own
z-index), so the pop's embers glow over the black. The blackout is a fixed
full-window element under it. The show page's blackout is opaque; the
editor's is semitransparent and the editor is silent, as it already is.

**Sound** is wod's own Web Audio voice, scheduled against the context clock at
the spin's start, and follows the page's Mute. magicsmoke's own sound follows
the same Mute. Effects plug into `App` through a `createFx` prop, as the banner
does through `createBanner`, so tests spin an outage without WebGL.
