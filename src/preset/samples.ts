import { LOOK_NAMES, type LookName } from 'klieg'
import { cash } from '../slice/layouts/cash'
import type { SliceInstance } from '../slice/types'
import type { Segment } from '../wheel/types'
import type { Preset } from './types'

export type Sample = {
  id: string
  name: string
  /** One line, shown beside the name wherever a sample is offered. */
  about: string
  preset: Preset
}

/**
 * Every money face is this one layout with the same params — the board's
 * figures are the wedge labels, so nothing about a face is per-wedge. The two
 * that carry a word override it on the wedge itself.
 */
const CASH_SLICE: SliceInstance = { id: 'cash', params: { ...cash.defaults } }

/** Bright, saturated, and cycled rather than assigned — no wedge means its color. */
const CASH_COLORS = [
  '#e8442a',
  '#f5a623',
  '#f7e14a',
  '#4caf50',
  '#26a69a',
  '#3f8ee0',
  '#8e5bd0',
  '#ec6ca8',
]

/** Black and white, the two the show reserves for the wedges that cost you. */
const PENALTY_COLORS: Record<string, string> = {
  BANKRUPT: '#0b0b0d',
  'LOSE A TURN': '#f2f2f2',
}

/**
 * The metals a winner is announced in. Cycled like the colors — no face means
 * its own metal — except the one that takes the round off you, which is
 * iridescent near-black however much the wedge tints it.
 */
const SOLVENT_LOOKS = ['gold', 'gem']
const BANKRUPT_LOOK = 'oil'

/**
 * The one face that is set rather than stacked: LOSE around the rim, A on a
 * line of its own, TURN down the wedge. Three words stacked end to end would
 * solve to the floor and read as one long column of letters.
 */
const LOSE_A_TURN_SLICE: SliceInstance = {
  id: 'composed',
  params: {
    parts: [
      {
        content: { from: 'text', value: 'LOSE' },
        orientation: 'archedRim',
        band: [0.82, 0.95],
        caps: true,
      },
      {
        // Capped, and not stretched: one letter given a band to itself takes
        // all of it, and the article is the smallest word on the face.
        content: { from: 'text', value: 'A' },
        orientation: 'stacked',
        band: [0.745, 0.825],
        caps: true,
        maxSize: 14,
      },
      {
        content: { from: 'text', value: 'TURN' },
        orientation: 'stacked',
        band: [0.35, 0.735],
        caps: true,
        stretch: 'fill',
      },
    ],
  },
}

/** A word, not a figure: no currency mark, and the whole band to spell it in. */
const BANKRUPT_SLICE: SliceInstance = {
  id: 'composed',
  params: {
    parts: [
      {
        content: { from: 'label' },
        orientation: 'stacked',
        band: [0.35, 0.94],
        caps: true,
        stretch: 'fill',
      },
    ],
  },
}

/** The faces that carry a word instead of a figure, and are set as one. */
const FACE_SLICES: Record<string, SliceInstance> = {
  'LOSE A TURN': LOSE_A_TURN_SLICE,
  BANKRUPT: BANKRUPT_SLICE,
}

/**
 * A round's worth of cash, in the proportions the board is stacked in: a lot of
 * $500 and $600, one top-dollar space, and three wedges that end your turn.
 */
const FACES = [
  '$900',
  '$700',
  'BANKRUPT',
  '$600',
  '$650',
  '$500',
  '$600',
  '$550',
  '$500',
  '$600',
  'LOSE A TURN',
  '$650',
  '$500',
  '$700',
  '$500',
  '$600',
  '$550',
  '$500',
  '$600',
  'BANKRUPT',
  '$650',
  '$500',
  '$700',
  '$5000',
]

/**
 * Every face carries its own layout rather than inheriting the board's. What a
 * face says is what decides how it is set, and a shared default that suited the
 * cash faces printed a lone currency mark on the two that carry a word.
 */
