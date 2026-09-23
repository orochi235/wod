import { DARK_MS } from '../wheel/outage'

/**
 * The show, cued to the passage it imitates: Eric Carmen, "Make Me Lose
 * Control", from the silence at 4:07.20 to the downbeat of bar 115. Times are
 * milliseconds from the pop, which is that silence. The two falls were measured
 * from the recording; the drums follow the published notation for bars 113–114
 * at 110 bpm, anchored on the first hit's measured onset.
 */

const SIXTEENTH = 60000 / 110 / 4

/** Bar 113, beat 2, second sixteenth: measured at 4:08.17. */
const FIRST_HIT = 970
const BAR_114 = FIRST_HIT - SIXTEENTH + 4 * SIXTEENTH

/** A pitched glide: frequency from `from` to `to` Hz over `ms`. */
export type Swoop = { id: string; at: number; from: number; to: number; ms: number; gain: number }

export type Voice = 'low' | 'mid' | 'high'

/**
 * A drum note, and what it sounds as: a whack, or a clank of metal sized by
 * `hz`. `voice` is the staff line it came from.
 */
export type Hit = { id: string; at: number; voice: Voice; gain: number } & (
  | { sound: 'whack' }
  | { sound: 'clank'; hz: number }
  /** `stroke` counts from 0 through the engine's run; `of` is how many there are. */
  | { sound: 'piston'; stroke: number; of: number }
  | { sound: 'rimshot' }
)

/** The fill's last two notes crack off the rim to end the run. */
const RIMSHOT_FROM_STEP = 14

/** Where in the fill the engine takes over: the notes under R3 and R6. */
const ENGINE_FROM_STEP = 6

/** Metal sizes: the heaviest for bar 113's first note, lighter for the snare line. */
const LOW_CLANK_HZ = 50
const MID_CLANK_HZ = 110

const soundOf = (id: string, voice: Voice): Pick<Hit, 'sound'> & { hz?: number } =>
  id === 'C1'
    ? { sound: 'clank', hz: LOW_CLANK_HZ }
    : voice === 'low'
      ? { sound: 'whack' }
      : { sound: 'clank', hz: MID_CLANK_HZ }

/** The shutdown: two falls, the second smaller and entering halfway through the first. */
const FALLS: Swoop[] = [
  { id: 'F1', at: 100, from: 196, to: 87, ms: 220, gain: 0.7 },
  { id: 'F2', at: 210, from: 129, to: 87, ms: 200, gain: 0.4 },
]

/** Bar 114, by sixteenth and by the line each note sits on. */
const FILL: { step: number; voice: Voice }[] = [
  { step: 0, voice: 'mid' },
  { step: 3, voice: 'high' },
  { step: 6, voice: 'low' },
  { step: 7, voice: 'low' },
  { step: 8, voice: 'mid' },
  { step: 11, voice: 'mid' },
  { step: 12, voice: 'high' },
  { step: 14, voice: 'low' },
  { step: 15, voice: 'low' },
]

/**
 * Where each line's rise starts, and how far one note bends up: an octave under
 * the recording's 110–190 Hz blips, bending up by about a third.
 */
const VOICE_HZ = { low: 55, mid: 70, high: 90 }
const BEND = 1.3

/**
 * Dead air after the fill's first hit, before the spin-up starts: the room sits
 * dark with only the mains humming. Everything after that hit, the chord
 * included, waits it out.
 */
const BEAT = 4 * SIXTEENTH
/** A whole number of beats, so everything after it stays on the song's grid. */
const DEAD_AIR_MS = 14 * BEAT

/** When a fill note sounds. The first hit lands on time; everything after waits. */
const fillAt = (step: number, rise = false) =>
  BAR_114 + step * SIXTEENTH + (rise || step > 0 ? DEAD_AIR_MS : 0)

/**
 * The spin-up: every fill note bends up, and the whole bar climbs a quarter of
 * an octave on top of that, so the last notes reach toward the chord.
 */
const NOTE_RISES: Swoop[] = FILL.map(({ step, voice }, i) => {
  const climb = 2 ** ((step / 15) * 0.25)
  const from = VOICE_HZ[voice] * climb
  return {
    id: `R${i + 1}`,
    at: fillAt(step, true),
    from,
    to: from * BEND,
    ms: 130,
    gain: 0.55 + 0.03 * step,
  }
})

