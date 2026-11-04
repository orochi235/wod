import { describe, expect, it } from 'vitest'
import { midiToHz, parseNotes, sliceTimes } from './melody'
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

describe('sliceTimes', () => {
  it('cuts one slice per note at its onset', () => {
    expect(sliceTimes(parseNotes('C4 D4:2 E4'), 60)).toEqual([
      { offset: 0, duration: 1 },
      { offset: 1, duration: 2 },
      { offset: 3, duration: 1 },
    ])
  })

  it('lets a rest ring on in the note before it', () => {
    expect(sliceTimes(parseNotes('C4 -:2 D4'), 120)).toEqual([
      { offset: 0, duration: 1.5 },
      { offset: 1.5, duration: 0.5 },
    ])
  })
})

describe('SONGS', () => {
  it.each(SONGS.map((song) => [song.name, song] as const))('%s parses', (_, song) => {
    expect(parseNotes(song.notes).length).toBeGreaterThan(0)
  })
})
