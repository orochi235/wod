# wod wedge sources — design

Date: 2026-08-03
Status: approved, not yet implemented
Builds on: `2026-07-29-wod-design.md`, `2026-07-30-wod-editor-design.md`,
`2026-08-01-scripted-spins-design.md`

## Summary

The wheel gains three **kinds** of wedge and composes them into one
heterogeneous list:

- **External** — items from a data-driven feed. A Google Meet roster is one
  such feed, but the contract knows nothing about meetings or people.
- **Static** — wedges authored in the editor. "Spin again", "free beer",
  a hand-typed name. This is what `Preset.segments` already holds.
- **Computed** — wedges contributed procedurally by tricks. This already
  exists, via `Recipe.provides`.

This is the parent spec's `sources` + `composer` layer, re-cut around wedge
provenance rather than around named sources.

**`Segment` does not change. Neither does the wheel.** Not one field. Every
mechanism below sits upstream and hands the wheel exactly the `Segment[]` it
takes today. That constraint is the point: the wheel has never known where a
wedge came from, and adding a third origin is not a reason to teach it.

Scope is the composition layer plus one working feed — a **simulated meeting**
that runs in the editor. Google Meet stays deferred to a later, small adapter.

## Goals

- One flat wheel built from three heterogeneous contributors.
- A feed contract narrow enough that a roster, a ticket list, and a lunch
  rotation are all the same thing.
- Per-item customization of external wedges that survives the feed refreshing
  and the person leaving the room.
- Tricks and branches that can aim at external wedges without knowing their ids
  at authoring time.
- A simulated meeting good enough to develop and rehearse against with no
  Google dependency.

## Non-goals

- **The Meet adapter.** OAuth PKCE, polling, and the liveness probe stay where
  the parent spec put them: last. This design's job is to make that adapter
  small when it arrives.
- **Per-kind weight budgets.** Weights remain one flat relative pool,
  normalized at render, exactly as today. A joke wedge drifts as the roster
  grows, and the operator compensates by hand.
- **Round state.** Draw removal, pick-N, and full-ordering are not in scope, so
  there is no round to freeze a feed against. Repeat-avoidance goes with them:
  it reads a draw history that does not exist yet.

## Data model

### The feed contract

```ts
/** One item from an external feed. The feed owns identity and label; nothing else. */
type FeedItem = { id: string; label: string }

type Feed = {
  id: string
  subscribe(cb: (items: FeedItem[]) => void): Unsubscribe
}
```

`FeedItem` is deliberately two fields. Everything visual about an external
wedge comes from the feed's defaults or from an override. A feed that returns
Jira tickets works unmodified, which is what makes "genericized external list"
true rather than aspirational.

`id` must be stable across polls for the same real-world entity, because it is
the override key. That is a requirement the design places *on feeds*, not a
property it can verify.

A feed is configured, not just subscribed to:

```ts
type FeedDefaults = {
  weight: number          // default 1
  color?: string          // absent → palette-assigned, as for any segment
}

type FeedConfig = SimulatedFeedConfig   // a union of one, for now

type FeedConfigBase = {
  id: string
  defaults: FeedDefaults
  /** Static segment id this feed's block is placed after. Absent → after all statics. */
  insertAfter?: string
}
```

Every concrete feed config extends `FeedConfigBase`. `FeedConfig` being a union
of one is deliberate: the second member is the Meet adapter, and the shape
should be ready for it without inventing it now.

### Overrides

A sparse overlay on the preset, keyed by `FeedItem.id`:

```ts
type ItemOverride = {
  excluded?: boolean
  label?: string
  weight?: number
  color?: string
  media?: Media
  reveal?: Reveal
}
```

An absent field means "use the feed default". `excluded` is how the notetaker
bot and the perpetual observer are kept off the wheel — it replaces the parent
spec's separate exclusion list, since an exclusion is just an override that
happens to be a boolean.

Overrides persist for items that are not currently present. That is the whole
point: Ana's custom reveal waits for her to join. They are pruned only by
explicit operator action, never automatically, because automatic pruning would
delete a joke the first week its target takes a vacation.

### Provenance is derived, never stored

