import { type RefObject, useEffect, useRef } from 'react'
import type { Motion } from '../clock/motion'
import type { OutageRun } from '../wheel/useSpin'
import { type CreateFx, type Fx, createFx } from './fx'
import { darkVoice } from './voices'

export type UseOutageFxOptions = {
  targetRef: RefObject<Element | null>
  depth: number
  sound: boolean
  muted: boolean
  motion: Motion
  /** Undefined uses magicsmoke and Web Audio; tests pass a fake. */
  create?: CreateFx
}

/**
 * Plays each outage once, from the moment its spin starts. A run ending does not
 * stop it — the chord rings on past the landing — only a newer run or leaving
 * the page does. Whether the room is dark is on the wheel mix's `dark` channel.
 */
export function useOutageFx(
  run: OutageRun | null,
  { targetRef, depth, sound, muted, motion, create = createFx }: UseOutageFxOptions,
): void {
  const fx = useRef<Fx | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const settings = useRef({ depth, sound, muted })
  settings.current = { depth, sound, muted }

  useEffect(() => {
    const target = targetRef.current
    if (!run || !target) return
    stop.current?.()
    fx.current ??= create()
    stop.current = fx.current.play(run, { target, motion, ...settings.current })
  }, [run, targetRef, create, motion])

  useEffect(() => {
    if (!run) return
    const { ticker, wheel } = motion
    const voice = wheel.cue(darkVoice(run.plan, run.startedAt))
    ticker.wake()
    return () => voice.fade({ over: 0 })
  }, [run, motion])

  useEffect(() => {
    fx.current?.setMuted(muted)
  }, [muted])

  useEffect(
    () => () => {
      stop.current?.()
      fx.current?.dispose()
    },
    [],
  )
}
