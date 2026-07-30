import type { Preset } from './types'

/**
 * The free beer wedge is not here. It belongs to the takeover trick, which
 * contributes it at weight 0 — so the wheel shows five names until the trick
 * grows a sixth wedge out of nothing.
 */
export const DEFAULT_PRESET: Preset = {
  version: 1,
  name: 'standup',
  segments: [
    { id: 'ana', label: 'Ana', weight: 1 },
    { id: 'ben', label: 'Ben', weight: 1 },
    { id: 'cal', label: 'Cal', weight: 1 },
    { id: 'dee', label: 'Dee', weight: 1 },
    { id: 'eli', label: 'Eli', weight: 1 },
  ],
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
    durationMs: 4500,
    fullSpins: 6,
    easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
  },
}
