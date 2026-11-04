import { renderSong, type Slice, type Song } from './melody'

/** A frame that passed more pegs than this was a stall, not a spin. */
const MAX_PER_FRAME = 8

/** Quiet this long and the next hit starts the tune over, so each spin begins at its first note. */
const RESTART_AFTER_S = 1.5

export type Clicker = {
  /** Browsers refuse audio until a gesture; call this from one. */
  unlock(): void
  setMuted(muted: boolean): void
  /** Play a tune one note per peg instead of the tick; null goes back to the tick. */
  setSong(song: Song | null): void
  /** `count` pegs went by, at `speed` degrees per millisecond. */
  click(count: number, speed: number): void
  close(): void
}

export function createClicker(): Clicker {
  let ctx: AudioContext | null = null
  let unlocked = false
  let muted = false
  let tune: { buffer: AudioBuffer; slices: Slice[] } | null = null
  let wanted: Song | null = null
  let cursor = 0
  let lastHitAt = -Infinity
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

  const note = (at: number) => {
    const audio = context()
    if (!audio || !tune) return
    if (at - lastHitAt > RESTART_AFTER_S) cursor = 0
    lastHitAt = at
    // The next peg cuts the note before it, so a fast wheel rattles through the
    // tune and a slow one lets each note ring out.
    if (ringing) {
      ringing.gain.gain.cancelScheduledValues(at)
      ringing.gain.gain.setTargetAtTime(0, at, 0.004)
      ringing.source.stop(at + 0.04)
    }
    const slice = tune.slices[cursor]
    cursor = (cursor + 1) % tune.slices.length
    const source = audio.createBufferSource()
    const gain = audio.createGain()
    source.buffer = tune.buffer
    source.connect(gain)
    gain.connect(audio.destination)
    source.start(at, slice.offset, slice.duration)
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
    setSong(song: Song | null) {
      wanted = song
      tune = null
      cursor = 0
      if (!song) return
      void renderSong(song).then((rendered) => {
        // A later choice, or a close, may have landed while this one rendered.
        if (wanted === song && rendered && rendered.slices.length > 0) tune = rendered
      })
    },
    click(count: number, speed: number) {
      if (!unlocked || muted || count <= 0) return
      const audio = context()
      if (!audio) return
      const fires = Math.min(count, MAX_PER_FRAME)
      // Spread them across the frame rather than stacking them on one instant,
      // which would read as one loud click instead of several.
      for (let i = 0; i < fires; i++) {
        const at = audio.currentTime + i * 0.012
        if (tune) note(at)
        else tick(at, speed)
      }
    },
    close() {
      ctx?.close()
      ctx = null
      wanted = null
      tune = null
      ringing = null
    },
  }
}
