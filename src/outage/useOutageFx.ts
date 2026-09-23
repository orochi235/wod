import { type RefObject, useEffect, useRef } from 'react'
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
 * the page does.
 */
export function useOutageFx(
  run: OutageRun | null,
  { targetRef, depth, sound, muted, create = createFx }: UseOutageFxOptions,
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
    stop.current = fx.current.play(run, { target, ...settings.current })
  }, [run, targetRef, create])

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
