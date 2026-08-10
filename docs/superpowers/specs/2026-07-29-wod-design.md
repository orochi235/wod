# wod — design

Date: 2026-07-29
Status: approved, not yet implemented

## Summary

A spinning name wheel for meetings. Its primary purpose is as a vehicle for
visual jokes; pulling a live attendee list out of a Google Meet is one input
among several, not the point of the product.

The app is a static single-page app, screen-shared into a meeting by the person
running it. There is no server.

## Goals

- A generic, highly customizable wheel that can hold arbitrary weighted entries.
- A binding layer that populates the wheel from a Google Meet attendee list.
- Enough presentation flexibility to keep adding new visual gags indefinitely
  without touching the wheel's internals.
- Covertly riggable spins that are visually indistinguishable from fair ones.
- Segment properties that animate mid-spin, so the wheel itself can be part of
  the joke rather than just a delivery mechanism for one.

## Non-goals (v1)

- **Google Meet Add-on / main-stage rendering.** Screen-sharing gives more
  presentation freedom than an add-on iframe, and a Workspace Marketplace
  listing would put in-jokes through a review pass. Deferred indefinitely, not
  scheduled.
- **Key-chord and phone-remote rig transports.** Designed for behind the control
  channel interface, but only the unshared-admin-window transport ships in v1.
- **Multi-user sync.** One operator, one screen share.

## Architecture

Static SPA: Vite + React 19 + TypeScript, Biome, Vitest. Four modules with
one-way dependencies — `wheel` and `selection` depend on nothing; `composer`
depends on `sources`; the app shell wires them together.

### Segment model

The single shared type. Everything on the wheel is a segment; a person is not
special.

```ts
type Segment = {
  id: string
  label: string
  weight: number          // relative; normalized at render
  color?: string
  media?: { kind: 'emoji' | 'image', value: string }
  labelStyle?: LabelStyle
  reveal?: Reveal         // what the landing takeover shows
}
```

Weight being first-class is what allows a 0.5%-of-the-circle joke prize to sit
alongside eight equal-weight humans.

A segment with weight `0` is present but occupies no arc: invisible, unlabeled,
and unable to win. This is how segments appear and vanish (see **Morphs**) —
the segment array itself never changes during a spin, which keeps geometry
continuous and avoids reindexing mid-flight. The practical consequence is that
joke wedges are **pre-loaded at weight 0** before the meeting and revealed
during it; a genuinely new segment cannot be conjured mid-spin.

The reveal is the landing takeover — where the punchline actually lands, and the
part most likely to keep growing. It is deliberately a small, open-ended shape:

```ts
type Reveal = {
  headline?: string       // defaults to the segment label
  body?: string
  media?: { kind: 'image' | 'gif', src: string }
  sound?: string
  effect?: 'confetti' | 'none'
  holdMs?: number         // 0 = dismiss on click
}
```

A segment with no `reveal` gets a default takeover showing its label. New gag
formats are added by extending `Reveal` and its renderer, never by touching
wheel geometry, selection, or the composer.

**Superseded (2026-08-09):** only a segment with an authored `reveal` raises an
overlay; everything else keeps the quiet result line. A dismissal on every
routine spin is a tax, and an overlay that always appears signals nothing. See
`2026-08-09-post-landing-lifecycle-design.md`.

### 1. `wheel` — presentation core

Renders and animates. Knows nothing about people, meetings, or who should win.

- One SVG `<g>` rotated via the Web Animations API. Segments are `<path>` arcs
  sized by normalized weight. Pointer is fixed at 12 o'clock.
- Given a `targetSegmentId`, it computes the landing rotation and animates
  there, then emits `onLanded(segmentId)`. It never chooses a winner.
- **Two-track animation.** Rotation is a single transform on the `<g>`, which
  stays cheap and compositor-friendly. Geometry morphing is a separate track:
  every segment's `d` is regenerated per frame under `requestAnimationFrame`.
  The two tracks are independent and must not be conflated — rotation never
  recomputes paths, morphing never touches the rotation transform.
- **Degenerate geometry** must be handled explicitly, because the headline gag
  produces it:
  - A segment at weight `0` renders nothing and skips label layout entirely.
    Arc generation must not emit `NaN` or an invalid `d` for a zero-radian arc.
  - A segment holding **all** the weight spans 360°, where arc start and end
    coincide and a naive single-arc path renders as nothing. This case renders
    as a full circle (or two half-arcs) instead. "Free beer fills the wheel" is
    exactly this input.
