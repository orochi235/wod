import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { type WedgePose, wedgeKit } from '../clock/motion'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import {
  type AdvanceInput,
  type Track,
  type Wedges,
  advance,
  drawList,
  retire,
  settle,
} from './tracks'
import type { Transitions } from './types'
import { RESTING } from './voices'

const segment = (id: string, weight = 1): Segment => ({ id, label: id, weight })

const enterOnly: Transitions = { enter: { id: 'fade', params: { staggerMs: 0 } } }
const both: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
}
const shrinking: Transitions = {
  enter: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
  exit: { id: 'shrink', params: { durationMs: 400, staggerMs: 0 } },
}
const staggered: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 100, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 100, durationMs: 400 } },
}

const wedges = (): Wedges => mix<string, WedgePose>(wedgeKit)

/** Syncs the mix to `now`, as usePresence does before every diff, then diffs. */
const run = (w: Wedges, over: Partial<AdvanceInput> = {}): Map<string, Track> => {
  const now = over.now ?? 0
  w.sync(now)
  return advance({
    tracks: new Map(),
    segments: [segment('ana')],
    arcs: new Map(),
    transitions: both,
    now,
    reduced: false,
    wedges: w,
    ...over,
  })
}

const draw = (w: Wedges, tracks: Map<string, Track>, t: number) => {
  w.sync(t)
  return drawList(tracks, w)
}

const presenceAt = (w: Wedges, tracks: Map<string, Track>, id: string, t: number) =>
  draw(w, tracks, t).drawn.find((item) => item.segment.id === id)?.presence

