import type { EasingName } from '../wheel/types'

/** Shared by trick morphs and presence transitions, so neither imports the other. */
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
}

/** When each easing reaches a given progress: a morph's stops sit on progress, blits' on time. */
export const EASING_INVERSES: Record<EasingName, (y: number) => number> = {
  linear: (y) => y,
  easeIn: (y) => Math.sqrt(y),
  easeOut: (y) => 1 - Math.sqrt(1 - y),
  easeInOut: (y) => (y < 0.5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2)),
}
