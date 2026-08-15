import type { FontId } from '../slice/types'
import type { PegMode } from './pegs'

/**
 * Every part a theme may switch. `wedge`, `label`, and `pointer` are missing on
 * purpose: a wheel without them is not a wheel.
 */
export type WheelPart =
  | 'stage'
  | 'shadow'
  | 'rim'
  | 'face'
  | 'divider'
  | 'panel'
  | 'inner-shadow'
  | 'sheen'
  | 'peg'
  | 'hub'
  | 'pointer'
  | 'flapper'

export type FlapperMode = 'silent' | 'click' | 'catch'

/** Wheel units against a face radius of 200. The renderer does arithmetic on these. */
export type Metrics = {
  rimWidth: number
  pegRadius: number
  hubRadius: number
  /** The panel's inner and outer edge, as fractions of the face radius. */
  panel: [number, number]
}

export type Theme = {
  id: string
  name: string
  /** Absent means off. A look adds parts rather than subtracting them. */
  parts: Partial<Record<WheelPart, boolean>>
  metrics: Metrics
  /** CSS custom properties, `--wheel-*` and `--wedge-*`. Values only, never rules. */
  tokens: Record<string, string>
  pegs: PegMode
  flapper: FlapperMode
  /**
   * The face its wedges are set in, so the choice belongs to the look rather
   * than to every part. A part's own `font` overrides it.
   */
  font?: FontId
}

export const FLAT_METRICS: Metrics = {
  rimWidth: 0,
  pegRadius: 0,
  hubRadius: 0,
  panel: [0, 0],
}

export function partOn(theme: Theme, part: WheelPart): boolean {
  return theme.parts[part] === true
}
