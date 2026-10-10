import {
  type Kit,
  type Mix,
  type Ticker,
  type TickerOptions,
  kit,
  last,
  max,
  mix,
  mixHex,
  sum,
  ticker,
} from '@msb235/blits'
import { useEffect, useState } from 'react'
import { type PresencePose, presenceChannels } from '../transition/channels'
import type { Media, Reveal } from '../wheel/types'

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
export type TrickPose = {
  weight?: number
  color?: number
  label?: string
  media?: Media
  /** `null` clears the wedge's reveal, as a swap does to a wedge that had none. */
  reveal?: Reveal | null
}

export type WedgePose = TrickPose & PresencePose

const trickChannels: Kit<TrickPose> = kit<TrickPose>({
  // No bounds: a bound on the delta would clamp a vanish. The floor at 0 is wod's, in compose.
  weight: sum(),
  color: last<number>({ lerp: mixHex }),
  label: last<string>({ lerp: atStop }),
  media: last<Media>({ lerp: atStop }),
  reveal: last<Reveal>({ lerp: atStop }),
})

export const wedgeKit: Kit<WedgePose> = kit<WedgePose>({
  ...trickChannels,
  ...presenceChannels,
})

export type Motion = {
  ticker: Ticker
  wheel: Mix<string, WheelPose>
  wedges: Mix<string, WedgePose>
}

/** `historyMs`: how far back `project` may read on both mixes. */
export type MotionOptions = { historyMs?: number }

/** What a motion's ticker runs on, when not the page's own frames and clock. */
export type MotionTiming = Pick<TickerOptions, 'now' | 'raf' | 'caf'>

// The rotor's WAAPI animation runs on the document timeline; the mixes must read the same clock.
const timelineNow = () =>
  (globalThis.document?.timeline?.currentTime as number | null | undefined) ?? performance.now()

export function createMotion(timing?: MotionTiming, { historyMs }: MotionOptions = {}): Motion {
  const options = historyMs ? { history: { ms: historyMs } } : {}
  const wheel = mix<string, WheelPose>(wheelKit, options)
  const wedges = mix<string, WedgePose>(wedgeKit, options)
  const loop = ticker({ now: timelineNow, ...timing })
  loop.add(wheel)
  loop.add(wedges)
  return { ticker: loop, wheel, wedges }
}

/** One motion per page, made on first render; leaving the page cancels its waiting frame. */
export function useMotionRoot(): Motion {
  const [motion] = useState(() => createMotion())
  useEffect(() => {
    const { ticker, wheel, wedges } = motion
    // Adding a mix again asks for a frame: a StrictMode remount restarts the loop it stopped.
    ticker.add(wheel)
    ticker.add(wedges)
    return () => ticker.stop()
  }, [motion])
  return motion
}
