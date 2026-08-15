# TODO: an audio layer

The wheel makes sound in one place and declares it in another, and the two do not
know about each other. This note says what exists and what a layer would have to
settle. It is a placeholder for a design, not a design.

## What exists

**`src/wheel/flapperAudio.ts`** synthesizes a click per peg crossing — an
oscillator burst whose pitch and gain rise with wheel speed. `Wheel` owns one
through a ref, creates its `AudioContext` lazily, unlocks it on the first
`pointerdown` anywhere in the window, and closes it on unmount. Mute arrives as a
prop from App's toggle.

**`Reveal.sound?: string`** is a field on the reveal payload. `storage.ts` parses
and persists it. Nothing plays it.

## What a layer has to settle

- **One context, one owner.** The clicker builds its own `AudioContext` inside
  `Wheel`. A second source that did the same would race the autoplay unlock and
  double the mute state. Whoever owns the context has to sit above both.
- **Synthesis and samples together.** The clicker is generated; `Reveal.sound` is
  a URL. A layer needs both — loading, caching, and failing quietly when a sample
  404s, without the generated path paying for any of it.
- **Unlock is a gesture, not a lifecycle.** The current `pointerdown` listener is
  fine for one source. With several, the first gesture has to unlock all of them,
  including sources that do not exist yet.
- **Who else wants sound.** Spin start, the settle, the landing sting, a trick
  firing, a wedge arriving or leaving. Each is an event some layer already knows
  about; none of them can reach audio today.
- **Mute versus volume.** `setMuted` is a boolean. Per-source levels (ticks under
  a sting) need a mix, and an operator running a show wants one master control.

## Open

Whether the layer is a hook, a module with a singleton, or a context provider is
open, and depends on whether anything outside `Wheel` ends up needing to trigger
a sound directly.
