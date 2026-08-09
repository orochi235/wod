# The swap

Two wedges trade identities in the last instant before the wheel lands. The
pointer comes down on the wedge that was about to win, and it is now somebody
else.

## What trades

**Labels and colors, never weight.** The wedges keep their arcs; they exchange
who they are. That is not a compromise to make the implementation easier — it is
what makes the trick possible at all, and the reasoning is worth stating
plainly.

The design doc for wedge sources rules out a winner-keyed trick, but read the
sentence: *"A trick keyed on the winner is circular for any weight-touching
recipe."* Weight determines the arcs, the arcs determine where the pointer
lands, and the landing determines the winner — so a recipe that moves weight in
response to the winner is chasing its own tail. A recipe that only repaints
cannot move the pointer. The rule stands; it just has a sharper edge now:

> **No winner-keyed weight writes.**

Enforced by a test over every registered recipe, not by a comment.

## No `@winner` token

The obvious implementation is a new selector token, and it is the wrong one.
Tokens live in one shared list that `RecipeForm` offers in every `segments`
field, so `@winner` would immediately be selectable in `vanish` — which writes
weight. The invariant above would be one operator click from violation, and the
only defense would be a per-recipe allowlist of tokens: machinery that exists to
guard a door we do not have to open.

Instead, `RecipeContext` gains a field:

```ts
type RecipeContext = {
  // …
  /** Null everywhere the winner is not yet known, which is most places. */
  winnerId: string | null
}
```

Recipes that do not care ignore it. `SELECTOR_TOKENS` does not change, and the
five existing tokens keep meaning exactly what they mean.

## Two passes, self-enforcing

`resolveTricks` runs before `planSpin`, so a recipe cannot read a winner that
has not been drawn. The fix is not to reorder — it is to resolve twice.

```
pass 1   winnerId = null   swap emits nothing
                           → planSpin draws a winner from a winner-free wheel
pass 2   winnerId = <it>   swap emits its morphs
                           → the resulting list replaces pass 1's
```

Every other recipe ignores `winnerId`, and both the selection roll and the
selector roll are already frozen for the whole resolution, so pass 2 reproduces
pass 1 exactly plus the swap. Nothing else can drift between them.

This is why the invariant matters mechanically and not just philosophically: if
a winner-keyed recipe wrote weight, pass 2 would produce a landing distribution
that `planSpin` never saw, and the pointer would come to rest somewhere the plan
did not predict.

## Where pass 2 runs

In `useSpin`, for both windows.

`SpinOverride` gains a hook:

```ts
resolveLate?: (winnerId: string) => Morph[]
```

Called after `planSpin` returns and before `rotor.animate` starts. The returned
morphs **replace** the config's, **and the landed frame is recomputed** from
them — `planSpin.landing` was sampled from pass 1 and still shows the pre-swap
labels. Landing on the un-swapped frame would undo the trick at the exact moment
it is supposed to fire.

Replacement rather than appending, because the hook returns a whole second
resolution rather than a delta: pass 2 re-runs every recipe, so appending would
double every morph the swap did not author. Returning only the new ones would
mean teaching the resolver to diff itself, for an identical result — pass 2
reproduces pass 1 exactly plus the swap, which is what the equivalence test in
`spin/resolve.test.ts` holds.

Putting the seam here rather than in `App` is what lets the editor rehearse the
gag, and it is also *more correct for the show window*: `App` knows
`resolution.winnerId` up front, but it hands `planSpin` a `forced()` strategy
that deliberately degrades to a fair draw if that segment's arc collapsed. The
hook sees the winner that actually happened.

## What the operator sets

A `swap` recipe, registered like any other:

| Field | Kind | Meaning |
|---|---|---|
| `otherWedgeId` | `segment` | The wedge that trades with the winner |
| `at` | slider 0..1 | When the trade fires, default `0.95` |

`segment` is the single-valued field kind, so the picker offers one wedge and
writes a bare id — including roster wedges, which the parser now accepts.

## Emitting the morphs

Two morphs, one per wedge, mirror images of each other. For the winner `W`
trading with the chosen wedge `O`:

```ts
keyframes: [
  { at, label: W.label, color: effectiveColor(segments, W.id) },
  { at, label: O.label, color: effectiveColor(segments, O.id) },
]
```

Three details, each load-bearing:

**The duplicate `at` is how it snaps.** `bracket` returns `t: 1` for a zero-span
pair, so color jumps rather than blends. Give the two keyframes different
offsets and `sampleColor` fades between them — a tell that shows the audience
the switch coming. This relies on `Array.prototype.sort` being stable, which the
language guarantees and a test now pins, because the failure mode is a swap
that fires backwards.

It also relied on something that was *not* true when this was written:
`bracket` tested `p <= first.at` before `p >= last.at`, so a pair sharing one
offset resolved to the value being traded away from at exactly that instant.
Harmless mid-spin, but at `at: 1` that instant is the landing frame, and a wedge
whose color came from the palette — no base to prepend, so the pair sat first —
landed with its label traded and its color stale. The guards are now ordered the
other way, so a tie goes to the later keyframe, agreeing with the `span === 0`
branch that already prefers `to`.

