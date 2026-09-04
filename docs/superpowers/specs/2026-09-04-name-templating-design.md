# Name templates in wedge text

For whoever next edits `compose.ts` or writes a recipe with a text field. It
answers: what `{first}` means, where it expands, and the two ordering rules that
are easy to break.

## What it is

Three tokens — `{name}`, `{first}`, `{last}` — usable in any text an operator
authors about a wedge. One authored string says a different name on each wedge
it lands on, so a `relabel` trick aimed at the whole roster can read
"{first} is out" instead of "LOSER".

Braces rather than `@`, which `targets.ts` already owns for selectors. An
unrecognized `{token}` is left literal, which doubles as the escape hatch for
authored braces.

## The name

Meet hands over one `displayName` and no structured given or family name, so
`namesOf` splits at the first space: everything after it is `last`.
"Ana Delacroix Ruiz" keeps both surnames, a middle name lands in `last` too, and
a mononym gets an empty `last`. Any split is a guess; this one is wrong in the
same direction every time.

A token with nothing to fill it expands to the empty string, and `expand`
collapses whitespace afterwards — otherwise "{first} {last} is out" on a mononym
ships a double space.

## Where it expands

Two sites, both in code that already exists.

`toSegment` (`compose.ts`) expands an override's `label`, `reveal.headline` and
`reveal.body`.

`relabel.resolve` expands `toLabel` once **per target**, which is the case that
cannot be hand-authored today.

`composeBase` returns `names: Map<segmentId, NameContext>`, populated only for
roster wedges. `resolveTricks` passes it into `RecipeContext` unchanged. Both the
map and the per-wedge entry are optional: a hand-built composition has no
roster, and `nameFor` reads an absent entry and an absent map identically, as
`NO_NAME`.

Nothing is stored expanded. The editor round-trips the template text as typed.

## Two rules that break quietly

**A static wedge is nameless, not split.** It would be easy to derive a context
from `segment.label` and cover statics too. Don't: a trick targeting `@all` also
hits authored wedges, and splitting theirs renders "Grand is out" on
"Grand Prize". Absent from the map is the whole mechanism.

**An override expands against `item.label`, never against its own output.**
`toSegment` takes the context as an argument for this reason. Re-deriving it
from the label being built would find no name left in it.

## Deliberately absent

Per-item first/last override fields, a People API lookup for real given and
family names, and any change to `FeedItem` — which is what keeps storage, the
cross-window bus, and the Zoom adapter surface untouched.
