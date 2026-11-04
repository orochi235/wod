import { Midi } from '@tonejs/midi'
import type { Melody, Tone } from './melody'

/** General MIDI puts percussion on channel 10, which is 9 counted from zero. */
const DRUMS = 9

/** Notes starting this close together are one chord. */
const CHORD_S = 0.02

const MELODIC_NAME = /melody|vocal|voice|lead|sing|tune/i

type Line = {
  name: string
  channel: number
  notes: { midi: number; time: number; duration: number }[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * The track most likely to carry the tune: one named like a melody, else the
 * highest-pitched track with enough notes to be a line rather than a fill.
 */
export function pickMelodyTrack(lines: Line[]): number {
  const usable = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.channel !== DRUMS && line.notes.length > 0)
  if (usable.length === 0) return -1
  const named = usable.find(({ line }) => MELODIC_NAME.test(line.name) && line.notes.length >= 8)
  if (named) return named.index
  const long = usable.filter(({ line }) => line.notes.length >= 16)
  const pool = long.length > 0 ? long : usable
  return pool.reduce((best, next) =>
    median(next.line.notes.map((n) => n.midi)) > median(best.line.notes.map((n) => n.midi))
      ? next
      : best,
  ).index
}

/**
 * One line of tones from a track: a chord keeps its top note, a note that
 * overlaps the next is cut at the next onset, and a gap longer than half a unit
 * becomes a rest.
 */
export function toneLine(notes: Line['notes'], unitS: number): Tone[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time || b.midi - a.midi)
  const onsets: typeof sorted = []
  for (const note of sorted) {
    const last = onsets.at(-1)
    if (last && note.time - last.time < CHORD_S) {
      if (note.midi > last.midi) onsets[onsets.length - 1] = { ...note, time: last.time }
      continue
    }
    onsets.push(note)
  }

  const tones: Tone[] = []
  onsets.forEach((note, i) => {
    const next = onsets[i + 1]
    if (!next) {
      tones.push({ midi: note.midi, seconds: Math.max(note.duration, unitS) })
      return
    }
    const gap = next.time - note.time
    const sounding = Math.min(note.duration, gap)
    if (gap - sounding > unitS / 2) {
      tones.push({ midi: note.midi, seconds: sounding })
      tones.push({ midi: null, seconds: gap - sounding })
    } else {
      tones.push({ midi: note.midi, seconds: gap })
    }
  })
  return tones
}

/**
 * The melody in a standard MIDI file. `track` names the track by index; absent,
 * the likeliest melody track is picked. The unit is a sixteenth note at the
 * file's opening tempo.
 */
export function melodyFromMidi(bytes: ArrayBuffer, track?: number): Melody {
  const midi = new Midi(bytes)
  const lines: Line[] = midi.tracks.map((t) => ({
    name: t.name,
    channel: t.channel,
    notes: t.notes.map((n) => ({ midi: n.midi, time: n.time, duration: n.duration })),
  }))
  const index = track ?? pickMelodyTrack(lines)
  const chosen = lines[index]
  if (!chosen || chosen.notes.length === 0) throw new Error('no melodic track in this MIDI file')
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const unitS = 60 / bpm / 4
  return { tones: toneLine(chosen.notes, unitS), unitS }
}
