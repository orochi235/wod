/**
 * A tune the flapper can play on the pegs: one line of tones, rendered once into
 * a single buffer and sliced at each tone's onset so a peg can play any one note.
 */

/** A note or a rest, in the order played. A null pitch is a rest. */
export type Tone = { midi: number | null; seconds: number }

export type Melody = {
  tones: Tone[]
  /** The rhythmic unit: every slice is a whole number of these, and a peg is worth at most one. */
  unitS: number
  /**
   * Where each bar starts, in seconds from the first tone; earlier bars are
   * negative. Absent when the source says nothing about bars.
   */
  bars?: number[]
}

/** Anything the picker can offer. Loading is deferred: a MIDI file is fetched and parsed only once chosen. */
export type Song = { id: string; name: string; load: () => Promise<Melody> }

/** A tune typed in by hand. */
export type TextSong = {
  id: string
  name: string
  bpm: number
  /** Space-separated `PITCH[:BEATS]`, e.g. `E5 D#5:0.5 A4:2`; `-` is a rest. Beats default to 1. */
  notes: string
}

export type Note = { midi: number | null; beats: number }

export type Slice = { offset: number; duration: number }

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function parseNotes(notes: string): Note[] {
  return notes
    .split(/[\s|]+/)
    .filter((token) => token !== '')
    .map((token) => {
      const [pitch, beatsText] = token.split(':')
      const beats = beatsText === undefined ? 1 : Number(beatsText)
      if (!(beats > 0)) throw new Error(`bad beats in "${token}"`)
      if (pitch === '-') return { midi: null, beats }
      const match = /^([A-G])([#b]?)(-?\d)$/.exec(pitch)
      if (!match) throw new Error(`bad pitch in "${token}"`)
      const [, letter, accidental, octave] = match
      const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
      return { midi: 12 * (Number(octave) + 1) + STEPS[letter] + shift, beats }
    })
}

export function melodyOfText(song: TextSong): Melody {
  const beat = 60 / song.bpm
  const tones = parseNotes(song.notes).map((note) => ({
    midi: note.midi,
    seconds: note.beats * beat,
  }))
  return { tones, unitS: Math.min(...tones.map((tone) => tone.seconds)) }
}

/**
 * Bars `from` to `to` (counted from 1, both included) as a melody of their own.
 * A note held over from before `from` is not replayed: its remainder is a rest,
 * and leading rests drop, so the excerpt starts on its first note.
 */
export function excerpt(melody: Melody, from: number, to: number): Melody {
  const bars = melody.bars
  if (!bars || bars.length === 0) return melody
  const total = melody.tones.reduce((sum, tone) => sum + tone.seconds, 0)
  const start = bars[Math.max(0, from - 1)] ?? total
  const end = bars[Math.max(from, to)] ?? total
  const tones: Tone[] = []
  let at = 0
  for (const tone of melody.tones) {
    const toneEnd = at + tone.seconds
    const kept = Math.min(toneEnd, end) - Math.max(at, start)
    if (kept > 1e-9) {
      const sounded = tone.midi !== null && at >= start - 1e-9
      tones.push({ midi: sounded ? tone.midi : null, seconds: kept })
    }
    at = toneEnd
  }
  const first = tones.findIndex((tone) => tone.midi !== null)
  if (first === -1) return { ...melody, tones: [], bars: [] }
  const lead = tones.slice(0, first).reduce((sum, tone) => sum + tone.seconds, 0)
  return {
    tones: tones.slice(first),
    unitS: melody.unitS,
    bars: bars.slice(from - 1, to).map((bar) => bar - start - lead),
  }
}

export function textSong(song: TextSong): Song {
  return { id: song.id, name: song.name, load: async () => melodyOfText(song) }
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** One slice per sounded tone, running to the next onset; a rest folds into the note before it. */
export function sliceTimes(tones: Tone[]): Slice[] {
  const slices: Slice[] = []
  let at = 0
  for (const tone of tones) {
    if (tone.midi !== null) slices.push({ offset: at, duration: tone.seconds })
    else if (slices.length > 0) slices[slices.length - 1].duration += tone.seconds
    at += tone.seconds
  }
  return slices
}

/** Each slice's length in the melody's unit. Every caller reads units through here, so a schedule and the player agree. */
export function melodyUnits(melody: Melody): number[] {
  return sliceTimes(melody.tones).map((slice) =>
    Math.max(1, Math.round(slice.duration / melody.unitS)),
  )
}

/** Each sounded tone's pitch, in the order `sliceTimes` cuts them. */
export function pitchesOf(melody: Melody): number[] {
  return melody.tones.flatMap((tone) => (tone.midi === null ? [] : [tone.midi]))
}

/** How long each pitch's strike lasts in the bank. A longer note lets it ring out. */
export const VOICE_S = 1.2

export type Voices = { buffer: AudioBuffer; offsetOf: Map<number, number> }

/**
 * A music-box strike for each pitch the melody uses, side by side in one buffer:
 * a fundamental and two decaying partials. The bank grows with the melody's
 * range, not its length, so a whole song renders as fast as a phrase.
 */
export async function renderVoices(melody: Melody, sampleRate = 44100): Promise<Voices | null> {
  if (typeof OfflineAudioContext !== 'function') return null
  const pitches = [...new Set(pitchesOf(melody))]
  if (pitches.length === 0) return null
  const ctx = new OfflineAudioContext(
    1,
    Math.ceil(pitches.length * VOICE_S * sampleRate),
    sampleRate,
  )
  const offsetOf = new Map<number, number>()
  pitches.forEach((midi, slot) => {
    const at = slot * VOICE_S
    offsetOf.set(midi, at)
    const hz = midiToHz(midi)
    for (const [ratio, level] of [
      [1, 0.32],
      [2, 0.1],
      [3, 0.04],
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = hz * ratio
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(level, at + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0005, at + VOICE_S - 0.01)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + VOICE_S)
    }
  })
  return { buffer: await ctx.startRendering(), offsetOf }
}
