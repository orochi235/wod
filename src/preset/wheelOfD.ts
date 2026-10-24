import type { FontId, SliceInstance, SlicePart } from '../slice/types'
import type { Media, Segment } from '../wheel/types'
import type { Affinity, Pool, Preset } from './types'

/**
 * A word runs the way its own letters read, never against them: upright letters
 * run top to bottom, rim to hub; letters on their sides run along their baseline,
 * hub to rim.
 */
type Orientation = 'radial' | 'taperedRadial' | 'stacked'
type Style = Omit<SlicePart, 'content' | 'orientation' | 'band' | 'font' | 'color' | 'direction'>

/** One piece of type: the wedge's own label unless `text` names a fragment of it. */
function set(
  orientation: Orientation,
  band: [number, number],
  font: FontId,
  color: string,
  style: Style & { text?: string } = {},
): SlicePart {
  const { text, ...rest } = style
  return {
    content: text === undefined ? { from: 'label' } : { from: 'text', value: text },
    orientation,
    band,
    caps: true,
    font,
    color,
    ...rest,
    // `radial` only runs outward, so a sideways glyph run is turned to match it.
    ...(orientation === 'taperedRadial' ? { direction: 'hubOutward' as const } : {}),
    // Words on their sides sit out against the rim; upright stacks fill their band.
    ...(orientation === 'stacked' ? {} : { toRim: true }),
  }
}

function composed(...parts: SlicePart[]): SliceInstance {
  return { id: 'composed', params: { parts } }
}

const id = (label: string) => `d-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`

/** The whole radius past the hub, for a word set in one piece. */
const FULL: [number, number] = [0.26, 0.95]
const OUTER: [number, number] = [0.6, 0.95]
const INNER: [number, number] = [0.26, 0.58]

function word(
  label: string,
  color: string,
  look: string,
  slice: SliceInstance,
  media?: Media,
): Segment {
  const segment: Segment = {
    id: id(label),
    label,
    weight: 1,
    color,
    slice,
    look,
  }
  if (media) segment.media = media
  return segment
}

/**
 * Pattern-welded steel: bands of light and dark folded into waves. Drawn behind
 * the type and clipped to the wedge by the wheel, so it can be any square.
 */
