import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { melodyFromMidi, pickMelodyTrack, toneLine } from './midi'

type Spec = { name?: string; channel?: number; notes: [number, number, number][] }

/** A file built here, from scales: every track a list of [pitch, start s, length s]. */
function file(tracks: Spec[], bpm = 120): ArrayBuffer {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  for (const spec of tracks) {
    const track = midi.addTrack()
    track.name = spec.name ?? ''
    track.channel = spec.channel ?? 0
    for (const [pitch, time, duration] of spec.notes) track.addNote({ midi: pitch, time, duration })
  }
  return midi.toArray().buffer as ArrayBuffer
}

const scale = (from: number, count: number): [number, number, number][] =>
  Array.from({ length: count }, (_, i) => [from + i, i * 0.25, 0.25])

describe('pickMelodyTrack', () => {
  const line = (name: string, channel: number, pitches: number[]) => ({
    name,
    channel,
    notes: pitches.map((midi, i) => ({ midi, time: i, duration: 1 })),
  })

  it('takes a track named like a melody', () => {
    expect(
      pickMelodyTrack([
        line('Bass', 0, Array(20).fill(40)),
        line('Lead vocal', 1, Array(10).fill(50)),
      ]),
    ).toBe(1)
  })

  it('otherwise takes the highest line, ignoring drums and short fills', () => {
    expect(
      pickMelodyTrack([
        line('a', 0, Array(20).fill(50)),
        line('b', 9, Array(20).fill(90)),
        line('c', 1, Array(4).fill(85)),
        line('d', 2, Array(20).fill(70)),
      ]),
    ).toBe(3)
  })
})

describe('toneLine', () => {
  it('keeps a chord top note, cuts overlaps at the next onset and rests across gaps', () => {
    expect(
      toneLine(
        [
          { midi: 60, time: 0, duration: 1 },
          { midi: 67, time: 0.005, duration: 1 },
          { midi: 62, time: 0.5, duration: 0.25 },
          { midi: 64, time: 1.5, duration: 0.5 },
        ],
        0.125,
      ),
    ).toEqual([
      { midi: 67, seconds: 0.5 },
      { midi: 62, seconds: 0.25 },
      { midi: null, seconds: 0.75 },
      { midi: 64, seconds: 0.5 },
    ])
  })
})

describe('melodyFromMidi', () => {
  it('reads the likeliest melody at a sixteenth-note unit', () => {
    const melody = melodyFromMidi(
      file(
        [
          { name: 'Bass', notes: scale(36, 20) },
          { name: 'Melody', notes: scale(60, 8) },
        ],
        120,
      ),
    )
    expect(melody.unitS).toBeCloseTo(0.125)
    expect(melody.tones.map((tone) => tone.midi)).toEqual([60, 61, 62, 63, 64, 65, 66, 67])
  })

  it('reads the track it is told to', () => {
    const melody = melodyFromMidi(
      file([{ name: 'Melody', notes: scale(60, 8) }, { notes: scale(48, 4) }]),
      1,
    )
    expect(melody.tones.map((tone) => tone.midi)).toEqual([48, 49, 50, 51])
  })

  it('says so when there is nothing to play', () => {
    expect(() => melodyFromMidi(file([{ channel: 9, notes: scale(36, 4) }]))).toThrow(/no melodic/)
  })
})

describe('barStarts', () => {
  it('lays bars out by tempo and time signature, from the first note', () => {
    const melody = melodyFromMidi(
      file(
        [
          {
            name: 'Melody',
            notes: [
              [60, 1, 0.5],
              [62, 3, 0.5],
            ],
          },
        ],
        120,
      ),
    )
    // 4/4 at 120 bpm: a bar every 2 s, counted from the first note at 1 s, and
    // none starting after the file's last note ends at 3.5 s.
    expect(melody.bars).toEqual([-1, 1])
  })
})
