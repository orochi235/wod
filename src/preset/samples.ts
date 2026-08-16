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
 * A cash face is a small currency mark with the figure stacked under it, the
 * figures set in a condensed face so they come out tall rather than square in
 * a wedge this narrow. Two parts: the mark is furniture and holds its size,
 * while the figure takes the whole band and tapers down it.
 */
const cashSlice = (mark: string): SliceInstance => ({
  id: 'composed',
  params: {
    parts: [
      {
        content: { from: 'text', value: mark },
        orientation: 'stacked',
        band: [0.86, 0.94],
        maxSize: 13,
      },
      {
        content: { from: 'label', transform: 'digits' },
        orientation: 'stacked',
        band: [0.44, 0.84],
        font: 'bebas-neue',
        stretch: 'fill',
      },
    ],
  },
})

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
        band: [0.44, 0.735],
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
        band: [0.44, 0.94],
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
 * $500 and $600, one high value, and three wedges that end your turn.
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
  '$800',
]

/**
 * Every face carries its own layout rather than inheriting the board's. What a
 * face says is what decides how it is set, and a shared default that suited the
 * cash faces printed a lone currency mark on the two that carry a word.
 */
function faces(): Segment[] {
  let cash = 0
  return FACES.map((label, index) => ({
    id: `face${index + 1}`,
    label,
    weight: 1,
    color: PENALTY_COLORS[label] ?? CASH_COLORS[cash++ % CASH_COLORS.length],
    slice: FACE_SLICES[label] ?? cashSlice('$'),
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
  theme: 'board',
}

export const SAMPLES: Sample[] = [
  {
    id: 'cash-wheel',
    name: 'Cash wheel',
    about: '24 faces, two that cost you',
    preset: cashWheel,
  },
]

export function getSample(id: string): Sample | null {
  return SAMPLES.find((sample) => sample.id === id) ?? null
}