```ts
type Origin =
  | { kind: 'static' }
  | { kind: 'external'; feedId: string; itemId: string }
  | { kind: 'computed'; trickId: string }
```

`Origin` is computed from *which list a wedge came from*, never read off the
segment. This extends a decision the codebase already made: `wedgeOwners()`
derives computed-wedge ownership from the trick list rather than storing it on
the segment. Storing provenance would let it drift — an imported preset could
claim a static wedge is external, and nothing would catch it.

### Composition

A new pure function runs *before* the existing trick resolution:

```ts
composeBase({ statics, feeds, overrides }) → { segments: Segment[], origins: Map<string, Origin> }
```

`resolveTricks` then runs unchanged on its output, appending computed wedges and
filling in the remaining origins. The pipeline gains one step in front of an
untouched one:

```
statics + feed items + overrides → composeBase → resolveTricks → Segment[] → wheel
```

**Id namespacing.** External wedge ids are `${feedId}:${itemId}` — matching the
existing `${trickId}:wedge` convention for computed wedges. Statics remain
`seg1`, `seg2`, and whatever the operator authored.

**Ordering.** Statics in authored order, then each feed's items in feed order,
then computed last. A feed carries an optional `insertAfter?: string` naming a
static segment id, placing that feed's block immediately after it.

Ordering is not cosmetic: the parent spec's near-miss decoy defaults to the
segment immediately preceding the target, so adjacency is load-bearing for a
real feature. `insertAfter` exists so the operator can drop the roster between
"spin again" and "free beer" rather than always after both.

**Weights** stay one flat relative pool, normalized at render. Nothing about
weight math changes.

## Selectors

Tricks and branch conditions reference wedges by concrete `segmentId` today —
`targets: string[]` on relabel, vanish, and recolor; `Condition.segmentIds` on
branches. External wedges do not exist at authoring time and their ids churn, so
both need late binding.

**Selectors are reserved `@`-prefixed pseudo-ids inside the existing arrays.**
The vocabulary is small and closed:

```
@all  @static  @external  @computed  @randomExternal
```

`targets: ['@external', 'seg2']` reads as "every attendee, plus the spin-again
wedge". One shared `resolveTargets(ids, ctx) → string[]` expands them, dedupes,
and drops tokens it does not recognize.

Semantics, stated so they cannot be read two ways:

- `@all` is exactly `@static` ∪ `@external` ∪ `@computed`.
- Every token resolves over **wedges on the wheel**. An excluded item is not a
  wedge — `composeBase` never emits one — so `@external` cannot reach it.
- Weight is irrelevant to resolution. A wedge sitting at weight 0 is still on
  the wheel and still selected by these tokens; that is what makes a trick able
  to grow one.

The alternative — a proper `Selector` union replacing those arrays — was
rejected. It is a migration that has to reach *inside* recipe params, which are
`Record<string, unknown>` and recipe-defined. Migration code that knows what
every recipe stores is precisely the coupling the recipe registry exists to
prevent. The pseudo-id form also composes with concrete ids, which the union
would need an extra `union` node to express. Id generation never emits `@`, so
collision with a real id is unreachable.

This is a deliberate trade of type rigor for a much smaller blast radius. If a
selector ever needs a parameter (`@randomExternal` with a count, say), that is
the signal to graduate to a union — not before.

### Where selectors resolve

Against the segment list *after* pass 1 of `resolveTricks` (`provides`) and
before pass 2 (`resolve`) — which is exactly where `RecipeContext.segments`
already sits. The existing two-pass ordering already solved this problem;
selectors only consume it.

### `@randomExternal` draws from the frozen roll

`resolveScriptedSpin` freezes one rng roll for the entire branch walk, so that
"every change in winner is caused by a modifier". `evaluateWheel` runs once per
branch depth, so a fresh draw per pass would mean enabling a trick at depth 2
silently reshuffles which attendee an unrelated trick picked — the exact failure
the frozen roll exists to prevent.

`@randomExternal` therefore resolves as `candidates[floor(roll * candidates.length)]`
using that same frozen roll. Deterministic, stable across depths, no extra state
to thread.

