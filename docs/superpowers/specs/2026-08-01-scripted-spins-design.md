# wod scripted spins — design

Date: 2026-08-01
Status: approved, not yet implemented
Builds on: `2026-07-29-wod-design.md`, `2026-07-30-wod-editor-design.md`

## Summary

A **scripted spin** is an authored unit that owns two things the wheel currently
decides on its own: *who wins* and *how the wheel travels to them*. On top of it
sits a **branch tree** — conditions of the form "if this spin would land on N,
do something else instead" — evaluated at plan time, before a single frame
animates.

This is possible only because of the parent spec's central bet: the winner is
chosen before the animation runs. The outcome is knowable up front, so branching
on it is deterministic. A physics-driven wheel could not do this at all.

Tricks are untouched. A recipe still resolves to `Morph[]` and still reaches only
`weight | color | label | media`. Scripted spins sit *above* tricks and switch
them on and off; they do not widen what a trick can do.

## Goals

- Author a spin as one unit: target, direction, curve, turns.
- Branch on the would-be outcome, with branches that replace the spin, patch it,
  or ask a further question.
- Keep `planSpin`, `useSpin`, and every recipe ignorant that branching exists.
- Terminate by construction. No preset should be authorable that fails to settle.
- Give counter-clockwise spins real support rather than a negated hack.

## Non-goals (v1)

- **Named, reusable spins.** Branches embed their replacement inline. Reuse is
  additive later; see Future work.
- **A predicate language.** One condition kind, `landsOn`. Conjunction is
  expressed by nesting, which the tree already gives us.
- **Live re-targeting mid-spin.** Resolution happens once, at spin time. The
  parent spec's live-fired morphs remain a separate, later concern.
- **Branch authoring UI.** This spec defines the model and resolution. The editor
  surface for building trees is its own plan.

## Core distinction: the spin is authored, the wheel is not

`SpinConfig` (`src/wheel/types.ts:40`) is what the wheel *consumes* — flat,
resolved, no conditionals. `ScriptedSpin` is what an operator *authors*.
Resolution compiles the second into the first.

That boundary is the whole reason this feature does not leak. `useSpin` receives
the same `SpinConfig` it receives today. `planSpin` receives the same four
arguments. Neither learns a new concept.

## Data model

```ts
export type Target =
  | { kind: 'fair' }
  | { kind: 'forced'; segmentId: string }

export type Motion = {
  durationMs: number
  turns: number
  direction: 'cw' | 'ccw'
  easing: string
}

export type ScriptedSpin = { target: Target; motion: Motion }

export type Condition = { kind: 'landsOn'; segmentIds: string[] }

export type SpinModifier = {
  target?: Target
  motion?: Partial<Motion>
  enableTricks?: string[]
  disableTricks?: string[]
}

export type BranchAction =
  | { kind: 'replace'; spin: ScriptedSpin }
  | { kind: 'modify'; modifier: SpinModifier }

export type BranchNode = {
  id: string
  when: Condition
  do?: BranchAction
  then?: BranchNode[]
}

export type Preset = {
  version: 2
  name: string
  segments: Segment[]
  tricks: Trick[]
  spin: ScriptedSpin
  branches: BranchNode[]
}
```

A node acts (`do`), descends (`then`), or both. `do` alone is a leaf; `then`
alone is pure routing; together it reads as "patch the spin, then keep asking
questions about the result." Sibling order is first-match-wins.

### Why `ScriptedSpin` does not contain `branches`

An earlier draft nested the tree inside `ScriptedSpin`, so a `replace` node
embedded a spin that carried its own branches. That gave two competing answers to
"what is the next level of the tree." Hoisting `branches` to the preset makes
`ScriptedSpin` a small value type and leaves exactly one owner of tree structure.

### Why trick enablement stays on `Trick.enabled`

`Trick.enabled` remains the baseline set; modifiers carry `enableTricks` /
`disableTricks` deltas against it. Moving activation wholesale into the spin
would be tidier on paper, but it breaks the editor's existing toggle and creates
two sources of truth during migration. Deltas leave `resolveTricks()`
(`src/tricks/resolve.ts:19`) untouched — it still receives a `Trick[]` and has no
idea conditionals exist.

## Resolution

```
resolve(segments, tricks, spin, branches, rng):
  roll   = rng()                      // once, for the whole resolution
  frozen = () => roll

  current = spin
  enabled = baseline enabled trick ids
  level   = branches

  repeat (guard: MAX_DEPTH = 32):
    active        = tricks where enabled
    {all, morphs} = resolveTricks(segments, active, current.motion.durationMs)
    landing       = landingSegments(all, morphs, current.motion.durationMs)
    winner        = strategyFor(current.target)(landing, frozen)
    if (!winner) return null

    node = level.find(n => n.when.segmentIds.includes(winner))
    if (!node) → settled

    apply node.do to current / enabled
    level = node.then ?? []

  → exhausted
```

