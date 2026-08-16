import type { FontId } from '../types'

/** What groups the picker. Not a style claim beyond that. */
export type FontClass = 'display' | 'woodtype' | 'serif' | 'sans' | 'script'

export type Font = {
  id: FontId
  /** As the face calls itself. */
  name: string
  class: FontClass
  /** The CSS family string, which is also what the measurer measures in. */
  family: string
  /** Served by this app. One binary, read by the stylesheet and by the parser. */
  file: string
  /** The family as the Google Fonts API spells it, for `scripts/fonts.mjs`. */
  google: string
}

type Entry = Omit<Font, 'file' | 'google'> & { google?: string }

/**
 * Against the configured base, not the server root. Vite rewrites the `url()`
 * in the generated stylesheet when the app is served under a subpath, but a
 * path a fetch builds is a string it never sees — so the stylesheet found its
 * faces on GitHub Pages and every parse and every overlay 404'd.
 */
const entry = (spec: Entry): Font => ({
  ...spec,
  file: `${import.meta.env.BASE_URL}fonts/${spec.id}.ttf`,
  google: spec.google ?? spec.family,
})

/**
 * Grouped by class, in the order the picker shows them. Adding a face is an
 * entry here plus `node scripts/fonts.mjs` — nothing is statically imported, so
 * the bundle does not grow with the catalogue.
 */
export const CATALOG: Font[] = [
  entry({ id: 'anton', name: 'Anton', class: 'display', family: 'Anton' }),
  entry({ id: 'oswald', name: 'Oswald', class: 'display', family: 'Oswald' }),
  entry({ id: 'bebas-neue', name: 'Bebas Neue', class: 'display', family: 'Bebas Neue' }),
  entry({ id: 'black-ops-one', name: 'Black Ops One', class: 'display', family: 'Black Ops One' }),
  entry({ id: 'gravitas-one', name: 'Gravitas One', class: 'display', family: 'Gravitas One' }),
  entry({ id: 'abril-fatface', name: 'Abril Fatface', class: 'display', family: 'Abril Fatface' }),
  entry({ id: 'righteous', name: 'Righteous', class: 'display', family: 'Righteous' }),
  entry({ id: 'geologica', name: 'Geologica', class: 'display', family: 'Geologica' }),
  entry({
    id: 'press-start-2p',
    name: 'Press Start 2P',
    class: 'display',
    family: 'Press Start 2P',
  }),
  entry({ id: 'luckiest-guy', name: 'Luckiest Guy', class: 'display', family: 'Luckiest Guy' }),
  entry({ id: 'archivo-black', name: 'Archivo Black', class: 'display', family: 'Archivo Black' }),
  entry({ id: 'changa-one', name: 'Changa One', class: 'display', family: 'Changa One' }),
  entry({ id: 'limelight', name: 'Limelight', class: 'display', family: 'Limelight' }),
  entry({ id: 'monoton', name: 'Monoton', class: 'display', family: 'Monoton' }),
  entry({ id: 'special-elite', name: 'Special Elite', class: 'display', family: 'Special Elite' }),
  entry({ id: 'pirata-one', name: 'Pirata One', class: 'display', family: 'Pirata One' }),
  entry({ id: 'jersey-25', name: 'Jersey 25', class: 'display', family: 'Jersey 25' }),
  entry({ id: 'asset', name: 'Asset', class: 'display', family: 'Asset' }),

  entry({ id: 'rye', name: 'Rye', class: 'woodtype', family: 'Rye' }),
  entry({ id: 'bevan', name: 'Bevan', class: 'woodtype', family: 'Bevan' }),
  entry({ id: 'alfa-slab-one', name: 'Alfa Slab One', class: 'woodtype', family: 'Alfa Slab One' }),
  entry({ id: 'goblin-one', name: 'Goblin One', class: 'woodtype', family: 'Goblin One' }),
  entry({ id: 'croissant-one', name: 'Croissant One', class: 'woodtype', family: 'Croissant One' }),

  entry({ id: 'cinzel', name: 'Cinzel', class: 'serif', family: 'Cinzel' }),
  entry({ id: 'bodoni-moda', name: 'Bodoni Moda', class: 'serif', family: 'Bodoni Moda' }),
  entry({
    id: 'playfair-display',
    name: 'Playfair Display',
    class: 'serif',
    family: 'Playfair Display',
  }),

  entry({ id: 'overpass', name: 'Overpass', class: 'sans', family: 'Overpass' }),

  entry({ id: 'lobster', name: 'Lobster', class: 'script', family: 'Lobster' }),
  entry({
    id: 'shadows-into-light',
    name: 'Shadows Into Light',
    class: 'script',
    family: 'Shadows Into Light',
  }),
  entry({ id: 'satisfy', name: 'Satisfy', class: 'script', family: 'Satisfy' }),
  entry({
    id: 'permanent-marker',
    name: 'Permanent Marker',
    class: 'script',
    family: 'Permanent Marker',
  }),
  entry({ id: 'great-vibes', name: 'Great Vibes', class: 'script', family: 'Great Vibes' }),
  entry({ id: 'eagle-lake', name: 'Eagle Lake', class: 'script', family: 'Eagle Lake' }),
]

export const CLASS_NAMES: Record<FontClass, string> = {
  display: 'Display',
  woodtype: 'Woodtype and slab',
  serif: 'Serif',
  sans: 'Sans',
  script: 'Script',
}
