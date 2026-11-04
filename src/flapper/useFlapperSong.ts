import { useCallback, useEffect, useRef, useState } from 'react'
import type { PegSchedule } from '../wheel/conductor'
import { fitSpin, scheduleFor } from '../wheel/fit'
import { type Melody, melodyUnits } from '../wheel/melody'
import type { RotationTrack } from '../wheel/rotation'
import { getSong } from '../wheel/songs'
import type { SpinConfig } from '../wheel/types'

/** The flapper's song, and how a spin is shaped around it when the spin is fitted to the song. */
export function useFlapperSong() {
  const [songId, setSongId] = useState('')
  const [fit, setFit] = useState(false)
  const [melody, setMelody] = useState<Melody | null>(null)
  const scheduleRef = useRef<PegSchedule | null>(null)

  useEffect(() => {
    setMelody(null)
    const song = getSong(songId)
    if (!song) return
    let current = true
    song
      .load()
      .then((loaded) => {
        if (current) setMelody(loaded)
      })
      .catch((failure) => console.warn(`flapper song ${song.name} did not load:`, failure))
    return () => {
      current = false
    }
  }, [songId])

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

  return { songId, setSongId, fit, setFit, melody, scheduleRef, shape }
}