**Each morph opens with the wedge as itself, and that keyframe is only half
redundant.** `withImplicitBase` prepends the wedge's current value when the
first keyframe starts after 0, which for the *label* already holds the wedge as
itself across the first half — a label is never undefined, so the base is always
prepended, and `sampleStep` takes the last point at or before the sampled
instant. For the *color* it is load-bearing: without an explicit opening
keyframe, a wedge with a base color would lerp continuously from that base to
the traded value across the whole run-up instead of holding and then jumping —
and a palette-colored wedge, which prepends no base at all, would wear the
traded color from `t = 0`. Written once for both, correct for both.

`withImplicitBase` only fires when the base is defined, which leads to:

**`effectiveColor`, not `segment.color`.** A wedge with no explicit color takes
one from the palette, and `segment.color` is `undefined` for it. Passed straight
through, the color half of the swap silently does nothing while the labels trade
— the wedges end up wearing each other's names in their own colors, which looks
like a rendering bug. `takeover` already reaches for `effectiveColor` for this
exact reason.

## Edges

- **No winner yet** (`winnerId === null`): emit nothing. This is the editor
  while scrubbing, and it is the spec's existing rule — an unresolvable
  selection is a no-op, never a validation failure.
- **The chosen wedge is the winner**: emit nothing. Trading a wedge with itself
  is a no-op that would otherwise produce two contradictory morphs on one id.
- **The chosen wedge is gone** (deleted, or a roster member who left): emit
  nothing. `validate` reports it through the `WedgeIndex`, which accepts a
  roster wedge that has not arrived yet and rejects an id nobody can produce.
- **The winner is not on the wheel**: emit nothing. Defensive rather than
  reachable — `plan.winnerId` is always drawn from the segments pass 2 itself
  resolves over, and `forced()` degrading still yields an id on that same
  wheel, so the hook can never be handed a winner missing from `ctx.segments`.
  The guard stays; the case cannot occur through either window.
- **Nothing chosen**: `validate` returns "no wedge chosen", matching
  `takeover`'s existing-wedge mode.

## Three consequences worth writing down

**The announced winner is the swapped-in name.** `App` reads the winner's label
out of `displaySegments`, which is the landed frame, which now carries the
traded label. The wheel and the announcement agree — they are the same frame.
That is the gag working, not a bug, and anyone reading the announcement code
later deserves to find it said so.

**Branches fire on the true winner.** `landsOn` conditions are evaluated inside
`resolveScriptedSpin`, against the id the pointer actually landed on, before the
swap exists. A branch watching for "lands on Ana" fires when the pointer lands
in Ana's arc, even though the wheel now says Ben there. This is the right
answer — the branch tree reasons about what happened, not about what the
audience was shown — but it is genuinely surprising and belongs in the docs
rather than in a debugging session.

**Conflict badging cannot see the winner half.** `findConflicts` calls `writes()`
with no winner, so the swap can only declare its claim on the chosen wedge. A
collision between the swap and another recipe writing the winner's label goes
unbadged. Consistent with the soft-hint rule and not worth inventing a
speculative winner to fix.

## Testing

- The recipe, pure: keyframes for a known pair; the labels step at `at` and not
  before; the colors snap rather than blend; a palette-colored wedge still
  trades color.
- Each edge above returns no morphs — separately, since they fail differently.
- **The invariant, across the registry**: no recipe that reads `winnerId` emits
  a `weight` write. This is the guard on the whole design and should name the
  rule in its failure message.
- Two-pass equivalence: pass 2 reproduces pass 1's non-swap morphs exactly, and
  the landing weights are identical between them.
- `useSpin`: `resolveLate` is called with the drawn winner, its morphs reach the
  animation, and the landed frame carries the swap.
- End to end: a spin whose landing frame announces the traded name.

## Not in this design

Set aside deliberately, and worth keeping on the shelf:

- **Two named wedges trade**, with no winner involved. Simpler, needs no context
  field — but on a fair spin it may trade two wedges the pointer never visits,
  so the joke fires and nobody sees it. Useful once forced targets are common.
- **Trade with whoever is under the pointer**, framed geometrically rather than
  as "the winner". Identical outcome today, but it would need `landingTurn` in
  `RecipeContext`, which `planSpin` computes after resolution — a pipeline
  reorder for a second way to say the same thing.
- **Trading media, or a reveal.** `MorphKeyframe` already carries `media`, so
  the swap could trade avatars too. Left out until the wheel renders media at
  all, matching the posture `readSegments` and `readOverrides` already take.
- **The editor's rehearsal and the show window can legitimately disagree.** The
  editor never calls `resolveScriptedSpin`, so branch modifiers are invisible
  to it, and its selector roll is a hardcoded `0` against the show window's
  frozen random draw — so a preset combining `@randomExternal` with a swap
  rehearses against a different wedge than it plays. Each window is
  self-consistent; they are not consistent with each other. A known limit, not
  a bug.
