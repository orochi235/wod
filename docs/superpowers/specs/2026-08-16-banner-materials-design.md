# Banner materials

A wedge may name the material its winner's banner is extruded in. The cash wheel
uses it to put every cash face in gold or gem and both BANKRUPT faces in oil.

For anyone working on the banner or on a sample preset. It answers: where does
the material come from, and what happens to a wheel that names none?

## Today

`rollStyle` (`src/banner/style.ts`) picks a `look` uniformly from klieg's
`LOOK_NAMES` — `gold`, `chrome`, `oil`, `gem` and eight more — once per landing, and both the
arriving and leaving fire wear it. Nothing upstream has a say.

The board theme also sets `tint: 'wedge'`, which recolors the rolled material
with the landed wedge's own color. Material and tint compose rather than
compete: `applyLook` replaces only the hue-carrying property — `color` for gold,
chrome and oil, `attenuationColor` for gem, which is clear stone whose red comes
from light passing through it — and leaves metalness, roughness, transmission and
iridescence alone. A red-tinted gold is metallic red; a red-tinted oil is
iridescent near-black red. The tint stays.

## The field

`Segment.look?: string` — a registry id, not a union, following `FontId`
(`src/slice/types.ts:166`). Two reasons: `src/wheel/types.ts` is the wheel's
vocabulary and should not import the banner's rendering library, and a stored id
from a newer build should fall back rather than fail to compile.

`src/banner/style.ts` is the only module that knows klieg's names, so it is
where the id is validated. An unreadable id — a typo, a name a future build
carries — rolls the full set, exactly as a segment with no `look` does.

## Flow

    segment.look ──▶ App ──▶ useBanner({look}) ──▶ rollStyle(rng, look) ──▶ fire

`rollStyle(rng, allowed?)` narrows the material slot only. Enter, active and exit
keep rolling across everything, so two BANKRUPT landings in a row are still two
different pieces of motion in the same oil.

## The cash wheel

`faces()` in `src/preset/samples.ts` assigns alongside the color it already
cycles: gold and gem alternating across the cash faces, oil on BANKRUPT. `LOSE A
TURN` stays in the cycle — the material marks the face that ends your turn with
nothing, and giving both penalties their own metal would leave the distinction to
hue alone.

The roster wheel names no look and rolls the whole set, as it does now.

## Persistence

`readSegments` in `src/preset/storage.ts` reads `look` as a non-empty string and
drops anything else. No version bump: a preset written before this loads with no
look on any segment, which is the existing behavior.

## Tests

- `style.test.ts` — a narrowed roll only returns names from the set; an unknown
  or empty id rolls everything; motion slots stay unnarrowed.
- `useBanner.test.ts` — the look reaches both the arriving and the leaving fire,
  and both carry the same one.
- `storage.test.ts` — `look` round-trips; a non-string is dropped.
- `samples.test.ts` — every cash face is gold or gem, both BANKRUPT faces are
  oil, and every id names a material the library carries.
