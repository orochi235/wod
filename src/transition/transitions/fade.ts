import { readNumber } from '../../tricks/params'
import type { Transition } from '../types'

const STAGGER_MS = 40

export const fade: Transition = {
  id: 'fade',
  name: 'Wedges fade in',
  description: 'Opacity only. What every transition becomes under reduced motion.',
  scope: 'wedge',
  moments: ['enter', 'exit'],
  defaults: { durationMs: 400, staggerMs: STAGGER_MS },
  fields: [
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
  ],
  frames(params, ctx) {
    const [from, to] = ctx.moment === 'exit' ? [1, 0] : [0, 1]
    return {
      keyframes: [
        { at: 0, opacity: from },
        { at: 1, opacity: to },
      ],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
    }
  },
}
