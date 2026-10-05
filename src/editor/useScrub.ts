import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { type BlackoutCover, createBlackoutCover } from '../outage/blackout'
import type { Theme } from '../wheel/theme'
import type { Segment } from '../wheel/types'
import type { SpinOverride, UseSpinResult } from '../wheel/useSpin'
import { recordShow } from './recordShow'

export type UseScrubOptions = {
  spinner: Pick<UseSpinResult, 'preview' | 'pose' | 'isSpinning'>
  /** What a press of Spin would pass; keep it stable, or every render plans again. */
  override: SpinOverride
  theme: Theme
  /** How dark the blackout gets, 0..1. */
  depth: number
}

export type Scrub = {
  /** The whole show; 0 when there is nothing to spin. */
  durationMs: number
  valueMs: number
  /** The wheel at the scrubbed instant, or null while not scrubbing. */
  segments: Segment[] | null
  /** The flapper arm at the scrubbed instant, or undefined while not scrubbing. */
  flapperDeg: number | undefined
  scrub(ms: number): void
  /** Hands the rotor, the arm and the window back. */
  leave(): void
}

/**
 * The editor's scrub through the spin a press of Spin would make: rotation,
 * outage, morphs and flapper, at any instant, forward or back. Silent: it
 * records the show on a clock of its own and paints the projection, so no
 * sparks fire and no audio is made.
 */
export function useScrub({ spinner, override, theme, depth }: UseScrubOptions): Scrub {
  const { preview, pose, isSpinning } = spinner
  const [ms, setMs] = useState<number | null>(null)
  const scrubbing = ms !== null

  // biome-ignore lint/correctness/useExhaustiveDependencies: a landing moves the resting angle the preview turns from, and `isSpinning` is what says one happened.
  const show = useMemo(() => preview(override), [preview, override, isSpinning])
  const recording = useMemo(
    () => (scrubbing && show ? recordShow(show, { theme, depth }) : null),
    [scrubbing, show, theme, depth],
  )
  const frame = useMemo(() => (recording && ms !== null ? recording.at(ms) : null), [recording, ms])
  const leave = useCallback(() => setMs(null), [])

  const [cover, setCover] = useState<BlackoutCover | null>(null)
  useLayoutEffect(() => {
    if (!scrubbing) return
    const made = createBlackoutCover()
    setCover(made)
    return () => {
      made.remove()
      setCover(null)
      pose(null)
    }
  }, [scrubbing, pose])

  useLayoutEffect(() => {
    if (!show || !frame || ms === null) return
    pose(show.track, ms)
    cover?.set(frame.wheel.blackout ?? 0)
  }, [show, frame, ms, pose, cover])

  return {
    durationMs: show?.track.durationMs ?? 0,
    valueMs: ms ?? 0,
    segments: frame?.segments ?? null,
    flapperDeg: frame ? (frame.wheel.deflection ?? 0) : undefined,
    scrub: setMs,
    leave,
  }
}