/**
 * Runs of fill notes that share one unbroken rise instead of one each, by index
 * into the fill. A run keeps its first note's id.
 */
const RUNS: { notes: number[]; overlapNext?: boolean }[] = [
  { notes: [0, 1] },
  { notes: [2, 3, 4], overlapNext: true },
  { notes: [5, 6, 7, 8] },
]

/** How far a run marked `overlapNext` carries on under the start of the next. */
const OVERLAP_MS = 150

const RISES: Swoop[] = RUNS.map(({ notes, overlapNext }, i) => {
  const first = NOTE_RISES[notes[0]]
  const last = NOTE_RISES[notes[notes.length - 1]]
  const next = RUNS[i + 1] && NOTE_RISES[RUNS[i + 1].notes[0]]
  const end = overlapNext && next ? next.at + OVERLAP_MS : last.at + last.ms
  return { ...first, to: last.to, ms: end - first.at, gain: last.gain }
})

export const SWOOPS: Swoop[] = [...FALLS, ...RISES]

type Note = { id: string; at: number; voice: Voice; gain: number; step: number }

const NOTES: Note[] = [
  { id: 'C1', at: FIRST_HIT, voice: 'low', gain: 1, step: -2 },
  { id: 'C2', at: FIRST_HIT + SIXTEENTH, voice: 'mid', gain: 1, step: -1 },
  ...FILL.map<Note>(({ step, voice }, i) => ({
    id: `C${i + 3}`,
    at: fillAt(step),
    voice,
    gain: 0.8 + 0.01 * step,
    step,
  })),
]

const engine = NOTES.filter(
  (note) => note.step >= ENGINE_FROM_STEP && note.step < RIMSHOT_FROM_STEP,
)

/**
 * The notes of bars 113 and 114, each with its sound. From the seventh fill
 * note on they are one engine's pistons, and the last two are rimshots. The high line before that is not
 * here: it clanks with the rest of `CLANKS`.
 */
export const HITS: Hit[] = NOTES.filter(
  (note) => note.voice !== 'high' || note.step >= ENGINE_FROM_STEP,
).map((note): Hit => {
  if (note.step >= RIMSHOT_FROM_STEP) return { ...note, sound: 'rimshot' }
  if (note.step >= ENGINE_FROM_STEP) {
    return { ...note, sound: 'piston', stroke: engine.indexOf(note), of: engine.length }
  }
  return { ...note, ...soundOf(note.id, note.voice) } as Hit
})

export const DRONE = { id: 'D', from: 100, to: 1900, hz: 87 }

/**
 * Struck metal: the machinery lurching as the spin-up begins, then the fill's
 * high-line notes.
 */
export const CLANKS: { id: string; at: number; hz: number }[] = [
  FIRST_HIT + DEAD_AIR_MS,
  ...NOTES.filter((note) => note.voice === 'high' && note.step < ENGINE_FROM_STEP).map(
    (note) => note.at,
  ),
].map((at, i) => ({ id: `X${i + 1}`, at, hz: 78 }))

/**
 * A low mains hum that comes up ten beats into the dead air, after two and a half bars of silence,
 * and runs until the chord has taken over.
 */
export const DEAD_HUM = { id: 'H', from: fillAt(0) + 10 * BEAT, to: fillAt(16) + 300, hz: 60 }

/**
 * E major with an added ninth, on the downbeat of bar 115 (after the dead air), with the low voices
 * under it. It holds, then fades over `fadeMs` while the wheel spins back up.
 */
export const CHORD = {
  id: 'K',
  at: fillAt(16),
  // Inverted downward: the top three notes dropped below E4, so it tops out at E5.
  hz: [185, 207.7, 246.9, 329.6, 415.3, 493.9, 659.3],
  low: [41.2, 61.7, 82.4, 123.5, 164.8, 246.9],
  /** The chord again an octave or two down, sung by a section rather than one voice. */
  choir: [103.8, 164.8, 207.7, 246.9],
  holdMs: 1200,
  fadeMs: 4000,
}

/**
 * An alternative to the chord on the same downbeat: a startup chime in the
 * manner of the Macintosh's, a wide F-sharp major chord ringing out. Off unless
 * a caller asks for it.
 */
