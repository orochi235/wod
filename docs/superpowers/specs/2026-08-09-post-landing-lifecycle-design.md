# After the wheel stops

Date: 2026-08-09
Status: approved, not yet implemented
Builds on: `2026-07-29-wod-design.md`, `2026-08-07-winner-swap-design.md`

Everything wod does today is a pure function of the preset, the feed items, and
a frozen roll. The wheel turns, it lands, and the app prints a name in a
paragraph. This spec covers what happens *after* that — the first genuinely
stateful, temporal thing in the product, and the seam that four more will hang
off.

It defines the landing signal, the reveal overlay that consumes it, and the
place draw history will attach. It is for whoever builds the reveal, and for
whoever later builds round state and needs to know where their write goes.

## What this is not

- **Round state.** Draw removal, pick-N, full-ordering, and repeat-avoidance
  stay deferred. This spec names where their history comes from and stores
  nothing.
- **Sound and confetti.** `Reveal.sound` and `Reveal.effect` are parsed and
  preserved, never acted on. Audio needs an asset story that fights the CSP the
  security pitch rests on, and confetti wants a particle renderer. Both are
  additive later and neither touches the seam.

## The landing signal

`useSpin` currently exposes two ways to learn who won, and both are wrong.
`onLanded(winnerId)` has no consumers anywhere in the tree. The returned
`winnerId` is a bare string, so `App` looks the segment back up in
`displaySegments` to get a label — because with a swap in play the drawn
identity and the announced one differ, and only the landed frame has the latter.

Both are replaced by one value:

```ts
export type Landing = { id: number; winner: Segment }
```

`useSpin` returns `landing: Landing | null`. It is `null` from the moment a spin
starts until that spin resolves.

`winner` is read out of the landed frame, not out of `plan`. That is what makes
the swap correct by construction rather than by a consumer remembering to do the
lookup.

`id` is a counter incremented once per resolved spin. It exists because **the
same segment can win twice in a row, and the second win must reopen a reveal
that was dismissed after the first.** Keyed on `winner.id`, the second landing
is indistinguishable from the first and the punchline silently fails to fire.
Keyed on a counter, it cannot.

The hook loses state on balance: the existing `landed` boolean that guards the
segment-resync effect becomes `landing !== null`.

## `reveal/`

A module beside `wheel/`, `tricks/`, and `feed/`:

```
src/reveal/
  useReveal.ts   the state machine
  Reveal.tsx     the overlay
  Reveal.css
```

```ts
function useReveal(landing: Landing | null): {
  shown: { segment: Segment; reveal: Reveal } | null
  dismiss(): void
}
```

The machine holds one piece of state — the last dismissed `Landing.id` — and
derives everything else:

- A `landing.id` newer than the dismissed one opens the overlay, **but only if
  `landing.winner.reveal` exists**. A segment without one raises nothing.
- `dismiss()` stores the current id. No re-render reopens it.
- `holdMs > 0` arms a timer that calls `dismiss()`. Cleared on manual dismissal
  and on unmount.
- `landing` going `null` — a new spin — closes the overlay and clears the timer.

A single scalar suffices rather than a set of dismissed ids, because landing ids
only ever move forward.

`shown.segment` is a snapshot taken when the overlay opened. A preset edit
arriving from the editor window mid-display does not rewrite a punchline while
it is on screen.

## Dismissal

The overlay covers the wheel and takes focus. **Click or Escape dismisses it
immediately, always, including during a hold.** `holdMs` is an additional
auto-dismiss, never a lock.

The wheel is on a screen share. An overlay that refuses to close is a hostage
situation when a gag misfires, and there is no recovery that is not visible to
the room.

Spin is unreachable while a reveal is up, so no reveal can ever narrate a winner
the wheel has already spun past. Absent, zero, negative, and non-finite
`holdMs` all mean manual dismissal.

## Not every landing overlays

Only a segment with an authored `reveal` raises one. Everything else keeps
today's quiet result line.

This contradicts the parent spec, which says a segment with no reveal gets a
default takeover showing its label. Under that rule a standup that spins eight
times costs eight dismissals, and an overlay that appears every time stops
signalling anything. Making it an authoring act means its appearance is itself
part of the joke.

**Superseded for the banner, not for the reveal.** `banner/` now does spell
every winner out, in extruded type over the page, held until it is clicked — the
default takeover this section argued against, restored because it is the win
itself rather than a punchline. The reveal stays authored, and stays second: it
opens only once the banner has been dismissed.

## Rendering

Headline defaults to the segment's label. Body is optional. Media renders by
kind: `emoji` as text, `image` and `gif` as `<img>`. A media element that fails
to load is suppressed and the text still renders — the bit does not break
because a URL rotted.

Styling lives entirely in CSS classes, and the overlay is **not tinted by the
segment's color**. Passing a per-segment color into an HTML overlay would take
an inline custom property, and the wheel is no precedent for it — it colors arcs
with the SVG `fill` attribute, not with CSS variables. A reveal that needs to
look different is a CSS change, not a data-driven one.

