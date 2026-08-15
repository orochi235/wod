# Fonts

**What this is:** the catalogue of faces the wheel can set type in, served from
this app rather than from a font CDN.

**Why they are here:** a wheel that stops setting type when a third party is
unreachable is not a wheel, and outline mode parses these same binaries to warp
glyph outlines — one file per face, so what is measured, what is painted and
what is warped cannot disagree.

**Why TrueType and not WOFF2:** opentype.js cannot read WOFF2 without a Brotli
decompressor, and a second smaller copy for the stylesheet would be a second
source of metrics. A face costs three to five times its WOFF2, and only a wheel
that names it pays.

`licenses/<id>.txt` is that face's license — SIL Open Font License 1.1 for most
of them, Apache 2.0 for a few — and it must ship with the binary.

## Adding or refreshing a face

Add an entry to `src/slice/fonts/catalog.ts`, then:

```sh
node scripts/fonts.mjs           # the whole catalogue
node scripts/fonts.mjs rye anton # or just these
node scripts/specimens.mjs       # rebake the picker's previews
```

The script downloads each `.ttf` here, its license into `licenses/`, and
regenerates `src/wheel/fonts.css` — the `@font-face` rules that name them.
Nothing here is hand-edited.
