import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PegSchedule } from '../wheel/conductor'
import { fitSpin, scheduleFor } from '../wheel/fit'
import { excerpt, type Melody, melodyUnits } from '../wheel/melody'
import type { RotationTrack } from '../wheel/rotation'
import { getSong } from '../wheel/songs'
import type { SpinConfig } from '../wheel/types'

/** The flapper's song, and how a spin is shaped around it when the spin is fitted to the song. */
export function useFlapperSong() {
  const [songId, setSongId] = useState('')
  const [fit, setFit] = useState(false)
  const [whole, setWhole] = useState<Melody | null>(null)
  const [bars, setBars] = useState<{ from: number; to: number } | null>(null)
  const scheduleRef = useRef<PegSchedule | null>(null)

  useEffect(() => {
    setWhole(null)
    setBars(null)
    const song = getSong(songId)
    if (!song) return
    let current = true
    song
      .load()
      .then((loaded) => {
        if (!current) return
        setWhole(loaded)
        setBars(loaded.bars ? defaultBars(loaded.bars) : null)
      })
      .catch((failure) => console.warn(`flapper song ${song.name} did not load:`, failure))
    return () => {
      current = false
    }
  }, [songId])

  /** What the flapper plays: the chosen bars, or the whole tune where it has none. */
  const melody = useMemo(
    () => (whole && bars ? excerpt(whole, bars.from, bars.to) : whole),
    [whole, bars],
  )

  /**
   * The config a spin should run and a hook to hear its track. Fitted, the spin
   * lasts as long as the song and the track maps every peg onto it; otherwise the
   * config is untouched and the tune follows the wheel.
   */
  const shape = useCallback(
    (config: SpinConfig, pegs: number[]) => {
      scheduleRef.current = null
      if (!fit || !melody || pegs.length === 0 || config.outage) return { config }
      const units = melodyUnits(melody)
      const fitted = fitSpin(config, pegs, units, melody.unitS)
      return {
        config: fitted.config,
        onTrack: (track: RotationTrack) => {
          scheduleRef.current = scheduleFor(track, pegs, units, fitted.threshold)
        },
      }
    },
    [fit, melody],
  )

  const barCount = whole?.bars?.length ?? 0
  return { songId, setSongId, fit, setFit, melody, bars, setBars, barCount, scheduleRef, shape }
}

/** Sixteen bars from the one the tune comes in on, a pickup included. */
const DEFAULT_BARS = 16

function defaultBars(starts: number[]): { from: number; to: number } {
  // The first tone sits at 0, so its bar is the last one starting at or before it.
  const entry = Math.max(
    0,
    starts.findIndex((start, i) => start <= 1e-9 && (starts[i + 1] ?? Infinity) > 1e-9),
  )
  const from = entry + 1
  return { from, to: Math.min(starts.length, from + DEFAULT_BARS - 1) }
}
