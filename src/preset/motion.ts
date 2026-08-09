import type { Morph, SpinConfig } from '../wheel/types'
import type { Motion } from './types'

export function spinConfigOf(motion: Motion, morphs: Morph[]): SpinConfig {
  return {
    durationMs: motion.durationMs,
    fullSpins: motion.turns,
    direction: motion.direction,
    easing: motion.easing,
    ...(motion.settle ? { settle: motion.settle } : {}),
    morphs,
  }
}
