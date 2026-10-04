import { type Kit, type Mix, hex, kit, last, max, mix, sum } from '@msb235/blits'
import { useState } from 'react'
import type { Media, Reveal } from '../wheel/types'
import { type Ticker, type TickerTiming, createTicker } from './ticker'

export type WheelPose = {
  blackout?: number
  dark?: boolean
  /** Unwrapped degrees clockwise. Wrap it only where it is drawn. */
  angle?: number
  /** Degrees per millisecond, signed, from the track's own slope. */
  speed?: number
  /** The flapper arm's turn, degrees. */
  deflection?: number
}

/** The wheel mix's one subject. */
export const WHEEL = 'wheel'

// blits' stock `last` flips halfway between stops; a schedule means the stop itself.
const atStop = <V>(a: V, b: V, u: number): V => (u < 1 ? a : b)

export const wheelKit: Kit<WheelPose> = kit<WheelPose>({
  blackout: max(),
  dark: last<boolean>({ lerp: atStop }),
  angle: sum(),
  speed: sum(),
  deflection: sum(),
})

/** A wedge's change from its roster entry. `weight` is a delta; `color` is `0xrrggbb`. */
export type WedgePose = {
  weight?: number
  color?: number
  label?: string
  media?: Media
  /** `null` clears the wedge's reveal, as a swap does to a wedge that had none. */
  reveal?: Reveal | null
}

export const wedgeKit: Kit<WedgePose> = kit<WedgePose>({
  // No bounds: a bound on the delta would clamp a vanish. The floor at 0 is wod's, in compose.
  weight: sum(),
  color: hex(),
  label: last<string>({ lerp: atStop }),
  media: last<Media>({ lerp: atStop }),
  reveal: last<Reveal>({ lerp: atStop }),
})

export type Motion = {
  ticker: Ticker
  wheel: Mix<string, WheelPose>
  wedges: Mix<string, WedgePose>
}

export function createMotion(timing?: TickerTiming): Motion {
  const wheel = mix<string, WheelPose>(wheelKit)
  const wedges = mix<string, WedgePose>(wedgeKit)
  return { ticker: createTicker([wheel, wedges], timing), wheel, wedges }
}

/** One motion per page, made on first render. Its owners unsubscribe; it holds nothing itself. */
export function useMotionRoot(): Motion {
  const [motion] = useState(() => createMotion())
  return motion
}