- **Landing jitter:** the final angle is randomized *within* the winning arc
  rather than snapping to the arc's midpoint. Without this, every spin ends dead
  center and repeated viewing reveals that the outcome is precomputed — which
  would expose rigged spins.
- **Long-label fitting:** shrink font → radial wrap → truncate with full text in
  the reveal. Required so narrow slivers stay legible. **Radial wrap is not yet
  built** — the shipped implementation shrinks then truncates. Wrapping is worth
  adding when a real label proves unreadable; until then truncation plus the
  reveal covers it.
- **Near-miss** is an animation concern only: `nearMiss: { decoyId, creepMs }`
  eases to the decoy's boundary, holds, then creeps across into the target. The
  decoy defaults to the segment immediately preceding the target in rotation
  order, so the creep is short.
- `prefers-reduced-motion` shortens the spin to a brief fade to the result.

**Styling:** all styling lives in CSS classes. Data-driven values (per-segment
color, computed arc geometry) are passed as CSS custom properties set on the
segment group, never as inline style rules, and never with `!important`.

### 2. `selection` — who wins

```ts
type SelectionStrategy = (segments: Segment[]) => string
```

- `weightedRandom` — cumulative normalized weights, sampled with
  `crypto.getRandomValues`.
- `forced(segmentId)` — the rig.

The winner is chosen **before** the animation, and the animation is derived from
it. This is what makes weights exact (physics-simulated randomness only
approximates them) and makes rigging nearly free.

**Selection samples the weight distribution as it will be at landing, not as it
is at launch.** When weights morph during a spin (see **Morphs**) the launch
distribution is not the one the pointer will meet, so sampling it would aim at
an arc that no longer belongs to the winner.

This yields one hard constraint, which happens to be the desired behavior rather
than a limitation:

> A segment with zero weight at landing cannot win. A segment that grows to hold
> the entire circle is therefore *guaranteed* to win.

The wedge swallowing the wheel and the wedge winning are the same fact, enforced
by geometry rather than by a special case.

### 3. `sources` + `composer` — what's on the wheel

```ts
type Source = { id: string, subscribe(cb: (segments: Segment[]) => void): Unsubscribe }
```

Sources: `meetRoster` (polled Google Meet REST API), `manualList` (typed or
pasted names), `prizes` (custom joke segments with arbitrary weights).

The **composer** merges all active sources, then applies, in order:

1. **Exclusions** — a persisted per-preset deny list (bots, notetakers, the
   perpetual observer).
2. **Draw removal** — segments already drawn this round are dropped and the
   remainder renormalized. This single mechanic covers pick-one (stop after 1),
   pick-N (stop after N), and full-ordering (spin until empty).
3. **Weight modifiers** — repeat-avoidance multiplies a segment's weight by
   `1 / (1 + recentPickCount)`, where `recentPickCount` counts appearances in
   the preset's stored draw history. Strength is configurable per preset.

Output is the final `Segment[]` handed to the wheel.

### 4. `control` — the rig channel

```ts
type ControlChannel = {
  armRig(segmentId: string): void
  armNearMiss(opts: NearMissOpts): void
  onCommand(cb: (cmd: Command) => void): Unsubscribe
}
```

v1 transport is `BroadcastChannel` between the wheel window and an admin window
at `/admin`, which lists current segments so the operator can pick one. The
admin window is kept out of the screen share.

Arming is **consume-once**: the next spin uses it, then it clears.

Note: `BroadcastChannel` is same-origin, so any tab on the same origin can
observe rig commands. Acceptable for a single-operator local tool; it is not a
security boundary.

## Morphs

A morph animates segment properties *during* a spin — the flagship case being a
tiny "free beer" wedge swelling to fill the entire circle while the wheel is
still turning. Morphs are cross-cutting: they touch both `wheel` (geometry) and
`selection` (which distribution to sample).

```ts
type MorphKeyframe = {
  at: number              // 0..1 through the morph's own duration
  weight?: number
  color?: string
  label?: string
  media?: Media
}

type Morph = {
  segmentId: string
  keyframes: MorphKeyframe[]
  durationMs: number
  easing?: string
}
```

Morphable properties are **weight, color, label, and media**. Appearing and
vanishing are not separate features — they are weight morphs to and from `0`.