`strategyFor` maps the target onto the strategies that already exist:
`{ kind: 'fair' }` → `weightedRandom`, `{ kind: 'forced', segmentId }` →
`forced(segmentId)`. No new selection code.

The result is a tagged union, not a bare value:

```ts
type Resolution =
  | { kind: 'settled';   winnerId: string; segments: Segment[]; morphs: Morph[]; motion: Motion }
  | { kind: 'exhausted'; winnerId: string; depth: number
                       ; segments: Segment[]; morphs: Morph[]; motion: Motion }

function resolve(/* … */): Resolution | null
```

Both arms carry `winnerId`: `exhausted` means the walk stopped descending, not
that it failed to pick anyone, and the downstream `planSpin` call needs a winner
either way. `null` is reserved for the one case where there is genuinely nobody to
pick — an empty wheel, or every arc collapsed — which is the same condition
`planSpin` already returns null for today.

### The roll is frozen

`weightedRandom` calls `rng()` exactly once (`src/wheel/selection.ts:18`), and
`forced()` does the same through its fallback. Re-rolling on each pass would move
the winner for reasons unrelated to the operator's modifiers: a node could fire on
a draw that no longer exists, and the same preset would resolve differently every
time it ran.

Freezing one roll for the whole resolution means **every change in winner is
caused by a modifier**. That is the only way a branch tree is readable by the
person who wrote it. A fresh `rng` is still used afterward for the landing jitter,
so repeated spins do not look mechanically identical.

### Resolution decides *who*; `planSpin` still decides *where*

The resolved winner re-enters the existing pipeline through the primitive that is
already built and tested:

```ts
planSpin(
  resolution.segments,
  { durationMs, fullSpins: motion.turns, easing: motion.easing, morphs: resolution.morphs },
  forced(resolution.winnerId),
  cryptoRng,
)
```

Arc math, the `EDGE_INSET` jitter, and the landing-turn calculation are unchanged.
`forced()`'s existing degradation — fall back to a fair draw when the target's arc
has collapsed (`selection.ts:37`) — becomes the safety net for a branch that
zeroes its own winner.

### The circularity dissolves

Tricks produce morphs; morphs change the landing distribution; the winner is drawn
from that distribution. An early draft of this design re-scanned the whole tree
after each modification, which made that loop genuinely circular — a modifier could
change the winner, which changed which rule fired, which changed the modifier.

A strict tree walk removes it. Evaluation only ever descends, so the last
iteration's landing is by definition the final one, and the winner was drawn from
exactly the distribution that will sit under the pointer at rest. Re-evaluation
still does real work — a parent's `modify` decides which *child* matches — but
nothing revisits a level it has left.

### Termination

Because branches embed inline and the walk only descends, depth is bounded by the
authored tree. Cycles are not detectable because they are not *authorable*.

`MAX_DEPTH` therefore is not a cycle guard. It exists for corrupted or hand-edited
JSON arriving through import, consistent with the defensive posture already in
`storage.ts` and `getRecipe`'s prototype-chain guard. Exceeding it yields
`kind: 'exhausted'` and uses whatever has accumulated.

## Direction

`Motion.direction` is the one genuinely new capability in the wheel itself.
Nothing in the current rotation math can express it.

```ts
const forward = (((plan.targetRotationDeg - from) % 360) + 360) % 360
const delta = direction === 'cw'
  ? turns * 360 + forward
  : -(turns * 360 + ((360 - forward) % 360))
```

The inner `% 360` on the reverse case is load-bearing: without it a `forward` of
exactly zero becomes a spurious extra revolution.

### A latent sign bug this exposes

`useSpin.ts:125` stores the resting angle as `to % 360`. JavaScript's `%` keeps
the sign of the dividend. Today `to` only ever increases, so the result is always
positive and nothing has gone wrong. Counter-clockwise makes `to` negative, the
stored resting angle goes negative, and the *following* spin starts from a
nonsense origin. It must become:

```ts
rotationRef.current = ((to % 360) + 360) % 360
```

### A cleanup taken while in here

`targetRotationDeg` (`src/wheel/geometry.ts:97`) bakes in `fullSpins * 360`, and
`useSpin.ts:90` adds it a second time; the intervening `% 360` silently discards
the first. Harmless while direction is fixed, actively misleading once it is not.
`targetRotationDeg` should return only the resting angle in `[0, 360)` and leave
revolutions to `useSpin`.

## Persistence and migration

