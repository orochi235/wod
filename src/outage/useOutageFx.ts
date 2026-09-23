import { type RefObject, useEffect, useRef, useState } from 'react'
import type { OutageRun } from '../wheel/useSpin'
import { type CreateFx, type Fx, createFx } from './fx'

export type UseOutageFxOptions = {
  targetRef: RefObject<Element | null>
  depth: number
  sound: boolean
  muted: boolean
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
  { targetRef, depth, sound, muted, create = createFx }: UseOutageFxOptions,
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
    stop.current = fx.current.play(run, { target, ...settings.current })
  }, [run, targetRef, create])

  useEffect(() => {
    if (!run) return
    const from = (ms: number) => Math.max(0, run.startedAt + ms - performance.now())
    const off = window.setTimeout(() => setDark(true), from(run.plan.popAtMs))
    const on = window.setTimeout(() => setDark(false), from(run.plan.lightsAtMs))
    return () => {
      window.clearTimeout(off)
      window.clearTimeout(on)
      setDark(false)
    }
  }, [run])

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
