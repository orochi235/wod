import { type Song, type TextSong, textSong } from './melody'
import { melodyFromMidi } from './midi'

const PUBLIC: TextSong[] = [
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

// Songs that are fine to play privately but not to publish live in gitignored
// files: `songs.local.ts` exporting `songs: TextSong[]`, and MIDI files in
// `songs.local/`. A file named `tune@2.mid` reads track 2 instead of guessing.
const localText = Object.values(
  import.meta.glob<{ songs: TextSong[] }>('./songs.local.ts', { eager: true }),
).flatMap((module) => module.songs)

const localMidi = Object.entries(
  import.meta.glob<string>('./songs.local/*.{mid,midi}', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
).map(([path, url]): Song => {
  const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.midi?$/i, '')
  const [name, track] = file.split('@')
  return {
    id: `midi:${file}`,
    name,
    load: async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${file}: ${response.status}`)
      return melodyFromMidi(await response.arrayBuffer(), track ? Number(track) : undefined)
    },
  }
})

export const SONGS: Song[] = [...localMidi, ...localText.map(textSong), ...PUBLIC.map(textSong)]

export function getSong(id: string): Song | undefined {
  return SONGS.find((song) => song.id === id)
}
