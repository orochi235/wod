import type { FontId, SliceInstance, SlicePart } from '../slice/types'
import type { Media, Segment } from '../wheel/types'
import type { Affinity, Pool, Preset } from './types'

type Orientation = SlicePart['orientation']
type Style = Omit<SlicePart, 'content' | 'orientation' | 'band' | 'font' | 'color'>

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

const WORDS: Segment[] = [
  word(
    'DOOM',
    '#4a0d12',
    'oil',
    composed(set('stacked', [0.3, 0.94], 'pirata-one', '#e8d9b0', { stretch: 'fill' })),
  ),
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
    composed(
      set('taperedRadial', FULL, 'shadows-into-light', '#cfd8e3', { direction: 'hubOutward' }),
    ),
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
      set('taperedRadial', OUTER, 'permanent-marker', '#3a2f2a', { text: 'DECOU' }),
      set('taperedRadial', INNER, 'special-elite', '#a0522d', { text: 'PAGE' }),
    ),
  ),
  word('DODECAHEDRA', '#24324a', 'bezel', composed(set('radial', FULL, 'geologica', '#9fd3ff'))),
  word('DEPREDATION', '#111111', 'oil', composed(set('radial', FULL, 'pirata-one', '#c4161c'))),
  word(
    'DARK MATTER',
    '#0b0b10',
    'oil',
    composed(
      set('taperedRadial', OUTER, 'monoton', '#2c2c38', { text: 'DARK' }),
      set('taperedRadial', INNER, 'monoton', '#2c2c38', { text: 'MATTER' }),
    ),
  ),
  word(
    'DIET SODA',
    '#4a2a1a',
    'chrome',
    composed(
      set('taperedRadial', OUTER, 'righteous', '#c8ccd2', { text: 'DIET' }),
      set('taperedRadial', INNER, 'righteous', '#eef0f3', { text: 'SODA' }),
    ),
  ),
  word('DORITOS', '#e8641e', 'flake', composed(set('radial', FULL, 'anton', '#1a1a1a'))),
  word(
    'DIFFS',
    '#0d1117',
    'neon',
    composed(
      set('stacked', [0.62, 0.94], 'press-start-2p', '#f85149', { text: 'DIF' }),
      set('stacked', [0.32, 0.6], 'press-start-2p', '#3fb950', { text: 'FS' }),
    ),
  ),
  // The two halves run at each other and stop.
  word(
    'DEADLOCK',
    '#3b3b3b',
    'bezel',
    composed(
      set('stacked', OUTER, 'archivo-black', '#ffcc00', { text: 'DEAD' }),
      set('stacked', INNER, 'archivo-black', '#ffcc00', { text: 'LOCK', direction: 'hubOutward' }),
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
      set('taperedRadial', [0.72, 0.95], 'overpass', '#ff5a5a', { text: 'DIF' }),
      set('taperedRadial', [0.47, 0.7], 'overpass', '#5aff8a', { text: 'FRAC' }),
      set('taperedRadial', [0.26, 0.45], 'overpass', '#5a9bff', { text: 'TION' }),
    ),
  ),
  word(
    'DILEMMAS',
    '#5a4632',
    'carved',
    composed(
      set('taperedRadial', OUTER, 'abril-fatface', '#f4e3c1', { text: 'DILEM' }),
      set('taperedRadial', INNER, 'abril-fatface', '#c49a6c', { text: 'MAS' }),
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
  word('DUNGEONS', '#2b2620', 'leather', composed(set('radial', FULL, 'pirata-one', '#d9c9a3'))),
]

/** Drawing one of these makes the rest of its group six times as likely. */
const AFFINITIES: Affinity[] = [
  ['DUNGEONS', 'DRAGONS'],
  ['DONUTS', 'DIET SODA', 'DIABETES'],
  ['DIFFS', 'DEADLOCK', 'DEPRECATION', 'DOCUMENTATION'],
  ['DIVIDENDS', 'DIVESTMENT'],
  ['DIRIGIBLES', 'DOOM'],
].map((labels) => ({ ids: labels.map(id), boost: 6 }))

export const WHEEL_OF_D_POOL: Pool = { segments: WORDS, draw: 24, affinities: AFFINITIES }

/** Twenty-four words drawn from forty, each set in a style of its own, on the poster look. */
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