describe('advance', () => {
  it('enters every wedge on first paint', () => {
    expect(run(wedges()).get('ana')?.phase).toBe('entering')
  })

  it('leaves a wedge that was already there alone', () => {
    const w = wedges()
    const first = run(w)
    const second = run(w, { tracks: first, now: 100 })
    expect(second.get('ana')?.voice).toBe(first.get('ana')?.voice)
  })

  it('exits a wedge that leaves the roster', () => {
    const w = wedges()
    const first = run(w)
    expect(run(w, { tracks: first, segments: [], now: 1000 }).get('ana')?.phase).toBe('exiting')
  })

  it('drops an exiting wedge once its transition finishes', () => {
    const w = wedges()
    const exiting = run(w, { tracks: run(w), segments: [], now: 1000 })
    const done = run(w, { tracks: exiting, segments: [], now: 1401 })
    expect(done.has('ana')).toBe(false)
  })

  it('keeps drawing a departed wedge until then', () => {
    const w = wedges()
    const exiting = run(w, { tracks: run(w), segments: [], now: 1000 })
    const midway = run(w, { tracks: exiting, segments: [], now: 1100 })
    expect(midway.get('ana')?.segment.label).toBe('ana')
  })

  it('starts an interrupting transition from where the wedge stands', () => {
    // A quarter into a 400 ms ease-out fade: 1 - 0.75² of the way.
    const w = wedges()
    const entering = run(w)
    expect(presenceAt(w, entering, 'ana', 100)?.opacity).toBeCloseTo(0.4375)
    const exiting = run(w, { tracks: entering, segments: [], now: 100 })
    expect(presenceAt(w, exiting, 'ana', 100)?.opacity).toBeCloseTo(0.4375, 3)
    expect(presenceAt(w, exiting, 'ana', 116)?.opacity).toBeCloseTo(0.4375, 1)
  })

  it('starts from the frame it interrupts even when nothing probed that frame', () => {
    // blits' `from: 'current'` reads the last probe, so advance has to take one.
    const w = wedges()
    const entering = run(w)
    presenceAt(w, entering, 'ana', 20)
    const exiting = run(w, { tracks: entering, segments: [], now: 100 })
    expect(presenceAt(w, exiting, 'ana', 100)?.opacity).toBeCloseTo(0.4375, 3)
  })

  it('reverses a wedge that re-joins while exiting', () => {
    const w = wedges()
    const present = run(w, { tracks: run(w), now: 1000 })
    const exiting = run(w, { tracks: present, segments: [], now: 1000 })
    const leaving = presenceAt(w, exiting, 'ana', 1100)?.opacity
    const back = run(w, { tracks: exiting, now: 1100 })
    expect(back.get('ana')?.phase).toBe('entering')
    expect(back.size).toBe(1)
    // A quarter of the way out of an ease-out fade: 1 - 0.4375.
    expect(leaving).toBeCloseTo(0.5625)
    expect(presenceAt(w, back, 'ana', 1100)?.opacity).toBeCloseTo(0.5625, 3)
  })

  it('promotes a finished entrance to present and lets its voice go', () => {
    const w = wedges()
    const present = run(w, { tracks: run(w), now: 1000 })
    expect(present.get('ana')).toMatchObject({ phase: 'present', voice: null })
  })

  it('leaves a wedge alone when its moment has no transition', () => {
    const w = wedges()
    const tracks = run(w, { transitions: enterOnly })
    expect(run(w, { tracks, segments: [], transitions: enterOnly, now: 10 }).has('ana')).toBe(false)
  })

  it('leaves a wedge alone when its transition id is unknown', () => {
    // Ids come out of localStorage, so one that no longer exists is reachable.
    const unknown = { enter: { id: 'nope' }, exit: { id: 'nope' } } as unknown as Transitions
    const w = wedges()
    const tracks = run(w, { transitions: unknown })
    expect(tracks.get('ana')?.phase).toBe('present')
    expect(run(w, { tracks, segments: [], transitions: unknown, now: 10 }).has('ana')).toBe(false)
  })

  it('rests a wedge at once when its transition has no duration', () => {
    const instant: Transitions = { enter: { id: 'shrink', params: { durationMs: 0 } } }
    const w = wedges()
    const tracks = run(w, { transitions: instant })
    expect(tracks.get('ana')?.phase).toBe('present')
    expect(presenceAt(w, tracks, 'ana', 0)?.share).toBe(1)
  })

  // 0.4.0: hold 'before' shows the first frame through the stagger.
  it('holds a waiting wedge at its declared start until its turn', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')], transitions: staggered })
    expect(presenceAt(w, tracks, 'ben', 50)?.opacity).toBe(0)
  })

  // 0.4.0: hold 'before' on a `from: 'current'` voice.
  it('holds an interrupted wedge where it stands until its turn', () => {
    const w = wedges()
    const entering = run(w, { segments: [segment('ana'), segment('ben')] })
    const exiting = run(w, { tracks: entering, segments: [], transitions: staggered, now: 100 })
    expect(presenceAt(w, exiting, 'ben', 150)?.opacity).toBeCloseTo(0.4375, 3)
  })

  it('ramps share both ways when the transition declares none', () => {
    const w = wedges()
    const entering = run(w)
    expect(presenceAt(w, entering, 'ana', 100)?.share).toBe(1)
    const exiting = run(w, { tracks: entering, segments: [], now: 100 })
    // Still holding a quarter of its arc halfway out. Releasing it at once would
    // expand the survivors under a wedge still painted at full width.
    expect(presenceAt(w, exiting, 'ana', 300)?.share).toBeCloseTo(0.25)
  })

  it('leaves the tracks it was given untouched', () => {
    const w = wedges()
    const first = run(w)
    const before = { ...first.get('ana') }
    run(w, { tracks: first, segments: [{ ...segment('ana'), label: 'Ana L.' }], now: 1000 })
    run(w, { tracks: first, segments: [], now: 100 })
    expect(first.size).toBe(1)
    expect(first.get('ana')).toEqual(before)
  })

  it('tracks a label change without restarting anything', () => {
    const w = wedges()
    const first = run(w)
    const renamed = run(w, {
      tracks: first,
      segments: [{ ...segment('ana'), label: 'Ana L.' }],
      now: 100,
    })
    expect(renamed.get('ana')?.segment.label).toBe('Ana L.')
    expect(renamed.get('ana')?.voice).toBe(first.get('ana')?.voice)
  })

  it('keeps a departing wedge in the slot it held', () => {
    const w = wedges()
    const start = run(w, { segments: [segment('ana'), segment('ben'), segment('cy')] })
    const leaving = run(w, { tracks: start, segments: [segment('ana'), segment('cy')] })
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy'])
  })

  it('keeps a departing wedge ahead of the roster it led', () => {
    const w = wedges()
    const start = run(w, { segments: [segment('ana'), segment('ben'), segment('cy')] })
    const leaving = run(w, { tracks: start, segments: [segment('ben'), segment('cy')] })
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy'])
  })

  it('keeps consecutive departing wedges in order behind their neighbor', () => {
    const w = wedges()
    const four = ['ana', 'ben', 'cy', 'dee'].map((id) => segment(id))
    const start = run(w, { segments: four })
    const leaving = run(w, { tracks: start, segments: [segment('ana'), segment('dee')] })
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy', 'dee'])
  })

  it('refreshes a shrinking wedge to its last non-zero arc', () => {
    const w = wedges()
    const start = run(w, {
      segments: [segment('ana'), segment('ben')],
      transitions: shrinking,
      now: -1000,
    })
    const settled = run(w, {
      tracks: start,
      segments: [segment('ana'), segment('ben')],
      transitions: shrinking,
    })
    const leaving = run(w, {
      tracks: settled,
      segments: [segment('ana')],
      arcs: draw(w, settled, 0).arcs,
      transitions: shrinking,
    })
    const laid = draw(w, leaving, 100)
    const next = run(w, {
      tracks: leaving,
      segments: [segment('ana')],
      arcs: laid.arcs,
      transitions: shrinking,
      now: 100,
    })
    expect(next.get('ben')?.ghostArc).toEqual(laid.arcs.get('ben'))
  })
})

