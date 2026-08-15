import { readNumber, readString } from '../../tricks/params'
import type { PresentationKeyframe, Transition, TransitionContext } from '../types'

const DISTANCE = 1.6
const STAGGER_MS = 60

/**
 * Deterministic in the wedge's position, never Math.random: a re-render must
 * not send a wedge that is already in flight off in a new direction. 137.508
 * is the golden angle, which spreads a small roster (3-8 wedges) evenly.
 */
function scatter(index: number): number {
  return (index * 137.508) % 360
}

function directionOf(params: Record<string, unknown>, ctx: TransitionContext): number | undefined {
  switch (readString(params, 'from', 'side')) {
    case 'top':
      return 0
    case 'random':
      return scatter(ctx.index)
    default:
      // Absent means the wedge's own angle, which only the emitter knows.
      return undefined
  }
}

export const fly: Transition = {
  id: 'fly',
  name: 'Wedges fly in from outside',
  description: 'Each wedge travels in along a radius and settles into its arc.',
  scope: 'wedge',
  moments: ['enter', 'exit'],
  defaults: {
    distance: DISTANCE,
    from: 'side',
    tumbleDeg: 0,
    staggerMs: STAGGER_MS,
    durationMs: 500,
  },
  fields: [
    { key: 'distance', label: 'Distance (radii)', kind: 'slider', min: -1, max: 3, step: 0.1 },
    {
      key: 'from',
      label: 'Comes from',
      kind: 'select',
      options: [
        { value: 'side', label: 'Its own side' },
        { value: 'top', label: 'The top' },
        { value: 'random', label: 'Anywhere' },
      ],
    },
    { key: 'tumbleDeg', label: 'Tumble (deg)', kind: 'slider', min: 0, max: 720, step: 15 },
    { key: 'staggerMs', label: 'Stagger (ms)', kind: 'slider', min: 0, max: 200, step: 5 },
    { key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 0, max: 5000 },
  ],
  frames(params, ctx) {
    const offsetAngle = directionOf(params, ctx)
    const distance = readNumber(params, 'distance', DISTANCE)
    const tumble = readNumber(params, 'tumbleDeg', 0)
    const delayMs = readNumber(params, 'staggerMs', STAGGER_MS) * ctx.index

    // The direction rides on whichever frame carries the nonzero offset. An
    // interrupted transition drops its frame at 0, and a direction declared
    // there would go with it.
    const away: PresentationKeyframe = {
      at: ctx.moment === 'exit' ? 1 : 0,
      opacity: 0,
      scale: 0.9,
      offset: distance,
      // Negated on exit so the wedge keeps turning the same way it arrived,
      // rather than reversing the instant an arrival becomes a departure.
      rotate: ctx.moment === 'exit' ? -tumble : tumble,
    }
    if (offsetAngle !== undefined) away.offsetAngle = offsetAngle

    const settled: PresentationKeyframe = {
      at: ctx.moment === 'exit' ? 0 : 1,
      opacity: 1,
      scale: 1,
      offset: 0,
      rotate: 0,
    }

    return {
      keyframes: ctx.moment === 'exit' ? [settled, away] : [away, settled],
      delayMs,
    }
  },
}
