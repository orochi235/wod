import { type Kit, type Mix, kit, last, max, mix } from '@msb235/blits'
import { useState } from 'react'
import { type Ticker, type TickerTiming, createTicker } from './ticker'

export type WheelPose = { blackout?: number; dark?: boolean }

/** The wheel mix's one subject. */
export const WHEEL = 'wheel'

// blits' stock `last` flips halfway between stops; a schedule means the stop itself.
const atStop = <V>(a: V, b: V, u: number): V => (u < 1 ? a : b)

export const wheelKit: Kit<WheelPose> = kit<WheelPose>({
  blackout: max(),
  dark: last<boolean>({ lerp: atStop }),
})

export type Motion = { ticker: Ticker; wheel: Mix<string, WheelPose> }

export function createMotion(timing?: TickerTiming): Motion {
  const wheel = mix<string, WheelPose>(wheelKit)
  return { ticker: createTicker([wheel], timing), wheel }
}

/** One motion per page, made on first render. Its owners unsubscribe; it holds nothing itself. */
export function useMotionRoot(): Motion {
  const [motion] = useState(() => createMotion())
  return motion
}
