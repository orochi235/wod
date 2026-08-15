# TODO: wedges that touch should not share a color

`DEFAULT_PALETTE` holds six swatches. At seven uncolored wedges the seventh gets
`DEFAULT_PALETTE[0]` — the first wedge's color — and on a circle the first and
last wedge are neighbors. Seven participants is an ordinary meeting, so this is
reachable, not an edge case.

## Where it comes from

`assignColors` (`src/wheel/colors.ts`) hands out the first unclaimed swatch, and
falls back to `paletteColor(colors.size)` when every swatch is taken. Six
assignments make `colors.size` six, so `6 % 6` wraps to index 0.

The behavior predates the single-owner change — `usePresence.withColor` did the
same thing — so nothing regressed. Moving assignment into one place is what made
it visible. `colors.test.ts` asserts the collision concretely rather than through
`toBeTruthy()`, so a fix has to update that test deliberately.

## Two things wrong with the index

**It wraps to a neighbor.** Seven wedges over six colors forces a repeat, but not
an *adjacent* one. The repeat should land as far from the original as the roster
allows.

**`colors.size` is not a position.** It counts retained ids and carried-over
entries, so the wrap point moves with animation state rather than with where the
wedge sits. It is also non-monotonic now: a chosen color deletes its sticky entry
mid-pass, so two newcomers in one pass can read the same index and land on the
same swatch — something the old code did not do.

## What a fix has to hold

- A wedge keeps its swatch across roster churn. That is the property the whole
  module exists for and it must not be traded away for spread.
- An exiting wedge's swatch stays reserved for the length of its exit.
- Adjacency is circular: the last wedge neighbors the first.
- Assignment stays pure — same inputs, same colors — since a spin resolves
  against it separately from the render.

The wedge order `assignColors` receives is the draw order, so neighbors are
adjacent entries plus the wrap pair. Whether to spread by scoring against both
neighbors, or to widen the palette instead, is open.
