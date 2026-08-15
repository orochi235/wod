/** A frame that passed more pegs than this was a stall, not a spin. */
const MAX_PER_FRAME = 8

export type Clicker = {
  /** Browsers refuse audio until a gesture; call this from one. */
  unlock(): void
  setMuted(muted: boolean): void
  /** `count` pegs went by, at `speed` degrees per millisecond. */
  click(count: number, speed: number): void
  close(): void
}

export function createClicker(): Clicker {
  let ctx: AudioContext | null = null
  let unlocked = false
  let muted = false

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

  return {
    unlock() {
      unlocked = true
      context()?.resume()
    },
    setMuted(next: boolean) {
      muted = next
    },
    click(count: number, speed: number) {
      if (!unlocked || muted || count <= 0) return
      const audio = context()
      if (!audio) return
      const fires = Math.min(count, MAX_PER_FRAME)
      // Spread them across the frame rather than stacking them on one instant,
      // which would read as one loud click instead of several.
      for (let i = 0; i < fires; i++) tick(audio.currentTime + i * 0.012, speed)
    },
    close() {
      ctx?.close()
      ctx = null
    },
  }
}
