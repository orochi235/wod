/**
 * A tune the flapper can play one note per peg: rendered once into a single
 * buffer, then sliced at its note onsets so each hit plays the next slice.
 */
export type Song = {
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

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** One slice per sounded note, running to the next onset; rests fold into the note before them. */
export function sliceTimes(notes: Note[], bpm: number): Slice[] {
  const beat = 60 / bpm
  const slices: Slice[] = []
  let at = 0
  for (const note of notes) {
    const length = note.beats * beat
    if (note.midi !== null) slices.push({ offset: at, duration: length })
    else if (slices.length > 0) slices[slices.length - 1].duration += length
    at += length
  }
  return slices
}

/** A music-box voice: a fundamental and two decaying partials, so a cut slice still rings like a struck tine. */
export async function renderSong(
  song: Song,
  sampleRate = 44100,
): Promise<{ buffer: AudioBuffer; slices: Slice[] } | null> {
  if (typeof OfflineAudioContext !== 'function') return null
  const notes = parseNotes(song.notes)
  const slices = sliceTimes(notes, song.bpm)
  const beat = 60 / song.bpm
  const total = notes.reduce((sum, note) => sum + note.beats * beat, 0)
  const ctx = new OfflineAudioContext(1, Math.ceil((total + 0.05) * sampleRate), sampleRate)

  let at = 0
  for (const note of notes) {
    const length = note.beats * beat
    if (note.midi !== null) {
      const hz = midiToHz(note.midi)
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
        gain.gain.exponentialRampToValueAtTime(0.0005, at + length)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(at)
        osc.stop(at + length)
      }
    }
    at += length
  }

  return { buffer: await ctx.startRendering(), slices }
}
