import { readNumber } from '../params'
import type { Cue, Recipe, TrickParams } from '../types'

export const outage: Recipe = {
  id: 'outage',
  name: 'The wheel shorts out',
  description:
    'The wheel spins at full speed while sparks escalate, blows, and the room goes dark; the lights flicker back and the spin carries on. One per spin: the first one listed runs.',
  defaults: { cruiseS: 10, sparkS: 5 },
  fields: [
    { key: 'cruiseS', label: 'Full speed for (s)', kind: 'slider', min: 3, max: 30, step: 1 },
    { key: 'sparkS', label: 'Sparks build for (s)', kind: 'slider', min: 1, max: 10, step: 0.5 },
  ],

  provides: () => [],
  resolve: () => [],

  cues(params: TrickParams): Cue[] {
    const cruiseS = Math.min(30, Math.max(3, readNumber(params, 'cruiseS', 10)))
    const sparkS = Math.min(10, Math.max(1, readNumber(params, 'sparkS', 5)))
    return [{ kind: 'outage', cruiseMs: cruiseS * 1000, sparkMs: sparkS * 1000 }]
  },

  writes: () => [],
  validate: () => null,
}