describe('retire', () => {
  it('has nothing to do while every voice still plays', () => {
    const w = wedges()
    const tracks = run(w)
    w.sync(100)
    expect(retire(tracks, w)).toBeNull()
  })

  // 0.4.0: a voice holding after reads 'held' once played.
  it('promotes a played entrance and forgets a played exit', () => {
    const w = wedges()
    const start = run(w, { segments: [segment('ana'), segment('ben')], now: -1000 })
    const present = run(w, { tracks: start, segments: [segment('ana'), segment('ben')] })
    const leaving = run(w, { tracks: present, segments: [segment('ana')], now: 0 })
    w.sync(400)
    w.probe('ben')
    const next = retire(leaving, w)
    expect(next && [...next.keys()]).toEqual(['ana'])
  })
})

describe('drawList', () => {
  /** ana at rest; ben leaving by shrink from 0. */
  const leavingBen = (w: Wedges, anaWeight = 1) => {
    const roster = [segment('ana', anaWeight), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking, now: -1000 })
    const settled = run(w, { tracks: start, segments: roster, transitions: shrinking })
    return run(w, {
      tracks: settled,
      segments: [segment('ana', anaWeight)],
      arcs: draw(w, settled, 0).arcs,
      transitions: shrinking,
    })
  }

  it('lays out live wedges in track order', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')], transitions: {} })
    const { drawn } = draw(w, tracks, 0)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
    expect(drawn[0].arc.start).toBe(0)
  })

  it('lays out a wedge by its weight as well as its share', () => {
    // Halfway through an ease-in-out shrink: ben holds half of its 1 against ana's 3.
    const w = wedges()
    const ben = draw(w, leavingBen(w, 3), 200).drawn.find((item) => item.segment.id === 'ben')
    expect(ben && ben.arc.end - ben.arc.start).toBeCloseTo(0.5 / 3.5)
  })

  // 0.4.0: the exit holds its last frame, share 0, until retired.
  it('draws a wedge at zero share on its frozen arc, out of the layout', () => {
    const w = wedges()
    const tracks = leavingBen(w)
    const frozen = tracks.get('ben')?.ghostArc
    const { drawn, arcs } = draw(w, tracks, 400)
    const ben = drawn.find((item) => item.segment.id === 'ben')
    const ana = drawn.find((item) => item.segment.id === 'ana')
    expect(ben?.arc).toEqual(frozen)
    expect(ben?.presence.share).toBe(0)
    expect(arcs.has('ben')).toBe(false)
    expect(ana && ana.arc.end - ana.arc.start).toBeCloseTo(1)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
  })

  it('drops a ghost that never had an arc', () => {
    const w = wedges()
    const start = run(w, { now: -1000 })
    const present = run(w, { tracks: start })
    const leaving = run(w, { tracks: present, segments: [], transitions: shrinking })
    expect(draw(w, leaving, 400).drawn).toHaveLength(0)
  })

  it('reports the arcs it laid out, for the next departure to freeze', () => {
    const w = wedges()
    const tracks = run(w, { transitions: {} })
    expect(draw(w, tracks, 0).arcs.get('ana')).toEqual({ id: 'ana', start: 0, end: 1 })
  })

  it('hands back the shared resting presence for a settled wedge', () => {
    const w = wedges()
    const tracks = run(w, { transitions: {} })
    expect(draw(w, tracks, 0).drawn[0].presence).toBe(RESTING)
  })
})