### Scheduled morphs

Attached to the spin config and known at launch. The landing weight distribution
is computable up front, so selection and target-angle math are exact and fully
deterministic. This is the foundation and ships first.

### Live-fired morphs

Sent through the control channel mid-spin, from the unshared admin window. The
landing distribution changes while the wheel is already turning, so the wheel
must **re-target in flight**:

1. Recompute the weight distribution as it will now be at landing.
2. **Keep the existing winner if it still has nonzero landing weight; otherwise
   re-select from the new landing distribution.** This preserves the fairness of
   the original draw whenever the morph doesn't invalidate it, and forces the
   correct outcome when it does (a wedge grown to 100% leaves no alternative).
3. Recompute the target angle against the new landing geometry.
4. Cancel the in-flight rotation, read the current angle, and start a new
   animation from there.

Step 4 is the main implementation risk. The spin is a decelerating ease-out, so
naively retargeting can produce a visible jerk or an abrupt slowdown when the
new target is only slightly ahead of the current angle. The mitigation is to
add whole extra revolutions to the new target until it is far enough ahead that
the remaining duration preserves apparent angular velocity. A morph that is
visible because the wheel stuttered is a morph that gave away the mechanism.

## Data flow

```
sources → composer → Segment[] → wheel (render)

[spin pressed]
  → resolve landing weights (apply scheduled morphs)
  → armed rig ? forced(id) : weightedRandom(landing weights)
  → targetSegmentId → landing angle
  → wheel animates: rotation track + morph track
       ├─ [live morph fired] → recompute landing weights
       │                     → keep or re-select winner
       │                     → re-target, resume without a seam
  → onLanded
  → reveal overlay
  → composer records the draw
```

## Persistence

`localStorage`, one key per preset. A preset is:

```ts
type Preset = {
  name: string              // 'standup', 'punishment', 'beer'
  sources: SourceConfig[]
  prizeSegments: Segment[]
  exclusions: string[]
  skin: SkinConfig
  spin: SpinConfig
  history: { segmentId: string, at: number }[]
}
```

Presets export and import as JSON so jokes can be shared and backed up.

## Auth and permission scoping

Google OAuth 2.0 with PKCE, browser-only, no client secret — keeps the app a
static page. The Workspace account running it must have the standing to read the
conference's participant list.

Requested permissions are kept as narrow as possible, because this has to be an
easy sell to a Workspace admin. The governing rule: **request the single
narrowest scope that returns a participant list, and nothing else.** No
recording scopes, no transcript scopes, no write scopes, no Drive, no directory.

Defense in depth, in descending order of how convincing it is to an admin:

1. **There is no backend.** The app is a static page; attendee names are read by
   the browser and stay there. There is no server to exfiltrate anything to.
   This is the strongest argument and it holds regardless of scope granularity.
2. **A Content Security Policy** restricts network egress to Google's OAuth and
   API endpoints only. Any attempt to send data elsewhere fails in the browser.
3. **No analytics, no telemetry, no error reporting service.**
4. **The codebase contains no reference to the transcript or recording
   endpoints.** The app is small enough that an admin can verify this by
   grepping it.

**Resolved (2026-07-30): the scopes are bundled.** Google's Meet REST API
reference lists the same pair — `meetings.space.readonly` and
`meetings.space.created` — for `conferenceRecords.participants.list` *and*
`conferenceRecords.transcripts.list`. There is no narrower scope that returns a
participant list without also conferring transcript access.

The consequence is that **"this app cannot read transcripts" is not enforceable
at the OAuth layer** and must rest entirely on points 1–4 above. The pitch to an
admin says exactly that, in those words. Claiming the scope prevents transcript
access would be false, and the app is small enough that an admin who checks will
find out. The honest framing — "the granted scope permits it; the app has no
backend to send it to, a CSP that blocks egress, and no line of code that names
the endpoint" — is both true and, for a static page, genuinely strong.

This is a disclosure obligation, not a build gate. It does not block
`meetRoster`.

## Risk: live Meet roster

**Liveness is a hard requirement, not a nice-to-have.** A roster that reflects
who was invited, or who was present when the meeting ended, is not the feature.
The joke depends on the wheel matching who is in the room *right now* — a stale
list puts absent people on the wheel and leaves out the person who just joined,
which is exactly the moment the bit stops working.