### No `@winner` for tricks

Morphs determine landing weights, which determine the winner. A trick keyed on
the winner is circular for any weight-touching recipe. Branch conditions do not
need it — `landsOn` *is* the winner test — and the deferred flip trick is
post-landing, so it can have one later without inheriting this contradiction.

### Empty resolution is not an error

`Recipe.validate()` currently returns a hard "this trick cannot run" reason,
which the editor renders as a conflict badge. A selector resolving to zero
external wedges is the normal state while authoring offline with no meeting
running. **Empty external resolution is a no-op with a soft hint, never a
validation failure.** Otherwise every preset looks broken until a meeting
starts.

## Feeds at runtime

**Feed config persists; feed items never do.** The preset stores *how* to get a
roster (`feeds: FeedConfig[]`), so it exports and imports with the joke. The
items themselves travel on a `BroadcastChannel('wod:feed')` carrying
`{ feedId, items }`, and live in React state only.

Attendee names never reach `localStorage`. The parent spec's entire pitch to a
Workspace admin is that names are read by the browser and stay there; writing
them into persistent storage under a well-known key weakens that sentence for no
gain. It also means the simulator and a future Meet poller share one transport
with no special-casing.

Note that `subscribePreset` rides the `storage` event, not `BroadcastChannel` —
the feed bus is a genuinely separate channel, not an extension of the existing
one. Its shape mirrors `subscribePreset`'s: a `publishFeed(feedId, items)` and a
`subscribeFeed(cb): Unsubscribe`.

**One window owns the clock.** The editor window runs the simulation — and
later, the poller, since it is the window holding the OAuth token anyway. The
wheel window is a pure consumer that renders whatever arrives. With the editor
closed, the roster freezes at its last published state, which is a
comprehensible failure rather than two windows fighting over who churns.

## The simulated meeting

`feeds/simulated.ts` implements the same `Feed` interface a real source would.

```ts
type SimulatedFeedConfig = FeedConfigBase & {
  kind: 'simulated'
  pool: string[]                  // names available to join
  autochurn: { intervalMs: number; targetSize: number; volatility: number }
}
```

Item ids are derived from the pool name, slugified and deduped, so the same
name always produces the same id and overrides survive a leave and rejoin.

`pool` and the autochurn parameters are authoring, so they persist in the
preset. Who is currently "in the room" is session state, seeded empty and never
written to storage — the same rule as any other feed's items.

The editor panel offers:

- the name pool, editable as a list;
- the present roster, with add and remove per name (hand control, for
  reproducing a specific moment);
- a run toggle plus rate controls (autochurn, for finding the races nobody
  thought to write a test for).

Each autochurn tick pulls the roster toward `targetSize` by joining or leaving
one person; `volatility` sets how eagerly it keeps churning once already at
size. When `targetSize` exceeds `pool.length` the roster saturates at the pool
and stops joining rather than duplicating names.

## The overrides surface

Overrides must be editable for people who are not currently present, or Ana's
reveal can only be written while Ana is in the room.

The panel lists **present items first**, then a **known** section holding every
id with a saved override that is not currently present, each with a delete
control. Deleting is the only way an override goes away.

## Persistence

`Preset` gains two fields and bumps to version 3:

```ts
type Preset = {
  version: 3
  name: string
  segments: Segment[]                        // statics
  feeds: FeedConfig[]
  overrides: Record<string, ItemOverride>
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
}
```

`readFeeds` and `readOverrides` join the existing defensive parsers with the
same posture: malformed entries are dropped, never thrown on. v1 and v2 migrate
by adding `feeds: []` and `overrides: {}`; the existing v1 spin migration is
untouched.

Selectors need no migration at all, being ordinary strings in arrays that
already hold strings.

## The landing-tableau hazard

When the animation finishes, `useSpin` sets `displaySegments` to `plan.landing`
— the morphed payoff, free beer filling the circle. The resync effect then fires
on the next render and replaces it with the current composition.

Today this is rare: `resolved.segments` only changes identity when the preset
changes. **With a live feed it becomes certain** — any join or leave during a
4.5-second spin changes the composition, so the punchline is wiped the instant
it lands. Commit `5a7ce86` fixed this class of bug once from the editor side;
live feeds reopen it from a new direction.