describe('advance through drawList', () => {
  it('draws a departed wedge at the arc it last held', () => {
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const present = run(w, { tracks: run(w, { segments: roster, now: -1000 }), segments: roster })
    const before = draw(w, present, 0)
    const leaving = run(w, { tracks: present, segments: [segment('ana')], arcs: before.arcs })
    const ben = draw(w, leaving, 0).drawn.find((item) => item.segment.id === 'ben')
    expect(ben?.arc).toEqual(before.arcs.get('ben'))
  })

  it('moves no survivor on the frame a neighbor starts leaving', () => {
    const w = wedges()
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const start = run(w, { segments: roster, transitions: shrinking, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: shrinking })
    const before = draw(w, present, 0)
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana'), segment('cy')],
      arcs: before.arcs,
      transitions: shrinking,
    })
    const after = draw(w, leaving, 0)
    const at = (list: typeof after.drawn, id: string) => list.find((item) => item.segment.id === id)
    expect(at(after.drawn, 'cy')?.arc).toEqual(at(before.drawn, 'cy')?.arc)
    expect(at(after.drawn, 'ben')?.arc).toEqual(at(before.drawn, 'ben')?.arc)
  })

  it('gives a shrinking wedge less arc and its neighbor more', () => {
    // The spec's "shrink reflows": at 50%, ana widens by what ben let go.
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: shrinking })
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana')],
      arcs: draw(w, present, 0).arcs,
      transitions: shrinking,
    })
    const midway = draw(w, leaving, 200)
    const ana = midway.drawn.find((item) => item.segment.id === 'ana')
    const ben = midway.drawn.find((item) => item.segment.id === 'ben')
    expect(ben?.presence.share).toBeCloseTo(0.5)
    expect(ana && ana.arc.end - ana.arc.start).toBeCloseTo(2 / 3)
  })

  // 0.4.0: the end reading is the exit's held last frame.
  it('still closes a shrinking wedge under reduced motion, over its shorter duration', () => {
    // Reduced motion substitutes fade, which declares no share of its own.
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking, reduced: true, now: -1000 })
    const present = run(w, {
      tracks: start,
      segments: roster,
      transitions: shrinking,
      reduced: true,
    })
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana')],
      arcs: draw(w, present, 0).arcs,
      transitions: shrinking,
      reduced: true,
    })
    expect(presenceAt(w, leaving, 'ben', 0)?.share).toBe(1)
    expect(presenceAt(w, leaving, 'ben', REDUCED_MOTION_MS)?.share).toBe(0)
  })

  // 0.4.0: the reversal's end reading is its held last frame.
  it('turns a half-closed wedge around and opens it fully', () => {
    const closing: Transitions = { enter: both.enter, exit: shrinking.exit }
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: closing, now: -1000 })
    const present = run(w, { tracks: start, segments: roster, transitions: closing })
    const leaving = run(w, {
      tracks: present,
      segments: [segment('ana')],
      arcs: draw(w, present, 0).arcs,
      transitions: closing,
    })
    expect(presenceAt(w, leaving, 'ben', 200)?.share).toBeCloseTo(0.5)
    const back = run(w, {
      tracks: leaving,
      segments: roster,
      arcs: draw(w, leaving, 200).arcs,
      transitions: closing,
      now: 200,
    })
    expect(presenceAt(w, back, 'ben', 200)?.share).toBeCloseTo(0.5, 3)
    expect(presenceAt(w, back, 'ben', 600)).toMatchObject({ share: 1, opacity: 1, scale: 1 })
  })
})

describe('settle', () => {
  it('drops everything off the roster and rests what is on it', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')] })
    const settled = settle(tracks, [segment('ana')], w)
    expect([...settled.keys()]).toEqual(['ana'])
    expect(settled.get('ana')).toMatchObject({ phase: 'present', voice: null })
    expect(presenceAt(w, settled, 'ana', 1)).toBe(RESTING)
  })

  // 0.4.0: inert.
  it('takes every presence voice out of the mix', () => {
    const w = wedges()
    const tracks = run(w, { segments: [segment('ana'), segment('ben')] })
    settle(tracks, [segment('ana')], w)
    w.sync(1)
    w.probe('ana')
    expect(w.inert).toBe(true)
  })

  it('settles a mid-flight roster to exactly the composed one', () => {
    const w = wedges()
    const roster = [segment('ana'), segment('ben')]
    const start = run(w, { segments: roster, transitions: shrinking })
    const leaving = run(w, {
      tracks: start,
      segments: [segment('ana')],
      arcs: draw(w, start, 100).arcs,
      transitions: shrinking,
      now: 100,
    })
    expect(draw(w, leaving, 200).drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])

    const { drawn } = draw(w, settle(leaving, [segment('ana')], w), 200)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana'])
    expect(drawn[0].presence).toEqual(RESTING)
    expect(drawn[0].arc.end - drawn[0].arc.start).toBeCloseTo(1)
  })
})
