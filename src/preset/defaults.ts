import { cryptoRng } from '../wheel/selection'
import { sampleNames } from './fb94'
import type { Preset } from './types'

const STATIC_COUNT = 5
const POOL_COUNT = 7

/**
 * One draw covers both lists, so a pool name can never equal a static one. A
 * shared name would render twice with nothing marking which wedge came from
 * the feed, and the ids would not collide to make it obvious.
 */
const cast = sampleNames(STATIC_COUNT + POOL_COUNT, cryptoRng)

/**
 * The free beer wedge is not here. It belongs to the takeover trick, which
 * contributes it at weight 0 — so the wheel shows five names until the trick
 * grows a sixth wedge out of nothing.
 */
export const DEFAULT_PRESET: Preset = {
  version: 4,
  name: 'standup',
  segments: cast.slice(0, STATIC_COUNT).map((label, index) => ({
    id: `seg${index + 1}`,
    label,
    weight: 1,
  })),
  feeds: [
    {
      kind: 'simulated',
      id: 'sim',
      defaults: { weight: 1 },
      pool: cast.slice(STATIC_COUNT),
      autochurn: { intervalMs: 2500, targetSize: 5, volatility: 0.25 },
    },
  ],
  overrides: {},
  tricks: [
    {
      id: 'beer',
      name: 'slow burn',
      recipe: 'takeover',
      params: {
        wedgeMode: 'new',
        wedgeLabel: 'free beer',
        wedgeColor: '#ffd166',
        wedgeSegmentId: '',
        holdUntil: 0.6,
        endShare: 1,
        endColor: '#ff8811',
        easing: 'easeIn',
      },
      enabled: false,
    },
  ],
  spin: {
    target: { kind: 'fair' },
    motion: {
      durationMs: 4500,
      turns: 6,
      direction: 'cw',
      easing: [0.1, 0.8, 0.2, 1],
    },
  },
  branches: [],
}
