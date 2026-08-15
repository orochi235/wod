import { readNumber } from '../../tricks/params'
import type { Transition } from '../types'

const STAGGER_MS = 0

export const shrink: Transition = {
  id: 'shrink',
  name: 'Wedges shrink away',
  description: 'The arc itself closes, and the wedges beside it grow into the space.',
  scope: 'wedge',
  moments: ['enter', 'exit'],
  defaults: { durationMs: 500, staggerMs: STAGGER_MS },
  fields: [
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
  ],
  frames(params, ctx) {
    const [from, to] = ctx.moment === 'exit' ? [1, 0] : [0, 1]
    return {
      keyframes: [
        { at: 0, hold: from, scale: from, opacity: from },
        { at: 1, hold: to, scale: to, opacity: to },
      ],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
      easing: 'easeInOut',
    }
  },
}