Under `prefers-reduced-motion` the overlay appears without a transition.

## `reveal` becomes morphable

`MorphKeyframe` is `{at, weight, color, label, media}`. `swap` trades `label`
and `color`. So the wedge that won wears another wedge's name while still
holding its own `reveal`, and the overlay fires the wrong punchline under the
right name — in the one trick most likely to have an authored reveal.

`MorphKeyframe` gains `reveal?: Reveal | null`, picked at a keyframe and never
interpolated, as `label` and `media` already are. `swap` trades it alongside the
other two, and `Write.property` gains `'reveal'` so the editor's conflict badge
still catches two tricks writing it.

**The `null` is load-bearing.** If the wedge being traded with has no reveal,
the winner must end up with none either — otherwise it wears another identity
and still fires its own punchline, which is the bug this section exists to fix.
An optional field cannot say that: the samplers skip `undefined` keyframes, so
`reveal: undefined` reads as "this keyframe does not touch reveal" rather than
"clear it". `null` is the explicit clear, and it is why `reveal` gets its own
sampler instead of joining `label` and `media` in the shared discrete one, whose
`NonNullable` filter would strip exactly the value that carries the meaning.

An empty `{}` is *not* a clear. It is a reveal with no authored content, which
renders as an overlay showing the segment's label — a legitimate thing to
author, and the reason the clear needs a distinct value at all.

This does not weaken the rule the swap spec established. That rule is **no
winner-keyed *weight* writes** — weight moves the arcs, and a recipe that moves
arcs in response to the winner chases its own tail. `reveal` is inert to
geometry, in the same category as label and color.

## Storage and authoring

`readSegments` and `readOverrides` parse `reveal` and `media`, which they
currently skip on the stated grounds that nothing renders them. Parsing is
defensive in the existing posture: an unrecognized media kind is dropped, a
non-finite `holdMs` is dropped, an unknown `effect` falls back to `'none'`.

No `Preset` version bump. Both fields were already on the types and were never
written, so every stored v3 preset parses identically.

A reveal editor goes in the segment panel, and in the overrides panel so an
external wedge can carry a gag that outlives the person leaving the room.
Fields: headline, body, media kind and value, `holdMs`. `sound` and `effect`
are not surfaced while nothing honors them.

Authoring is in scope deliberately. The rig target and the branch tree are both
fully built, persisted, and tested, and neither has any editor UI — they are
reachable only by hand-editing preset JSON and importing it. A third feature in
that state is not worth shipping.

## Draw history

**This section specifies a future write and builds nothing.** No record is
created, stored, or read by this work.

When it is built, the write point is an effect keyed on `landing.id`, alongside
the reveal — the same seam, validated by the reveal consumer, so history arrives
as a second consumer of an established one rather than a new seam of its own.

The record is `{ segmentId: string, at: number }`, and `segmentId` is the
**drawn** id, not the swapped-to identity — history answers "who did the wheel
actually pick", which is the question draw removal and repeat-avoidance both
need.

When round state ships, this persists **outside `Preset`**, keyed per preset.
The parent spec puts a `history` field on `Preset` itself; that predates the
preset becoming both a shareable export and a bus-synced document. Inside
`Preset`, exporting a joke to a colleague ships a log of who got picked in your
meetings, and every landing rebroadcasts the entire preset to the editor window.

Nothing is stored until there is a reader.

## Error handling

- Winner has no `reveal` → no overlay, today's result line.
- Media fails to load → overlay renders headline and body without it.
- A reveal is open when the preset changes → the snapshot holds.
- A reveal is open when the component unmounts → timer cleared, no state write.

## Testing

`useReveal`
- Opens on a new landing id; stays closed for a segment with no `reveal`.
- Does not reopen after dismissal on any number of re-renders.
- **The same segment winning twice raises the overlay twice.** This is the
  regression the counter exists to prevent.
- `holdMs` auto-dismisses; a manual dismissal first cancels the timer.
- A new spin closes an open overlay.

`useSpin`
- `landing` is null while spinning and non-null once resolved.
- `landing.id` increments per spin.
- `landing.winner` is the landed-frame segment — under a swap, the traded
  label, not the drawn one.

`Reveal`
- Headline falls back to the segment label.
- Each media kind renders; a failed load leaves the text intact.
- Escape and click both dismiss.

`morph`
- `reveal` is picked discretely at a keyframe, never interpolated.
- `swap` trades `reveal` with `label` and `color`, and the landed frame carries
  the traded one.
- The registry-wide invariant test still passes: no recipe writes weight keyed
  on the winner.

Integration
- Spin is disabled while a reveal is up.
- A plain segment raises no overlay.

`storage`
- `reveal` and `media` round-trip through save and load.
- Malformed media kind, `holdMs`, and `effect` are each dropped without taking
  the rest of the segment with them.