The API surface is built for live state: `conferenceRecords.list` documents an
`end_time IS NULL` filter for in-progress conferences, and
`conferenceRecords.participants.list` documents `latest_end_time IS NULL` as
returning "active participants in the conference." What remains unverified is
behavior, not surface — how quickly a join propagates, whether `latestEndTime`
is stamped promptly on leave, and whether the list is stable rather than flapping
between polls. A probe answers this against a real meeting before any
`meetRoster` code is written.

**There is no live fallback.** This is a correction to an earlier draft, which
offered the Calendar event's invitee list as a graceful degradation. An invitee
list is who was *invited*, not who is present; it carries no live signal at all,
and neither does manual paste. So the mitigations are not mitigations — under a
hard liveness requirement they fail the requirement outright.

The real branch:

- **Live, with acceptable latency** → build `meetRoster` as a poller.
- **Not live, or too laggy to track the room** → the source does not get built.
  `manualList` is the whole story, and the wheel is filled by hand. Nothing else
  in the app changes, because sources share one interface — but the feature is
  dropped rather than degraded.

Latency threshold: if a join is not reflected within roughly the length of a
turn at the meeting — call it fifteen seconds — the wheel is describing a room
that no longer exists, and manual entry is honestly better.

## Error handling

The wheel never breaks the bit:

- Meet API unavailable, scope denied, or caller lacks access → the source emits
  an empty array and the shell shows a banner. Manual entry still works. The
  wheel is never blocked.
- A rig targets a segment that no longer exists (that person left) → silently
  falls back to a fair spin. No on-screen error mid-joke.
- Zero segments → spin control disabled with an explanatory empty state.
- Any non-finite or negative weight → treated as zero.
- **Weights summing to zero → every segment gets an equal slice.** This is a
  deliberate exception to "weight 0 occupies no arc": the alternative is a blank
  wheel, and an evenly divided wheel is the more useful reading of "nothing has
  been weighted." The consequence to be aware of is that a morph driving *every*
  weight to zero snaps the wheel from one filled slice to N equal slices in a
  single frame. Morphs should leave at least one segment with weight.

## Testing (Vitest)

- `selection`: weight fidelity over many draws (statistical bounds); `forced`
  always returns its target; cumulative-boundary edge cases (first segment, last
  segment, zero-weight segment).
- `composer`: merge, exclusion filtering, draw removal with renormalization,
  repeat-avoidance modifier math.
- **Wheel geometry: the rotation mapping is exactly invertible** — recovering
  the pointer's wheel-local position from a computed target rotation returns the
  position that was aimed at. This is the highest-value test; the failure it
  catches is the pointer landing visually on a different slice than the one
  reported as the winner.
- Geometry degenerate cases, asserted directly because the headline gag produces
  them: a zero-weight segment yields a valid empty render with no `NaN` in the
  path; a segment holding all the weight renders a complete 360° ring rather
  than nothing; a single-segment wheel is always its own winner.
- `morphs`: keyframe interpolation at boundaries and midpoints; landing weights
  resolved from scheduled morphs match the geometry actually rendered at
  landing; a segment morphing to zero is never selected; a segment morphing to
  full weight is always selected.
- Live re-targeting: an existing winner with nonzero landing weight is retained,
  one with zero landing weight is replaced, and the recomputed target angle maps
  back to the winner under the new geometry.
- `control`: arming is consumed exactly once, then cleared.

Animation quality — including whether a live re-target is visually seamless —
is verified by eye, not asserted.

## Build order

1. `wheel` + `selection` + geometry, with hardcoded segments — funny on day one.
   Includes the degenerate cases (zero-weight, full-weight) from the start,
   since morphs depend on them being correct.
2. **Scheduled morphs** — the morph track, landing-weight resolution, and
   selection against the landing distribution.
3. `composer` + presets + `localStorage`.
4. Reveals, skins, near-miss.
5. Admin window + rig channel + **live-fired morphs** with in-flight
   re-targeting.
6. `meetRoster` source.

Scheduled morphs come second because live-firing is the same machinery plus
re-targeting; building the deterministic version first means the hard case has a
correct, testable foundation underneath it rather than being the first thing
attempted.

Meet integration is deliberately last: it is the riskiest piece, the least fun,
and the only one with an external dependency that may not cooperate. Everything
that makes the app enjoyable works standalone before Google is involved.
