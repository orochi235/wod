# Rig visibility

The editor is a linkable page. Anyone holding the link can open it, and today it
tells them the wheel is rigged: the Tricks panel names the rigs, the Attendees
panel shows per-person weights, and the segment list labels tricked wedges
`↳ slow burn`. This spec adds a flag that hides that authoring surface while the
tricks keep firing, so the page can be shared without giving away the game.

Audience: anyone working on the editor's panels or its startup path.

## What the flag does not do

It hides UI. It changes no behavior: a rigged preset resolves identically with
the flag off, and the show page is untouched.

It also stops a casual look, not a determined one. `wod.preset.current` in
localStorage holds the whole preset including `tricks`, and the bundle contains
every recipe's name and description. Anyone who opens devtools sees the rig.
Real secrecy would require resolving tricks on a server, which this app does not
have.

## The flag

`wod.rig.visible` in localStorage, set to `'1'`. Dot-separated to match
`wod.preset.current`. Absent or any other value means locked.

Locked is the default, so a fresh browser — anyone you send the link to — gets
the hidden editor without doing anything.

## Unlocking

Visit `#/edit?rig=1` once. Startup writes the flag and rewrites the hash without
the param, via `history.replaceState` so Back cannot restore it. The flag
persists, so the address bar carries no trace on later visits.

`rig=0` clears the flag. That is the only way to re-lock without devtools, and
it exists so the operator can check what a guest sees.

## Module

`src/rig/visibility.ts`, no React:

- `consumeRigParam()` — reads `rig` from the hash query, applies it, strips it.
  No param is a no-op, which is the common case and must not touch the URL.
- `isRigVisible()` — reads the flag.

Both guard localStorage the way `preset/storage.ts` does; a browser that refuses
storage gets the locked editor rather than an exception.

`main.tsx` calls `consumeRigParam()` before `createRoot`, so an unlock applies to
the first paint instead of flashing the locked layout.

## What the Editor threads

The Editor reads the flag once at mount. It is not reactive: the flag changes
only on a load that consumed a param, and that load re-mounts everything.

| Surface | Locked |
| --- | --- |
| Right column (`TrickLibrary`, `OverridesPanel`) | Not rendered |
| `.editor` grid | `--locked` modifier drops to two columns |
| `SegmentList` ghost rows | Hidden via a new `showOwners` prop |
| `PresetIo` Export | Hidden via a new `showExport` prop; Import stays |
| `Transport` scrub | Hidden via a new `showScrub` prop; the spin button stays |

The scrub replays the rigged geometry at whatever pace the dragger chooses,
which shows more than any panel does. `Transport` hides it when locked and also
whenever there is no morph to preview, since a slider that cannot move anything
reads as broken.

Hiding the slider must not stop the reporting effect behind it. The parent
renders the last geometry it heard, so a scrubbed frame left behind by a trick
that has since been switched off would freeze the wheel mid-morph.

Two columns rather than an empty third: a conspicuous gap invites the question
the flag exists to prevent.

`SegmentList` takes a boolean rather than an empty `tricks` array. Passing `[]`
would produce the same rows while telling the component something false.

The Transport button becomes `Spin`, unconditionally — no prop. It read `Spin
with these tricks`, which named the rig in the center column. There is only one
spin path, so the longer label carried nothing for the operator.

## Tests

- `visibility.test.ts` — `rig=1` sets and strips; `rig=0` clears; no param leaves
  both flag and URL alone; unrelated query params survive the rewrite.
- `Editor.test.tsx` — locked hides the Tricks panel, the Attendees panel, the
  ghost rows, and Export; unlocked shows all four.
- A rigged preset lands where the trick says with the flag off. This is the one
  that protects the requirement; the rest only check cosmetics.
- The locked editor offers no scrubber even with a trick armed, and `Transport`
  keeps reporting geometry once its last morph goes away.