function faces(): Segment[] {
  let cash = 0
  let solvent = 0
  return FACES.map((label, index) => ({
    id: `face${index + 1}`,
    label,
    weight: 1,
    color: PENALTY_COLORS[label] ?? CASH_COLORS[cash++ % CASH_COLORS.length],
    slice: FACE_SLICES[label],
    look: label === 'BANKRUPT' ? BANKRUPT_LOOK : SOLVENT_LOOKS[solvent++ % SOLVENT_LOOKS.length],
  }))
}

/**
 * The wheel this app is named after, near enough to recognise: 24 faces, the
 * two that cost you, and no roster behind it. Nothing here is a reproduction of
 * a real board — the values and their order are a plausible arrangement.
 */
const cashWheel: Preset = {
  version: 5,
  name: 'cash wheel',
  segments: faces(),
  feeds: [],
  overrides: {},
  tricks: [],
  spin: {
    target: { kind: 'fair' },
    motion: {
      // Longer and slower than the roster wheel: 24 narrow faces go past the
      // flapper fast enough that a short spin is a blur and a rattle.
      durationMs: 6500,
      turns: 5,
      direction: 'cw',
      easing: [0.15, 0.85, 0.2, 1],
    },
  },
  branches: [],
  slice: CASH_SLICE,
  theme: 'board',
}

/**
 * A color per material, so a face previews the metal it announces in. Keyed by
 * the library's own names: a klieg that ships a thirteenth material fails the
 * build here rather than drawing a wedge with no color.
 */
const SPECIMEN_COLORS: Record<LookName, string> = {
  gold: '#f5a623',
  chrome: '#c9d2dc',
  oil: '#15161c',
  gem: '#d63054',
  velvet: '#5b2a86',
  neon: '#ff2fb3',
  flake: '#2f6fd0',
  glitter: '#c04ad0',
  leather: '#7a4a2b',
  tubing: '#4a90a4',
  piping: '#efe6d2',
  sequin: '#1fa89a',
}

/**
 * One word down the wedge, glyphs left in proportion. Twelve wedges are wide
 * enough that `stretch: 'fill'` — which the cash wheel's narrow faces want —
 * pulls a seven-letter name out of shape.
 */
const SPECIMEN_SLICE: SliceInstance = {
  id: 'composed',
  params: {
    parts: [
      {
        content: { from: 'label' },
        orientation: 'stacked',
        band: [0.3, 0.94],
        caps: true,
      },
    ],
  },
}

function specimens(): Segment[] {
  return LOOK_NAMES.map((look, index) => ({
    id: `look${index + 1}`,
    label: look.toUpperCase(),
    weight: 1,
    color: SPECIMEN_COLORS[look],
    look,
  }))
}

/**
 * Every material the library carries, each face announcing itself in its own.
 *
 * `flat` rather than the board: `wof` and the themes built on it set
 * `tint: 'wedge'`, which recolors the banner with the landed wedge's color and
 * would draw all twelve materials in the one hue.
 */
const materialSpecimen: Preset = {
  version: 5,
  name: 'material specimen',
  segments: specimens(),
  feeds: [],
  overrides: {},
  tricks: [],
  spin: {
    target: { kind: 'fair' },
    motion: {
      durationMs: 5200,
      turns: 4,
      direction: 'cw',
      easing: [0.15, 0.85, 0.2, 1],
    },
  },
  branches: [],
  slice: SPECIMEN_SLICE,
  theme: 'flat',
}

export const SAMPLES: Sample[] = [
  {
    id: 'cash-wheel',
    name: 'Cash wheel',
    about: '24 faces, two that cost you',
    preset: cashWheel,
  },
  {
    id: 'materials',
    name: 'Material specimen',
    about: 'every metal a winner can be announced in',
    preset: materialSpecimen,
  },
]

export function getSample(id: string): Sample | null {
  return SAMPLES.find((sample) => sample.id === id) ?? null
}
