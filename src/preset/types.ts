import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'

export type SpinSettings = {
  durationMs: number
  fullSpins: number
  /** CSS easing string, handed to the Web Animations API. */
  easing: string
}

export type Preset = {
  version: 1
  name: string
  segments: Segment[]
  tricks: Trick[]
  spin: SpinSettings
}
