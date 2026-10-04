import { type RefObject, useEffect, useRef, useState } from 'react'
import { type Motion, WHEEL } from '../clock/motion'
import type { OutageRun } from '../wheel/useSpin'
import { type CreateFx, type Fx, createFx } from './fx'
import { darkPatch } from './voices'

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
 * the page does. Returns whether the room is dark right now, from the pop until
 * the lights come back, for anything else on the page that should go quiet.
 */
export function useOutageFx(
  run: OutageRun | null,
  { targetRef, depth, sound, muted, motion, create = createFx }: UseOutageFxOptions,
): boolean {
  const [dark, setDark] = useState(false)
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
    const voice = wheel.cue({
      patch: darkPatch(run.plan),
      subjects: [WHEEL],
      start: run.startedAt,
      loop: false,
    })
    const off = ticker.subscribe(() => setDark(wheel.probe(WHEEL).dark ?? false))
    ticker.wake()
    return () => {
      off()
      voice.fade({ over: 0 })
      setDark(false)
    }
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

  return dark
}
