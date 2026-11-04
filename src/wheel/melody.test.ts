import { describe, expect, it } from 'vitest'
import { melodyOfText, melodyUnits, midiToHz, parseNotes, sliceTimes } from './melody'
import { SONGS } from './songs'

describe('parseNotes', () => {
  it('reads pitches, accidentals and beats', () => {
    expect(parseNotes('A4 C#5:0.5 Bb3:2')).toEqual([
      { midi: 69, beats: 1 },
      { midi: 73, beats: 0.5 },
      { midi: 58, beats: 2 },
    ])
  })

  it('reads a rest', () => {
    expect(parseNotes('-:2')).toEqual([{ midi: null, beats: 2 }])
  })

  it('refuses what it cannot read rather than playing silence', () => {
    expect(() => parseNotes('H4')).toThrow(/pitch/)
    expect(() => parseNotes('A4:0')).toThrow(/beats/)
  })
})

describe('midiToHz', () => {
  it('puts A4 at 440', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(81)).toBe(880)
  })
})

describe('melodyOfText', () => {
  it('times each tone at the tempo and takes the shortest as the unit', () => {
    expect(melodyOfText({ id: 's', name: 'S', bpm: 120, notes: 'C4 D4:0.5 -:1.5' })).toEqual({
      tones: [
        { midi: 60, seconds: 0.5 },
        { midi: 62, seconds: 0.25 },
        { midi: null, seconds: 0.75 },
      ],
      unitS: 0.25,
    })
  })
})

describe('sliceTimes', () => {
  it('cuts one slice per note at its onset, folding a rest into the note before it', () => {
    expect(
      sliceTimes([
        { midi: 60, seconds: 1 },
        { midi: null, seconds: 0.5 },
        { midi: 62, seconds: 2 },
      ]),
    ).toEqual([
      { offset: 0, duration: 1.5 },
      { offset: 1.5, duration: 2 },
    ])
  })
})

describe('melodyUnits', () => {
  it('measures each slice in the melody unit, never below one', () => {
    expect(
      melodyUnits({
        tones: [
          { midi: 60, seconds: 0.25 },
          { midi: 62, seconds: 0.5 },
          { midi: 64, seconds: 0.1 },
        ],
        unitS: 0.25,
      }),
    ).toEqual([1, 2, 1])
  })
})

describe('SONGS', () => {
  it.each(
    SONGS.filter((song) => !song.id.startsWith('midi:')).map((song) => [song.name, song] as const),
  )('%s loads', async (_, song) => {
    expect((await song.load()).tones.length).toBeGreaterThan(0)
  })
})
