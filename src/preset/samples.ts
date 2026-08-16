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
 * Upright letters stacked rim inward, each stretched to the chord at its own
 * radius — how a board of this shape has always been painted, and what the
 * taper is for. One part: a cash value is one token, and the name plate's
 * given-name-plus-surname split has nothing to divide.
 */
const VALUE_SLICE: SliceInstance = {
  id: 'composed',
  params: {
    parts: [
      {
        content: { from: 'label' },
        orientation: 'stacked',
        band: [0.44, 0.92],
        caps: true,
        stretch: 'fill',
      },
    ],
  },
}

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

function faces(): Segment[] {
  let cash = 0
  return FACES.map((label, index) => ({
    id: `face${index + 1}`,
    label,
    weight: 1,
    color: PENALTY_COLORS[label] ?? CASH_COLORS[cash++ % CASH_COLORS.length],
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
  slice: VALUE_SLICE,
  theme: 'wof',
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
