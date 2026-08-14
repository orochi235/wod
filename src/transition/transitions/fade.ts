import { readNumber } from '../../tricks/params'
import type { Transition } from '../types'

const STAGGER_MS = 40

export const fade: Transition = {
  id: 'fade',
  name: 'Wedges fade in',
  description: 'Opacity only. What every transition becomes under reduced motion.',
  scope: 'wedge',
  defaults: { durationMs: 400, staggerMs: STAGGER_MS },
  fields: [
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
  ],
  frames(params, ctx) {
    return {
      keyframes: [
        { at: 0, opacity: 0 },
        { at: 1, opacity: 1 },
      ],
      delayMs: readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index,
    }
  },
}