`Preset.version` goes `1 → 2`. Migration is mechanical and lossless:

- `spin: { durationMs, fullSpins, easing }` → `spin: { target: { kind: 'fair' },
  motion: { durationMs, turns: fullSpins, direction: 'cw', easing } }`
- `branches: []`

`fullSpins` → `turns` is a rename inside a type that is already changing shape.
Leaving a field named `fullSpins` beside `direction: 'ccw'` would misdescribe it.

A v1 preset migrated this way must produce byte-identical spin behavior. That is a
test, not an aspiration.

## Error handling

The wheel never breaks the bit:

| Case | Behavior |
|---|---|
| Branch targets a segment that has left | Condition never matches; the walk continues. Not an error. |
| Branch re-targets a zero-arc segment | `forced()` degrades to a fair draw |
| `MAX_DEPTH` exceeded | `kind: 'exhausted'`; use what accumulated |
| Malformed branch node from storage | Dropped on load, as `getRecipe` drops unknown recipe ids |
| `branches: []` | Single pass; behaviorally identical to today |
| Resolution returns no winner | `planSpin` returns null, as it does now for an empty wheel |
| Modifier enables a trick that failed `validate()` | Contributes `morphs: []`. See below. |

### A modifier can force on a trick that failed validation

`storage.ts` stores a trick whose `validate()` fails as `enabled: false` — disabled, never
dropped, because losing a trick silently would be worse than showing it switched off. A
modifier's `enableTricks` names trick *ids* and does not consult validity, so it can switch
such a trick back on.

This is safe and deliberately left unguarded. Every recipe independently re-guards its own
structural precondition inside `resolve()` — `vanish`, `relabel`, and `recolor` filter unknown
targets away; `takeover` returns `[]` when its wedge is missing — so a force-enabled invalid
trick contributes no morphs rather than garbage. No throw, no non-finite weight, no corrupted
winner. Recipe *existence* is still re-checked inside `resolveTricks`, so only the `validate`
half of the stored `runnable` flag is bypassed.

Adding a `validate` call inside the resolver would also be wrong. `validate` takes the base
segment list, but that list moves during resolution — `takeover.provides` contributes a wedge —
so there is no stable thing to validate against.

One consequence to know about: `takeover.validate` also rejects a non-hex color. A `takeover`
that failed validation *only* on its color still rigs the wheel exactly as authored when force
-enabled — weights correct, winner real — and only the fade degrades, with `lerpColor` holding
the start color and cutting on the last frame.

## Testing (Vitest)

- **Resolution fixtures** — preset plus a frozen roll resolves to an expected
  winner, motion, and segment list. Which nodes fired is asserted *indirectly*,
  through the outcome each one produces, because `Resolution` deliberately does
  not record a trace: no consumer needs one yet. A `firedNodeIds: string[]` on
  both arms is the natural addition when the editor wants a "why did it pick
  this?" affordance, and it is cheap to add before callers exist.
- **Determinism** — identical roll and preset resolve identically across runs.
- **Re-evaluation earns its keep** — a parent `modify` changes which child
  matches; assert the sibling that would have matched before the modifier does
  not fire.
- **Trick deltas** — `enableTricks` / `disableTricks` compose correctly against
  the baseline `enabled` flags.
- **Depth guard** — a tree nested past `MAX_DEPTH` yields `exhausted` rather than
  hanging.
- **Direction** — a CCW spin puts the same segment under the pointer as the
  equivalent CW spin.
- **Sign regression** — `rotationRef` stays within `[0, 360)` across alternating
  CW/CCW spins.
- **Migration** — a v1 preset loads as v2 and spins byte-identically.

## Build order

1. `Motion.direction` plus the sign fix and the `targetRotationDeg` cleanup —
   self-contained, testable, and useful on its own.
2. Preset v2 types and migration.
3. `ScriptedSpin` with `branches: []` wired through to `planSpin` via `forced()`.
   At this point behavior is unchanged and the seam exists.
4. The branch walk, the frozen roll, and the `Resolution` union.
5. Editor surface for authoring trees — separate plan.

Steps 1–3 change no behavior. All of the risk is in step 4, and it lands on a
foundation that is already proven by tests.

## Future work

**Named spins, then cycles, then consequences.** Branches embed inline today, so a
cycle cannot be authored. Reuse — a library of named spins referenced by id — is
the additive change that makes cycles possible again, at which point the visited
set that this design deliberately discarded comes back.

The stated intent for that day is not a validation error. A cycle should trigger
the destruction of the wheel, unpredictably and delightfully. The `exhausted`
arm of `Resolution` exists partly to keep that outcome observable rather than
buried inside a loop guard: when the time comes, it is the hook to hang it on.
