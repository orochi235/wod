import type { Preset } from './types'

/**
 * The free beer wedge is not here. It belongs to the takeover trick, which
 * contributes it at weight 0 — so the wheel shows five names until the trick
 * grows a sixth wedge out of nothing.
 */
export const DEFAULT_PRESET: Preset = {
  version: 4,
  name: 'standup',
  segments: [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
    { id: 'cal', label: 'Cal', weight: 1 },
    { id: 'dee', label: 'Dee', weight: 1 },
    { id: 'eli', label: 'Eli', weight: 1 },
  ],
  feeds: [
    {
      kind: 'simulated',
      id: 'sim',
      defaults: { weight: 1 },
      // Deliberately disjoint from the static names above: the wedge ids never
      // collide, so a shared name would render twice with nothing marking which
      // wedge came from the feed.
      pool: ['Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lou'],
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
