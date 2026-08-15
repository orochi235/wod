# Fonts

**What this is:** the faces the wheel sets type in, served from this app rather
than from a font CDN.

**Why they are here:** a wheel that stops setting type when a third party is
unreachable is not a wheel, and a later plan parses these same binaries to warp
glyph outlines — one file, so the metrics cannot disagree with what is painted.

| File | Face | Covers |
| --- | --- | --- |
| `bevan-latin.woff2` | Bevan 400 | Latin |
| `bevan-latin-ext.woff2` | Bevan 400 | Latin Extended |

Split on `unicode-range` the way Google Fonts serves them, so a latin roster
never downloads the extended file. `OFL.txt` is Bevan's license; it is SIL Open
Font License 1.1 and must ship with the binaries.

To refresh, take the `src` URLs out of
`https://fonts.googleapis.com/css2?family=Bevan` and re-download both files.
The `@font-face` rules that name them live in `src/wheel/Wheel.css`, and the
family string is pinned to `FONT_STACK` in `src/slice/measure.ts` by a test —
the wheel measures every label on a canvas in that face, so the two drifting
apart mis-sizes every wedge silently.