Fix: widen the resync gate from "is spinning" to "is spinning **or** showing a
landed result", releasing the held swap when the next spin starts or the reveal
is dismissed. The pending-swap mechanism already in that effect — which
deliberately does not advance `lastSegmentsRef` while blocked — does the rest.

## Feed churn timing

Churn between spins applies immediately; the wheel always shows who is in the
room right now, which the parent spec calls non-negotiable.

Churn *during* a spin is queued, not dropped, and applies once the wheel is at
rest and the result released. This needs no new work in the wheel layer:
`useSpin`'s resync effect already refuses to swap segments mid-spin for exactly
this reason ("that would wipe the landed state, which is the whole visual
payoff when weights morph"). The only change is the widened gate above.

The segment array therefore still never changes mid-spin, and geometry stays
continuous.

## Error handling

Extending the parent spec's rule that the wheel never breaks the bit:

- **No editor window, or a feed that never publishes** → empty item list; the
  wheel shows statics only. The editor shows a banner; the wheel shows nothing.
- **Duplicate ids within a feed** → first wins, mirroring `readSegments`.
- **A static segment id colliding with an external one** → `composeBase`
  dedupes the merged list statics-first, so the static wedge wins. A repeated id
  would otherwise make the pointer and the announced winner disagree.
- **Override weight non-finite or negative** → treated as zero, matching the
  existing rule.
- **Every external item excluded and no statics** → the existing empty state
  and disabled Spin button.
- **A selector resolving to nothing** → the trick no-ops with a soft hint.
- **A `forced` target naming someone who left** → already handled: `forced()`
  degrades to a fair draw.

## Data flow

```
feeds ──BroadcastChannel──┐
statics + overrides ──────┼─► composeBase ─► { segments, origins }
                          │        │
                          │        ▼
                          └─► resolveTricks (provides → @selectors → resolve)
                                   │
                                   ▼
                          landingSegments ─► winner ─► branch walk ─► wheel
```

## Testing (Vitest)

- `composeBase`: ordering including `insertAfter` placement; override
  application field by field; exclusion; statics-first dedupe; origin-map
  fidelity for all three kinds.
- Selectors: each token's expansion; `@` tokens composing with concrete ids;
  `@randomExternal` returning the same candidate across branch depths under a
  frozen roll; empty external resolution producing a no-op rather than a
  validation failure.
- Storage: v1 and v2 migrating to v3; malformed feed and override entries
  dropped without throwing; overrides for absent ids preserved across a
  round-trip.
- Simulator: autochurn converging toward `targetSize`; saturation when
  `targetSize` exceeds the pool; puppet add and remove.
- Feed bus: publish and subscribe across windows.
- Integration: a roster change mid-spin neither disturbs the in-flight
  animation nor wipes the landing tableau, and applies once the wheel is at
  rest.

## Build order

1. `Feed` / `FeedItem` types, `composeBase`, and the origin map — pure and
   tested, wired into `App` against a hardcoded item list.
2. Storage v3: `feeds`, `overrides`, defensive parsers, migration.
3. Feed bus, the simulated feed, and its editor panel.
4. `@` selectors, `resolveTargets`, the editor's multi-select entries, and soft
   validation.
5. The overrides surface.

Step 1 is deliberately first and feed-free: composition is the piece everything
else depends on, and it is fully testable before any transport exists.

## Noted, not scoped

**The flip trick.** When the wheel stops, the winning wedge flips over in place
and reveals a different item written on its back.

It lands cleanly in this model rather than fighting it: a `flip` recipe
`provides()` a weight-0 back-face wedge — an ordinary computed wedge — and the
landing reveal renders that wedge's face instead of the winner's. No new wedge
kind, no wheel-geometry change; the flip is a reveal-time transform over a wedge
that already exists. And because "what's on the back" can be a selector,
*flip to a random attendee* falls out of `@randomExternal` for free.

It is also the one place a `@winner` selector would be coherent, being strictly
post-landing. That does not license one for ordinary tricks, where it stays
circular.
