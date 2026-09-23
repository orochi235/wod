# The outage trick

For whoever works on tricks, the spin, or the show page's effects. It answers:
what the `outage` trick does to a spin, and how its sparks, blackout, sound and
stall stay in step. Built; this describes the code as it stands.

## What it does

Before the spin proper, the wheel turns at full speed while sparks, pops and
arcs escalate on its rim. It blows and the room goes dark; the wheel coasts
down, silent, and winds back up to full speed for the lights. The dark
stretch plays a synthesized passage after the power-down in Eric Carmen's "Make
Me Lose Control" (4:07.20–4:10.7), stretched with dead air: two falls, a drone
the lights dim under, clanks, a bar and more of silence, a mains hum, an engine's
pistons and two rimshots on the song's 110 bpm grid, then a chord. The lights
flicker on the hits and come back on the chord, and the wheel runs on into its
authored spin, landing where it always would have.

## A trick with a cue

A recipe may return **cues** from an optional `cues(params)`: timed events that
belong to no wedge. `outage` returns `{ kind: 'outage', cruiseMs, sparkMs }`,
authored in seconds as "Full speed for" (3–30) and "Sparks build for" (1–10). It
writes and provides nothing. Cues ride `resolveTricks` → `Resolution` →
`SpinConfig.outage`, so branches switch it like any trick. The first enabled
outage in trick order runs; others are ignored.

## The prologue

`withOutage` (`src/wheel/outage.ts`) puts a prologue in front of the authored
rotation track: the wheel turns at the track's launch speed through the sparks
and the pop, coasts down to a quarter of it as the lights dim (`SLOW_MS`), and
winds back up over `WIND_UP_MS` to full speed as they return at `DARK_MS` (pop to
chord), where the authored track starts with no kick at the handover. The
prologue covers a whole number of turns, so the authored track plays unchanged
from the same angle mod 360 and lands as planned; the rounding moves the pop by
at most half a turn's time. Morphs read `spinTime`, which holds at zero until the
prologue ends. Reduced motion drops the outage. The flapper stays silent while
the room is dark.

`useSpin` exposes the run (`OutageRun`: plan, start time, id) for the length of
the spin.

## The show

`src/outage/schedule.ts` is the single timeline, in ms from the pop, and every
drum-led event sits on the 110 bpm sixteenth grid (a test pins it, and pins the
chord to `DARK_MS`). Each sound has an id — F falls, C drum notes, X clanks, R
rises, D drone, H hum, K chord, M an alternative startup chime that is off by
default — which `playOutage(ctx, when, { skip, kit })` honors.

**Sound** (`sound.ts`) is Web Audio. Percussion plays on recorded one-shots
from the CC0 Virtuosity Drums kit (`public/outage/`, credited in `CREDITS.md`),
loaded by `loadKit`, with synthesized layers on top; a hit whose sample fails to
load falls back to its synth voice.

**Blackout** (`blackout.ts`) is a fixed full-window layer animated from
`blackoutKeyframes(depth)`: it sags at the pop and dims to black as the drone
plays, flickers partway on its cues — never more than three in any second, for
WCAG 2.3.1 — and lifts on the chord.

**Sparks** (`fx.ts`) are a magicsmoke overlay on the wheel's rim: a fault that
builds through the spark phase, the escalating sputters, bursts, arcs and
showers of `escalation()`, and `fault.blow()` climaxing on the pop. The overlay
canvas sits above the blackout.

`useOutageFx` plays each run once from its start and lets it ring on past the
landing. The show page plays everything at full depth with sound and follows its
Mute; the editor previews sparks and a 60% blackout silently. Effects plug into
`App` through `createFx`, as the banner does through `createBanner`.

The sample at `#/outage` is the cash wheel with the trick on.