export const CHIME = {
  id: 'M',
  at: fillAt(16),
  hz: [92.5, 138.6, 185, 233.1, 277.2, 370, 740],
  ringMs: 4200,
}

/**
 * The window flickers on bar 113's two hits and on the fill's snare-line notes,
 * partway, lifting further as the lights come back, so the room seems to strain
 * on rather than strobe. Every hit would be too many flashes a second.
 */
export const FLICKERS: { at: number; lift: number }[] = (() => {
  const onHits = HITS.filter((hit, i) => i < 2 || hit.voice === 'mid').map((hit) => hit.at)
  // The first three wait out the dead air; two more keep their old places, so
  // the room stutters once on the hits and again as the spin-up begins.
  const times = [
    ...onHits.slice(0, 2),
    ...onHits.slice(0, 3).map((at) => at + DEAD_AIR_MS),
    ...onHits.slice(3),
    fillAt(15),
    // The lights catch just before the power hums back.
    DEAD_HUM.from - SIXTEENTH,
  ].sort((a, b) => a - b)
  return times.map((at, i) => ({ at, lift: 0.25 + i * 0.07 }))
})()

/** How dark the room goes the instant it pops, 0..1, before dimming the rest of the way. */
const SAG = 0.25
/** Fully dark as the drone fades out. */
const DIMMED_MS = DRONE.to + 500

/** One flicker's length. */
export const FLICKER_MS = 70
/** Black to lit, on the chord. */
export const LIGHTS_UP_MS = 140

/**
 * The blackout's opacity from the pop to the lights coming up, as Web Animations
 * keyframes over `blackoutMs()`. `depth` is its opacity at its darkest: 1 on the
 * show page, less in the editor.
 */
export function blackoutKeyframes(depth: number): Keyframe[] {
  const total = blackoutMs()
  const frame = (ms: number, opacity: number): Keyframe => ({
    offset: Math.min(1, Math.max(0, ms / total)),
    opacity: opacity * depth,
  })
  // The lights sag at the pop and dim the rest of the way as the drone plays.
  const dimmed = (ms: number) =>
    ms >= DIMMED_MS ? 1 : SAG + (1 - SAG) * (1 - (1 - ms / DIMMED_MS) ** 2)
  const frames: Keyframe[] = []
  for (let ms = 0; ms < DIMMED_MS; ms += 100) frames.push(frame(ms, dimmed(ms)))
  frames.push(frame(DIMMED_MS, 1))
  for (const flicker of FLICKERS) {
    const base = dimmed(flicker.at)
    frames.push(frame(flicker.at, base), frame(flicker.at + 10, base * (1 - flicker.lift)))
    frames.push(frame(flicker.at + FLICKER_MS, dimmed(flicker.at + FLICKER_MS)))
  }
  frames.push(frame(DARK_MS, 1), frame(total, 0))
  return frames.sort((a, b) => (a.offset as number) - (b.offset as number))
}

export function blackoutMs(): number {
  return DARK_MS + LIGHTS_UP_MS
}

/** A spark effect the escalation fires, `at` ms into the spark phase. */
export type Shot = { at: number; kind: 'sputter' | 'burst' | 'arc' | 'shower'; energy: number }

/** The closing stretch magicsmoke's own `blow` escalates through to the pop. */
export const BLOW_MS = 1200

/**
 * Escalating one-shots across a spark phase of `sparkMs`, stopping where the
 * blow takes over. The gaps shrink and the energy climbs, and the heavier kinds
 * arrive in turn: sputters, then bursts, then arcs, then showers. Deterministic,
 * so the same trick sparks the same way every time.
 */
export function escalation(sparkMs: number): Shot[] {
  const span = Math.max(0, sparkMs - BLOW_MS)
  const shots: Shot[] = []
  let at = 0
  while (at < span) {
    const k = span > 0 ? at / span : 1
    const kind: Shot['kind'] = k < 0.3 ? 'sputter' : k < 0.55 ? 'burst' : k < 0.8 ? 'arc' : 'shower'
    shots.push({ at, kind, energy: 0.2 + 0.7 * k })
    if (k > 0.45) shots.push({ at: at + 60, kind: 'sputter', energy: 0.3 + 0.5 * k })
    at += 700 - 560 * k
  }
  return shots
}
