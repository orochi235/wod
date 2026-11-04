import {
  type Conductor,
  createConductor,
  createScheduledConductor,
  MIN_UNIT_S,
  type PegSchedule,
} from './conductor'
import {
  type Melody,
  melodyUnits,
  pitchesOf,
  renderVoices,
  sliceTimes,
  VOICE_S,
  type Voices,
} from './melody'

/** A frame that passed more pegs than this was a stall, not a spin. */
const MAX_PER_FRAME = 8

/** Quiet this long and the next hit starts the tune over, so each spin begins at its first note. */
const RESTART_AFTER_S = 1.5

export type Clicker = {
  /** Browsers refuse audio until a gesture; call this from one. */
  unlock(): void
  setMuted(muted: boolean): void
  /** Play a tune on the pegs instead of the tick, at a tempo that follows the wheel; null goes back to the tick. */
  setMelody(melody: Melody | null): void
  /**
   * Play the next spin's pegs from a schedule worked out ahead, so the tune ends
   * as the wheel lands; null goes back to following the wheel. Takes effect from
   * the next peg, so set it before the spin's first one.
   */
  setSchedule(schedule: PegSchedule | null): void
  /** `count` pegs went by, at `speed` degrees per millisecond. */
  click(count: number, speed: number): void
  close(): void
}

export function createClicker(): Clicker {
  let ctx: AudioContext | null = null
  let unlocked = false
  let muted = false
  // The tune's notes are known at once; only its voices wait on a render.
  let notes: { midi: number; duration: number }[] = []
  let voices: Voices | null = null
  let wanted: Melody | null = null
  let units: number[] = []
  let conductor: Conductor | null = null
  let scheduled: ReturnType<typeof createScheduledConductor> | null = null
  let lastFrameAt = -Infinity
  // Seconds between pegs, smoothed over frames: a single frame's timing jitters.
  let pegInterval = MIN_UNIT_S
  // False until a spin's first gap is measured; the last spin's slow tail says nothing about this one.
  let measured = false
  let ringing: { source: AudioBufferSourceNode; gain: GainNode } | null = null

  const context = (): AudioContext | null => {
    if (ctx) return ctx
    const Ctor = typeof AudioContext === 'function' ? AudioContext : null
    if (!Ctor) return null
    ctx = new Ctor()
    return ctx
  }

  const tick = (at: number, speed: number) => {
    const audio = context()
    if (!audio) return
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    // A fast wheel rings higher and louder, the way a struck peg does.
    osc.frequency.setValueAtTime(900 + Math.min(speed, 3) * 400, at)
    gain.gain.setValueAtTime(0.06 + Math.min(speed, 3) * 0.02, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(at)
    osc.stop(at + 0.04)
  }

  const note = (at: number, index: number) => {
    const audio = context()
    const played = notes[index]
    const offset = played && voices?.offsetOf.get(played.midi)
    if (!audio || !voices || offset === undefined) return
    // The next note cuts the one before it, so a note never outlasts its share of the tempo.
    if (ringing) {
      ringing.gain.gain.cancelScheduledValues(at)
      ringing.gain.gain.setTargetAtTime(0, at, 0.004)
      ringing.source.stop(at + 0.04)
    }
    const length = Math.min(played.duration, VOICE_S)
    const source = audio.createBufferSource()
    const gain = audio.createGain()
    source.buffer = voices.buffer
    // A note shorter than the strike fades out by its end rather than stopping dead.
    gain.gain.setValueAtTime(1, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + length)
    source.connect(gain)
    gain.connect(audio.destination)
    source.start(at, offset, length)
    ringing = { source, gain }
  }

  return {
    unlock() {
      unlocked = true
      context()?.resume()
    },
    setMuted(next: boolean) {
      muted = next
    },
    setMelody(melody: Melody | null) {
      wanted = melody
      voices = null
      scheduled = null
      if (!melody) {
        notes = []
        units = []
        conductor = null
        return
      }
      const pitches = pitchesOf(melody)
      notes = sliceTimes(melody.tones).map((slice, i) => ({
        midi: pitches[i],
        duration: slice.duration,
      }))
      units = melodyUnits(melody)
      conductor = units.length > 0 ? createConductor(units) : null
      void renderVoices(melody).then((rendered) => {
        // A later choice, or a close, may have landed while this one rendered.
        if (wanted === melody) voices = rendered
      })
    },
    setSchedule(schedule: PegSchedule | null) {
      scheduled = schedule && units.length > 0 ? createScheduledConductor(units, schedule) : null
    },
    click(count: number, speed: number) {
      if (!unlocked || muted || count <= 0) return
      const audio = context()
      if (!audio) return
      const fires = Math.min(count, MAX_PER_FRAME)
      const now = audio.currentTime
      if (conductor) {
        const gap = now - lastFrameAt
        lastFrameAt = now
        if (gap > RESTART_AFTER_S) {
          conductor.restart()
          measured = false
        } else {
          pegInterval = measured ? 0.6 * pegInterval + 0.4 * (gap / count) : gap / count
          measured = true
        }
        // The frame's pegs went by over the frame just ended; replaying them at
        // the measured spacing keeps the tune's rhythm even across frames.
        if (scheduled) {
          // Every peg, not just the first few: the schedule counts them all.
          for (let i = 0; i < count; i++) {
            const index = scheduled.peg()
            if (index !== null) note(now + Math.min(i, fires) * pegInterval, index)
          }
          return
        }
        for (let i = 0; i < fires; i++) {
          const index = conductor.peg(pegInterval)
          if (index !== null) note(now + i * pegInterval, index)
        }
        return
      }
      // Spread them across the frame rather than stacking them on one instant,
      // which would read as one loud click instead of several.
      for (let i = 0; i < fires; i++) tick(now + i * 0.012, speed)
    },
    close() {
      ctx?.close()
      ctx = null
      wanted = null
      voices = null
      notes = []
      units = []
      conductor = null
      scheduled = null
      ringing = null
    },
  }
}