function damascus(): Media {
  const rows: string[] = []
  for (let i = 0; i < 26; i++) {
    const y = i * 8
    const shade = i % 2 === 0 ? '#8d939b' : '#3e4349'
    const wave = (phase: number) => (Math.sin(i * 0.9 + phase) * 6).toFixed(1)
    rows.push(
      `<path d="M0 ${y} C50 ${y + Number(wave(0))} 100 ${y - Number(wave(1.3))} 200 ${y + Number(wave(2.1))}" stroke="${shade}" stroke-width="5" fill="none"/>`,
    )
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#5b6066"/>${rows.join('')}</svg>`
  return { kind: 'image', value: `data:image/svg+xml,${encodeURIComponent(svg)}` }
}

/** Old Spice's sea: swells of darker red rolling across the bottle's own red. */
function oldSpiceSea(): Media {
  const swells: string[] = []
  for (let i = 0; i < 14; i++) {
    const y = 8 + i * 14
    const crest = (x: number) => `${x} ${y - 6} ${x + 12} ${y - 6} ${x + 20} ${y}`
    let d = `M-20 ${y}`
    for (let x = -20; x < 200; x += 20) d += ` C${crest(x)}`
    swells.push(`<path d="${d}" stroke="#8c0f15" stroke-width="3" fill="none"/>`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#b5121b"/>${swells.join('')}</svg>`
  return { kind: 'image', value: `data:image/svg+xml,${encodeURIComponent(svg)}` }
}

const WORDS: Segment[] = [
  word('DOOM', '#4a0d12', 'oil', composed(set('stacked', [0.3, 0.94], 'pirata-one', '#e8d9b0'))),
  word('DAMNATION', '#8a1c0c', 'gem', composed(set('taperedRadial', FULL, 'rye', '#ffb347'))),
  word('DESTINY', '#1c1f4a', 'carved', composed(set('stacked', [0.3, 0.94], 'cinzel', '#e9d8a6'))),
  word('DIVESTMENT', '#1f4d36', 'bezel', composed(set('radial', FULL, 'bodoni-moda', '#f3efe0'))),
  word('DIRIGIBLES', '#7fb2d9', 'chrome', composed(set('radial', FULL, 'limelight', '#1e2a3a'))),
  word(
    'DONUTS',
    '#ff6b1a',
    'glitter',
    composed(set('stacked', [0.3, 0.94], 'changa-one', '#e8197a')),
  ),
  word('DRAGONS', '#0f3b2e', 'gem', composed(set('radial', FULL, 'pirata-one', '#e0b64a'))),
  word('DISCO', '#2a0a3a', 'sequin', composed(set('stacked', [0.34, 0.94], 'monoton', '#ff4fd8'))),
  word('DYNAMITE', '#c4161c', 'flake', composed(set('stacked', [0.3, 0.94], 'rye', '#f5e6c8'))),
  word(
    'DREAD',
    '#2b2b2b',
    'oil',
    composed(set('radial', FULL, 'special-elite', '#c9c3b5', { tracking: 0.4 })),
  ),
  word(
    'DESPAIR',
    '#3e4a5a',
    'ice',
    composed(set('taperedRadial', FULL, 'shadows-into-light', '#cfd8e3')),
  ),
  word(
    'DREAMS',
    '#b8a6e0',
    'glitter',
    composed(set('radial', FULL, 'satisfy', '#2d2150', { caps: false, text: 'Dreams' })),
  ),
  word('DARKNESS', '#08080a', 'neon', composed(set('stacked', [0.3, 0.94], 'monoton', '#24242e'))),
  word(
    'DEPRECATION',
    '#6b6f75',
    'tubing',
    composed(set('radial', FULL, 'press-start-2p', '#d7dadf')),
  ),
  word(
    'DEODORANT',
    '#b5121b',
    'gem',
    composed(
      { content: { from: 'media' }, orientation: 'stacked', band: [0, 1] },
      set('radial', FULL, 'bevan', '#ffffff'),
    ),
    oldSpiceSea(),
  ),
  word('DENTISTRY', '#eef5f6', 'ice', composed(set('radial', FULL, 'overpass', '#2f8f9c'))),
  word('DIVIDENDS', '#2e6b3f', 'gold', composed(set('radial', FULL, 'bodoni-moda', '#e9d48a'))),
  word(
    'DINOSAURS',
    '#5c7a2a',
    'leather',
    composed(set('radial', FULL, 'alfa-slab-one', '#f0e2b6')),
  ),
  word(
    'DECOUPAGE',
    '#e9dcc3',
    'leather',
    composed(
      set('taperedRadial', INNER, 'permanent-marker', '#3a2f2a', { text: 'DECOU' }),
      set('taperedRadial', OUTER, 'special-elite', '#a0522d', { text: 'PAGE' }),
    ),
  ),
  word('DODECAHEDRA', '#24324a', 'bezel', composed(set('radial', FULL, 'geologica', '#9fd3ff'))),
  word('DEPREDATION', '#111111', 'oil', composed(set('radial', FULL, 'pirata-one', '#c4161c'))),
  word(
    'DARK MATTER',
    '#0b0b10',
    'oil',
    composed(
      set('taperedRadial', INNER, 'monoton', '#2c2c38', { text: 'DARK' }),
      set('taperedRadial', OUTER, 'monoton', '#2c2c38', { text: 'MATTER' }),
    ),
  ),
  word(
    'DIET SODA',
    '#4a2a1a',
    'chrome',
    composed(
      set('taperedRadial', INNER, 'righteous', '#c8ccd2', { text: 'DIET' }),
      set('taperedRadial', OUTER, 'righteous', '#eef0f3', { text: 'SODA' }),
    ),
  ),
  word('DORITOS', '#e8641e', 'flake', composed(set('radial', FULL, 'anton', '#1a1a1a'))),
  word(
    'DIFFERENTIAL EQUATIONS',
    '#2f4f3a',
    'ice',
    composed(
      set('taperedRadial', INNER, 'shadows-into-light', '#f1f1e8', { text: 'DIFFERENTIAL' }),
      set('taperedRadial', OUTER, 'shadows-into-light', '#f1f1e8', { text: 'EQUATIONS' }),
    ),
  ),
  word(
    'DEADLOCK',
    '#3b3b3b',
    'bezel',
    composed(
      set('stacked', OUTER, 'archivo-black', '#ffcc00', { text: 'DEAD' }),
      set('stacked', INNER, 'archivo-black', '#ffcc00', { text: 'LOCK' }),
    ),
  ),
  word(
    'DOCUMENTATION',
    '#f4f1ea',
    'piping',
    composed(set('radial', FULL, 'overpass', '#b9b3a6', { maxSize: 9 })),
  ),
  word(
    'DIFFRACTION',
    '#111111',
    'pave',
    composed(
      set('taperedRadial', [0.26, 0.45], 'overpass', '#ff5a5a', { text: 'DIF' }),
      set('taperedRadial', [0.47, 0.7], 'overpass', '#5aff8a', { text: 'FRAC' }),
      set('taperedRadial', [0.72, 0.95], 'overpass', '#5a9bff', { text: 'TION' }),
    ),
  ),
  word(
    'DILEMMAS',
    '#5a4632',
    'carved',
    composed(
      set('taperedRadial', INNER, 'abril-fatface', '#f4e3c1', { text: 'DILEM' }),
      set('taperedRadial', OUTER, 'abril-fatface', '#c49a6c', { text: 'MAS' }),
    ),
  ),
  word(
    'DANKNESS',
    '#2f3d1f',
    'velvet',
    composed(set('stacked', [0.3, 0.94], 'goblin-one', '#9bbf5a')),
  ),
  word(
    'DOGS',
    '#f2c14e',
    'gold',
    composed(set('stacked', [0.36, 0.94], 'luckiest-guy', '#5a3a1a')),
  ),
  word(
    'DAFFODILS',
    '#f7e27a',
    'glitter',
    composed(set('radial', FULL, 'satisfy', '#3f6b2a', { caps: false, text: 'Daffodils' })),
  ),
  word(
    'DEADLIFTS',
    '#2a2a2a',
    'chrome',
    composed(set('stacked', [0.3, 0.94], 'anton', '#e8e8e8', { stretch: 'fill' })),
  ),
  word('DIPHTHERIA', '#d9cfb6', 'ice', composed(set('radial', FULL, 'special-elite', '#5a1f1f'))),
  word('DIABETES', '#f7f7f2', 'pave', composed(set('radial', FULL, 'bodoni-moda', '#2c5aa0'))),
  word(
    'DROUGHT',
    '#c9a26b',
    'leather',
    composed(set('radial', FULL, 'rye', '#5a3a1a', { tracking: 0.35 })),
  ),
  word(
    'DELIGHT',
    '#ff8fb1',
    'sequin',
    composed(set('stacked', [0.3, 0.94], 'luckiest-guy', '#fff6d6')),
  ),
  word(
    'DAMASCUS',
    '#5b6066',
    'carved',
    composed(
      { content: { from: 'media' }, orientation: 'stacked', band: [0, 1] },
      set('radial', FULL, 'cinzel', '#f4f4f4'),
    ),
    damascus(),
  ),
  word(
    'DUNGAREES',
    '#2f4f7a',
    'leather',
    composed(set('radial', FULL, 'alfa-slab-one', '#e8b04a')),
  ),
  word('DIURETICS', '#9fd3e8', 'ice', composed(set('radial', FULL, 'righteous', '#0f3a52'))),
  word(
    'DOWN SYNDROME',
    '#1f5fa8',
    'bezel',
    composed(
      set('taperedRadial', INNER, 'overpass', '#ffd23f', { text: 'DOWN' }),
      set('taperedRadial', OUTER, 'overpass', '#ffd23f', { text: 'SYNDROME' }),
    ),
  ),
  // Read it once, then read it again.
  word(
    'DEJA VU',
    '#3d5a80',
    'ice',
    composed(
      set('taperedRadial', INNER, 'overpass', '#e0fbfc', { text: 'DEJA VU' }),
      set('taperedRadial', OUTER, 'overpass', '#e0fbfc', { text: 'DEJA VU' }),
    ),
  ),
  word(
    'DAD JOKES',
    '#7a5c3e',
    'gold',
    composed(
      set('taperedRadial', INNER, 'luckiest-guy', '#f6e7c8', { text: 'DAD' }),
      set('taperedRadial', OUTER, 'luckiest-guy', '#f6e7c8', { text: 'JOKES' }),
    ),
  ),
  word(
    'DUMPSTER FIRES',
    '#1f4d2b',
    'flake',
    composed(
      set('taperedRadial', INNER, 'black-ops-one', '#d8e8d0', { text: 'DUMPSTER' }),
      set('taperedRadial', OUTER, 'black-ops-one', '#ff6a13', { text: 'FIRES' }),
    ),
  ),
  word(
    'DRAMA LLAMAS',
    '#7a0f1c',
    'velvet',
    composed(
      set('taperedRadial', INNER, 'limelight', '#f2d27a', { text: 'DRAMA' }),
      set('taperedRadial', OUTER, 'limelight', '#f2d27a', { text: 'LLAMAS' }),
    ),
  ),
  word(
    'DEUS EX MACHINA',
    '#e9e4dc',
    'carved',
    composed(
      set('taperedRadial', INNER, 'cinzel', '#3a3a3a', { text: 'DEUS EX' }),
      set('taperedRadial', OUTER, 'cinzel', '#3a3a3a', { text: 'MACHINA' }),
    ),
  ),
  word(
    'DISCOMBOBULATION',
    '#3b1f5c',
    'glitter',
    composed(set('radial', FULL, 'bodoni-moda', '#f0c3ff')),
  ),
  word('DOOMSCROLLING', '#0e1a2b', 'neon', composed(set('radial', FULL, 'jersey-25', '#5ab0ff'))),
  word(
    'DAYLIGHT SAVINGS',
    '#ffcf5a',
    'gold',
    composed(
      set('taperedRadial', INNER, 'overpass', '#5a2d0c', { text: 'DAYLIGHT' }),
      set('taperedRadial', OUTER, 'overpass', '#5a2d0c', { text: 'SAVINGS' }),
    ),
  ),
  word(
    'DEWEY DECIMAL',
    '#d8c7a3',
    'leather',
    composed(
      set('taperedRadial', INNER, 'special-elite', '#3b2f2f', { text: 'DEWEY' }),
      set('taperedRadial', OUTER, 'special-elite', '#3b2f2f', { text: 'DECIMAL' }),
    ),
  ),
  word(
    'DEAD DROPS',
    '#c9b38a',
    'oil',
    composed(
      set('taperedRadial', INNER, 'special-elite', '#2b2b2b', { text: 'DEAD' }),
      set('taperedRadial', OUTER, 'special-elite', '#2b2b2b', { text: 'DROPS' }),
    ),
  ),
  word(
    'DUCT TAPE',
    '#9aa1a8',
    'chrome',
    composed(
      set('taperedRadial', INNER, 'permanent-marker', '#1d1d1d', { text: 'DUCT' }),
      set('taperedRadial', OUTER, 'permanent-marker', '#1d1d1d', { text: 'TAPE' }),
    ),
  ),
  word(
    'DUST BUNNIES',
    '#8e8a86',
    'velvet',
    composed(
      set('taperedRadial', INNER, 'shadows-into-light', '#f1eee9', { text: 'DUST' }),
      set('taperedRadial', OUTER, 'shadows-into-light', '#f1eee9', { text: 'BUNNIES' }),
    ),
  ),
  word(
    'DOILIES',
    '#b9a7d6',
    'piping',
    composed(set('radial', FULL, 'great-vibes', '#ffffff', { caps: false, text: 'Doilies' })),
  ),
  word('DIORAMAS', '#5c4a3a', 'carved', composed(set('radial', FULL, 'abril-fatface', '#f3e6cf'))),
  word('DOORKNOBS', '#3b2a1a', 'gold', composed(set('radial', FULL, 'gravitas-one', '#d4a64a'))),
  word(
    'DOODLES',
    '#f7f4e8',
    'piping',
    composed(set('radial', FULL, 'permanent-marker', '#2549b8')),
  ),
  word('D12', '#000000', 'chrome', composed(set('stacked', [0.36, 0.94], 'pirata-one', '#ffffff'))),
  word(
    'DICE',
    '#c4161c',
    'gem',
    composed(set('stacked', [0.32, 0.94], 'alfa-slab-one', '#ffffff')),
  ),
  word('DOMINOES', '#111111', 'bezel', composed(set('radial', FULL, 'archivo-black', '#f5f5f5'))),
  word(
    'DUCKS',
    '#ffd23f',
    'gold',
    composed(set('stacked', [0.32, 0.94], 'luckiest-guy', '#e8641e')),
  ),
  word(
    'DODOS',
    '#7b7f86',
    'leather',
    composed(set('stacked', [0.32, 0.94], 'goblin-one', '#ece4d0')),
  ),
  word('DOLPHINS', '#1b6ca8', 'ice', composed(set('radial', FULL, 'righteous', '#dff3ff'))),
  word(
    'DANDELIONS',
    '#4f7a2b',
    'glitter',
    composed(set('radial', FULL, 'satisfy', '#fffdf0', { caps: false, text: 'Dandelions' })),
  ),
  word(
    'DIM SUM',
    '#c8a46a',
    'piping',
    composed(
      set('taperedRadial', INNER, 'changa-one', '#5a3a1a', { text: 'DIM' }),
      set('taperedRadial', OUTER, 'changa-one', '#5a3a1a', { text: 'SUM' }),
    ),
  ),
  word(
    'DEVILED EGGS',
    '#ffe9a8',
    'gold',
    composed(
      set('taperedRadial', INNER, 'croissant-one', '#c0392b', { text: 'DEVILED' }),
      set('taperedRadial', OUTER, 'croissant-one', '#c0392b', { text: 'EGGS' }),
    ),
  ),
  word(
    'DRUNK DRIVING',
    '#2b2b2b',
    'flake',
    composed(
      set('taperedRadial', INNER, 'permanent-marker', '#ffb000', { text: 'DRUNK' }),
      set('taperedRadial', OUTER, 'permanent-marker', '#ffb000', { text: 'DRIVING' }),
    ),
  ),
  word(
    'DEFENESTRATION',
    '#6b2e2e',
    'carved',
    composed(set('radial', FULL, 'bodoni-moda', '#f4ead5')),
  ),
  word(
    'DEFORESTATION',
    '#4b3621',
    'leather',
    composed(set('radial', FULL, 'alfa-slab-one', '#d9c49a')),
  ),
  word('DAMOCLES', '#2a2a3a', 'chrome', composed(set('radial', FULL, 'cinzel', '#e8e8e8'))),
  word('DIRECTIONS', '#00704a', 'bezel', composed(set('radial', FULL, 'overpass', '#ffffff'))),
  // One helmet silver, one gold.
  word(
    'DAFT PUNK',
    '#0a0a0a',
    'chrome',
    composed(
      set('taperedRadial', INNER, 'press-start-2p', '#c0c4c8', { text: 'DAFT' }),
      set('taperedRadial', OUTER, 'press-start-2p', '#d4af37', { text: 'PUNK' }),
    ),
  ),
  word(
    'DOPPLER RADAR',
    '#06210f',
    'neon',
    composed(
      set('taperedRadial', INNER, 'righteous', '#39ff14', { text: 'DOPPLER' }),
      set('taperedRadial', OUTER, 'righteous', '#39ff14', { text: 'RADAR' }),
    ),
  ),
  word('DALMATIANS', '#f7f7f7', 'piping', composed(set('radial', FULL, 'luckiest-guy', '#111111'))),
  // The Donets coal basin: wheat-steppe ink on coal.
  word('DONBAS', '#1f1f1f', 'leather', composed(set('radial', FULL, 'oswald', '#c9a85c'))),
  word('DARDANELLES', '#1d4e89', 'ice', composed(set('radial', FULL, 'cinzel', '#f2e8cf'))),
  word(
    'DIRE STRAITS',
    '#0b0b0b',
    'chrome',
    composed(
      set('taperedRadial', INNER, 'oswald', '#e23b2e', { text: 'DIRE' }),
      set('taperedRadial', OUTER, 'oswald', '#e23b2e', { text: 'STRAITS' }),
    ),
  ),
  // The waltz, not the river: set in a ballroom script.
  word(
    'DANUBE',
    '#2f6ea5',
    'velvet',
    composed(set('radial', FULL, 'great-vibes', '#f4f1e8', { caps: false, text: 'Danube' })),
  ),
  word('DUNGEONS', '#2b2620', 'leather', composed(set('radial', FULL, 'pirata-one', '#d9c9a3'))),
  word(
    'DOPE KICKS',
    '#ff5a1f',
    'glitter',
    composed(
      set('taperedRadial', INNER, 'permanent-marker', '#ffffff', { text: 'DOPE' }),
      set('taperedRadial', OUTER, 'permanent-marker', '#ffffff', { text: 'KICKS' }),
    ),
  ),
  word('DEUTERONOMY', '#3b1f0f', 'leather', composed(set('radial', FULL, 'pirata-one', '#e2b84a'))),
  word(
    'DIRTY DANCING',
    '#0d0d0d',
    'velvet',
    composed(
      set('taperedRadial', INNER, 'great-vibes', '#ff4f9a', { text: 'Dirty', caps: false }),
      set('taperedRadial', OUTER, 'great-vibes', '#ff4f9a', { text: 'Dancing', caps: false }),
    ),
  ),
  word(
    'DINNER',
    '#0f6b6b',
    'neon',
    composed(set('radial', FULL, 'lobster', '#ff3b3b', { caps: false, text: 'Dinner' })),
  ),
  word('DILBERT', '#9ea4a8', 'piping', composed(set('radial', FULL, 'overpass', '#1f3a5f'))),
  word(
    'DANGER',
    '#ffd100',
    'flake',
    composed(set('stacked', [0.32, 0.94], 'black-ops-one', '#111111')),
  ),
  word(
    'DEMOCRACY',
    '#1c2c5b',
    'carved',
    composed(set('radial', FULL, 'playfair-display', '#f4f0e6')),
  ),
  word('DEPILATION', '#f3d9c6', 'pave', composed(set('radial', FULL, 'bodoni-moda', '#8e2f45'))),
  word('DEFENSE', '#4b5320', 'bezel', composed(set('radial', FULL, 'anton', '#e8e4d0'))),
  word(
    'DETERRENCE',
    '#2b2f33',
    'chrome',
    composed(set('radial', FULL, 'black-ops-one', '#c9d1d9')),
  ),
  word('DETENTE', '#7a1f1f', 'ice', composed(set('radial', FULL, 'playfair-display', '#f2f2f2'))),
  word(
    'DETRITUS',
    '#5a5246',
    'leather',
    composed(set('radial', FULL, 'special-elite', '#c8bfae', { tracking: 0.3 })),
  ),
  word(
    'DYSFUNCTION',
    '#3c3c3c',
    'flake',
    composed(set('radial', FULL, 'permanent-marker', '#ff7a59')),
  ),
  word('DOVAHKIIN', '#2e3338', 'carved', composed(set('radial', FULL, 'cinzel', '#d9d4c7'))),
  word(
    'DR. DRE',
    '#0d0d0d',
    'gold',
    composed(
      set('taperedRadial', INNER, 'alfa-slab-one', '#c8a24a', { text: 'DR.' }),
      set('taperedRadial', OUTER, 'alfa-slab-one', '#c8a24a', { text: 'DRE' }),
    ),
  ),
  word(
    'DR. DEMENTO',
    '#4b1d6b',
    'glitter',
    composed(
      set('taperedRadial', INNER, 'luckiest-guy', '#ffe14d', { text: 'DR.' }),
      set('taperedRadial', OUTER, 'luckiest-guy', '#ffe14d', { text: 'DEMENTO' }),
    ),
  ),
]

/** Drawing one of a group makes the rest of it six times as likely to be on the same wheel. */
const AFFINITIES: Affinity[] = [
  ['DUNGEONS', 'DRAGONS'],
  ['DONUTS', 'DIET SODA', 'DIABETES'],
  ['DEADLOCK', 'DEPRECATION', 'DOCUMENTATION'],
  ['DIVIDENDS', 'DIVESTMENT'],
  ['DIRIGIBLES', 'DOOM'],
  ['DAFT PUNK', 'DIRE STRAITS', 'DISCO'],
  ['DANUBE', 'DARDANELLES', 'DONBAS'],
  ['DOPPLER RADAR', 'DROUGHT'],
].map((labels) => ({ ids: labels.map(id), boost: 6 }))

export const WHEEL_OF_D_POOL: Pool = { segments: WORDS, draw: 24, affinities: AFFINITIES }

/** A draw from the pool, each word set in a style of its own, on the poster look. */
export const wheelOfD: Preset = {
  version: 5,
  name: 'wheel of D',
  segments: [],
  pool: WHEEL_OF_D_POOL,
  feeds: [],
  overrides: {},
  tricks: [],
  spin: {
    target: { kind: 'fair' },
    motion: { durationMs: 6500, turns: 5, direction: 'cw', easing: [0.15, 0.85, 0.2, 1] },
  },
  branches: [],
  theme: 'poster',
}
