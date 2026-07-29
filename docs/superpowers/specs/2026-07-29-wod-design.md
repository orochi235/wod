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

### 1. `wheel` — presentation core

Renders and animates. Knows nothing about people, meetings, or who should win.

- One SVG `<g>` rotated via the Web Animations API. Segments are `<path>` arcs
  sized by normalized weight. Pointer is fixed at 12 o'clock.
- Given a `targetSegmentId`, it computes the final rotation and animates there,
  then emits `onLanded(segmentId)`. It never chooses a winner.
- **Landing jitter:** the final angle is randomized *within* the winning arc
  rather than snapping to the arc's midpoint. Without this, every spin ends dead
  center and repeated viewing reveals that the outcome is precomputed — which
  would expose rigged spins.
- **Long-label fitting:** shrink font → radial wrap → truncate with full text in
  the reveal. Required so narrow slivers stay legible.
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

## Data flow

```
sources → composer → Segment[] → wheel (render)

[spin pressed]
  → armed rig ? forced(id) : weightedRandom
  → targetSegmentId
  → wheel animates (optionally via near-miss)
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

**Open verification item:** it is not confirmed that the scope granting
`conferenceRecords.participants` is distinct from the one granting
`conferenceRecords.transcripts` and `.recordings`. If Google bundles them under
a single `meetings.space.readonly`-style scope, then "this app cannot read
transcripts" is not enforceable at the OAuth layer and must instead rest on
points 1–4 above. This is resolved before the `meetRoster` source is built, and
the answer is stated plainly to the admin either way — the pitch must not
overclaim what the scope actually restricts.

If the bundled-scope case turns out to be true and is a blocker, the fallback is
to drop the Meet API entirely and populate the wheel from the Calendar event's
invitee list (a narrower, better-understood permission) or from manual paste.

## Risk: live Meet roster

It is not confirmed that the Meet REST API returns a *live* participant list
mid-meeting, as opposed to one that only settles once the conference record
closes. This is verified before the `meetRoster` source is built (it is last in
the build order, so nothing else waits on it).

Mitigation if it disappoints: `meetRoster` degrades to a one-shot fetch or drops
out entirely, and `manualList` covers the gap. Because sources share one
interface, no other module changes.

## Error handling

The wheel never breaks the bit:

- Meet API unavailable, scope denied, or caller lacks access → the source emits
  an empty array and the shell shows a banner. Manual entry still works. The
  wheel is never blocked.
- A rig targets a segment that no longer exists (that person left) → silently
  falls back to a fair spin. No on-screen error mid-joke.
- Zero segments → spin control disabled with an explanatory empty state.
- Weights summing to zero, or any non-finite weight → fall back to equal weights.

## Testing (Vitest)

- `selection`: weight fidelity over many draws (statistical bounds); `forced`
  always returns its target; cumulative-boundary edge cases (first segment, last
  segment, zero-weight segment).
- `composer`: merge, exclusion filtering, draw removal with renormalization,
  repeat-avoidance modifier math.
- **Wheel geometry: `angleToSegment` is the exact inverse of `segmentToAngle`.**
  This is the highest-value test — the failure it catches is the pointer landing
  visually on a different slice than the one reported as the winner.
- `control`: arming is consumed exactly once, then cleared.

Animation quality is verified by eye, not asserted.

## Build order

1. `wheel` + `selection` + geometry, with hardcoded segments — funny on day one.
2. `composer` + presets + `localStorage`.
3. Reveals, skins, near-miss.
4. Admin window + rig channel.
5. `meetRoster` source.

Meet integration is deliberately last: it is the riskiest piece, the least fun,
and the only one with an external dependency that may not cooperate. Everything
that makes the app enjoyable works standalone before Google is involved.
