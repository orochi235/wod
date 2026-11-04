import type { Song } from './melody'

const PUBLIC: Song[] = [
  {
    id: 'mountain-king',
    name: 'In the Hall of the Mountain King',
    bpm: 260,
    notes:
      'B3 C#4 D4 E4 F#4 D4 F#4:2 F4 C#4 F4:2 E4 C4 E4:2 ' +
      'B3 C#4 D4 E4 F#4 D4 F#4 B4 A4 F#4 D4 F#4 A4:4',
  },
  {
    id: 'ode-to-joy',
    name: 'Ode to Joy',
    bpm: 200,
    notes:
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 ' +
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2',
  },
  {
    id: 'fur-elise',
    name: 'Für Elise',
    bpm: 300,
    notes:
      'E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 E4 G#4 B4 C5:2 ' +
      'E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 C4 E4 A4 B4:2 E4 C5 B4 A4:3',
  },
  {
    id: 'entertainer',
    name: 'The Entertainer',
    bpm: 280,
    notes: 'D4 D#4 E4 C5:2 E4 C5:2 E4 C5:3 C5 D5 D#5 E5 C5 D5 E5:2 B4 D5:2 C5:3',
  },
]

// Songs that are fine to play privately but not to publish live in a
// gitignored `songs.local.ts` exporting `songs: Song[]`.
const local = Object.values(
  import.meta.glob<{ songs: Song[] }>('./songs.local.ts', { eager: true }),
).flatMap((module) => module.songs)

export const SONGS: Song[] = [...local, ...PUBLIC]

export function getSong(id: string): Song | undefined {
  return SONGS.find((song) => song.id === id)
}
