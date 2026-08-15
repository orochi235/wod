import { describe, expect, it } from 'vitest'
import type { Segment } from '../wheel/types'
import { RESTING } from './sample'
import { advance, drawList, sampleTrack, settle } from './tracks'
import type { Track } from './tracks'
import type { Transitions } from './types'

const segment = (id: string, weight = 1): Segment => ({ id, label: id, weight })

const enterOnly: Transitions = { enter: { id: 'fade', params: { staggerMs: 0 } } }
const both: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
}

const staggered: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 100, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 100, durationMs: 400 } },
}

const input = (over: Partial<Parameters<typeof advance>[0]> = {}) => ({
  tracks: new Map(),
  segments: [segment('ana')],
  arcs: new Map(),
  transitions: both,
  now: 0,
  reduced: false,
  ...over,
})

describe('advance', () => {
  it('enters every wedge on first paint', () => {
    const tracks = advance(input())
    expect(tracks.get('ana')?.phase).toBe('entering')
  })

  it('leaves a wedge that was already there alone', () => {
    const first = advance(input())
    const second = advance(input({ tracks: first, now: 1000 }))
    expect(second.get('ana')?.startedAt).toBe(first.get('ana')?.startedAt)
  })

  it('exits a wedge that leaves the roster', () => {
    const first = advance(input({ now: 0 }))
    const second = advance(input({ tracks: first, segments: [], now: 1000 }))
    expect(second.get('ana')?.phase).toBe('exiting')
  })

  it('drops an exiting wedge once its transition finishes', () => {
    const first = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: first, segments: [], now: 1000 }))
    const done = advance(input({ tracks: exiting, segments: [], now: 1000 + 400 + 1 }))
    expect(done.has('ana')).toBe(false)
  })

  it('keeps drawing a departed wedge until then', () => {
    const first = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: first, segments: [], now: 1000 }))
    const midway = advance(input({ tracks: exiting, segments: [], now: 1100 }))
    expect(midway.get('ana')?.segment.label).toBe('ana')
  })

  it('starts an interrupting transition from the current sample', () => {
    // Enter is 400ms of fade; interrupt it a quarter of the way in, which
    // ease-out has already carried to 1 - 0.75² of the way through.
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 100 }))
    expect(exiting.get('ana')?.base.opacity).toBeCloseTo(0.4375)
  })

  it('drops a declared zero frame when interrupting', () => {
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 100 }))
    expect(exiting.get('ana')?.frames.every((frame) => frame.at > 0)).toBe(true)
  })

  it('keeps a declared zero frame when nothing was in flight', () => {
    const entering = advance(input({ now: 0 }))
    const present = advance(input({ tracks: entering, now: 1000 }))
    const exiting = advance(input({ tracks: present, segments: [], now: 1000 }))
    expect(exiting.get('ana')?.frames.some((frame) => frame.at === 0)).toBe(true)
  })

  it('reverses a wedge that re-joins while exiting', () => {
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 1000 }))
    const leaving = exiting.get('ana')
    const back = advance(input({ tracks: exiting, now: 1100 }))
    const arriving = back.get('ana')
    expect(arriving?.phase).toBe('entering')
    expect(back.size).toBe(1)
    // A quarter of the way out, so it turns around from where it stands rather
    // than restarting its arrival at the 0 its entrance declares.
    expect(leaving && sampleTrack(leaving, 1100).opacity).toBeCloseTo(0.5625)
    expect(arriving && sampleTrack(arriving, 1100).opacity).toBeCloseTo(0.5625)
  })

  it('promotes a finished entrance to present', () => {
    const entering = advance(input({ now: 0 }))
    const present = advance(input({ tracks: entering, now: 1000 }))
    expect(present.get('ana')?.phase).toBe('present')
  })

  it('leaves a wedge alone when its moment has no transition', () => {
    const tracks = advance(input({ transitions: enterOnly, now: 0 }))
    const gone = advance(input({ tracks, segments: [], transitions: enterOnly, now: 10 }))
    expect(gone.has('ana')).toBe(false)
  })

  it('leaves a wedge alone when its transition id is unknown', () => {
    // Ids come out of localStorage, so one that no longer exists is reachable.
    const unknown = { enter: { id: 'nope' }, exit: { id: 'nope' } } as unknown as Transitions
    const tracks = advance(input({ transitions: unknown, now: 0 }))
    expect(tracks.get('ana')?.phase).toBe('present')
    const gone = advance(input({ tracks, segments: [], transitions: unknown, now: 10 }))
    expect(gone.has('ana')).toBe(false)
  })

  it('holds a waiting wedge at its declared start until its turn', () => {
    const tracks = advance(
      input({ segments: [segment('ana'), segment('ben')], transitions: staggered, now: 0 }),
    )
    const ben = tracks.get('ben')
    expect(ben?.delayMs).toBe(100)
    expect(ben && sampleTrack(ben, 50).opacity).toBe(0)
  })

  it('holds an interrupted wedge where it stands until its turn', () => {
    const entering = advance(input({ segments: [segment('ana'), segment('ben')], now: 0 }))
    const exiting = advance(
      input({ tracks: entering, segments: [], transitions: staggered, now: 100 }),
    )
    const ben = exiting.get('ben')
    expect(ben?.delayMs).toBe(100)
    expect(ben && sampleTrack(ben, 150).opacity).toBeCloseTo(0.4375)
  })

  it('defaults hold by phase when the transition declares none', () => {
    const entering = advance(input({ now: 0 }))
    const arriving = entering.get('ana')
    expect(arriving && sampleTrack(arriving, 100).hold).toBe(1)

    const exiting = advance(input({ tracks: entering, segments: [], now: 100 }))
    const leaving = exiting.get('ana')
    expect(leaving && sampleTrack(leaving, 150).hold).toBe(0)
  })

  it('leaves the tracks it was given untouched', () => {
    const first = advance(input({ now: 0 }))
    const before = { ...first.get('ana') }
    // Both branches: one advance keeps the wedge and promotes it, one departs it.
    advance(input({ tracks: first, segments: [{ ...segment('ana'), label: 'Ana L.' }], now: 1000 }))
    advance(input({ tracks: first, segments: [], now: 100 }))
    expect(first.size).toBe(1)
    expect(first.get('ana')).toEqual(before)
  })

  it('tracks a label change without restarting anything', () => {
    const first = advance(input({ now: 0 }))
    const renamed = advance(
      input({ tracks: first, segments: [{ ...segment('ana'), label: 'Ana L.' }], now: 100 }),
    )
    expect(renamed.get('ana')?.segment.label).toBe('Ana L.')
    expect(renamed.get('ana')?.startedAt).toBe(0)
  })

  it('keeps a departing wedge in the slot it held', () => {
    const start = advance(
      input({ segments: [segment('ana'), segment('ben'), segment('cy')], now: 0 }),
    )
    const leaving = advance(
      input({ tracks: start, segments: [segment('ana'), segment('cy')], now: 0 }),
    )
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy'])
  })

  it('keeps a departing wedge ahead of the roster it led', () => {
    const start = advance(
      input({ segments: [segment('ana'), segment('ben'), segment('cy')], now: 0 }),
    )
    const leaving = advance(
      input({ tracks: start, segments: [segment('ben'), segment('cy')], now: 0 }),
    )
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy'])
  })

  it('keeps two departing wedges in their own separate slots', () => {
    const start = advance(
      input({
        segments: [segment('ana'), segment('ben'), segment('cy'), segment('dee')],
        now: 0,
      }),
    )
    const leaving = advance(
      input({ tracks: start, segments: [segment('ana'), segment('cy')], now: 0 }),
    )
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy', 'dee'])
  })

  it('keeps consecutive departing wedges in order behind their neighbor', () => {
    const start = advance(
      input({
        segments: [segment('ana'), segment('ben'), segment('cy'), segment('dee')],
        now: 0,
      }),
    )
    const leaving = advance(
      input({ tracks: start, segments: [segment('ana'), segment('dee')], now: 0 }),
    )
    expect([...leaving.keys()]).toEqual(['ana', 'ben', 'cy', 'dee'])
  })

  it('follows the composed order when the roster itself reorders', () => {
    const start = advance(
      input({ segments: [segment('ana'), segment('ben'), segment('cy')], now: 0 }),
    )
    const leaving = advance(
      input({ tracks: start, segments: [segment('cy'), segment('ana')], now: 0 }),
    )
    // ben still follows ana, the neighbor it stood behind, to ana's new slot.
    expect([...leaving.keys()]).toEqual(['cy', 'ana', 'ben'])
  })

  it('refreshes a shrinking wedge to its last non-zero arc', () => {
    const shrinking: Track = {
      ...restingFor('ben'),
      phase: 'exiting',
      frames: [
        { at: 0, hold: 1 },
        { at: 0.5, hold: 0 },
      ],
      declaresHold: true,
      durationMs: 400,
      ghostArc: { id: 'ben', start: 0, end: 1 },
    }
    const tracks = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', shrinking],
    ])
    // A quarter in, ben still holds half its weight and so still has a real arc.
    const laid = drawList(tracks, 100)
    const next = advance(input({ tracks, segments: [segment('ana')], arcs: laid.arcs, now: 100 }))
    expect(next.get('ben')?.ghostArc).toEqual(laid.arcs.get('ben'))
  })
})

const restingFor = (id: string): Track => ({
  id,
  phase: 'present',
  segment: segment(id),
  frames: [],
  base: RESTING,
  startedAt: 0,
  delayMs: 0,
  durationMs: 0,
  declaresHold: false,
  ghostArc: null,
})

describe('drawList', () => {
  const holding = (id: string, hold: number): Track => ({
    id,
    phase: 'exiting',
    segment: segment(id),
    frames: [{ at: 1, hold }],
    base: { ...RESTING, hold: 1 },
    startedAt: 0,
    delayMs: 0,
    durationMs: 100,
    declaresHold: true,
    ghostArc: null,
  })

  it('leaves a wedge that has released its arc out of the layout', () => {
    const tracks = new Map<string, Track>([
      ['ana', { ...holding('ana', 1), phase: 'present', frames: [], declaresHold: false }],
      ['ben', holding('ben', 0)],
    ])
    const { drawn } = drawList(tracks, 100)
    // ben has decayed to hold 0 at p=1, so ana takes the whole circle.
    const ana = drawn.find((item) => item.segment.id === 'ana')
    expect(ana && ana.arc.end - ana.arc.start).toBeCloseTo(1)
  })

  it('lays out a holding wedge by its weight as well as its hold', () => {
    const tracks = new Map<string, Track>([
      ['ana', { ...restingFor('ana'), segment: segment('ana', 3) }],
      ['ben', { ...holding('ben', 0), durationMs: 200, segment: segment('ben', 1) }],
    ])
    // ana holds 3; ben has released three quarters of its 1, so it holds 0.25.
    const ben = drawList(tracks, 100).drawn.find((item) => item.segment.id === 'ben')
    expect(ben && ben.arc.end - ben.arc.start).toBeCloseTo(0.25 / 3.25)
  })

  it('lays out live wedges in track order', () => {
    const tracks = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', restingFor('ben')],
    ])
    const { drawn } = drawList(tracks, 0)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
    expect(drawn[0].arc.start).toBe(0)
  })

  it('draws a reversing wedge once, at the arc it was laid', () => {
    // Turned around mid-exit: still carrying the arc its exit froze, and taking
    // its weight back up. Both halves of drawList can see it.
    const reversing: Track = {
      ...restingFor('ben'),
      phase: 'entering',
      frames: [{ at: 1, hold: 1 }],
      base: { ...RESTING, hold: 0 },
      durationMs: 200,
      declaresHold: true,
      ghostArc: { id: 'ben', start: 0.5, end: 1 },
    }
    const tracks = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', reversing],
    ])
    const bens = drawList(tracks, 100).drawn.filter((item) => item.segment.id === 'ben')
    expect(bens).toHaveLength(1)
    expect(bens[0].presence.hold).toBeCloseTo(0.75)
  })

  it('leaves a released wedge out of the arcs it reports', () => {
    const tracks = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }],
    ])
    // A ghost re-reporting its frozen arc would freeze it against itself forever.
    expect(drawList(tracks, 100).arcs.has('ben')).toBe(false)
  })

  it('shrinks a wedge that is still holding part of its weight', () => {
    const tracks = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', { ...holding('ben', 0), durationMs: 200 }],
    ])
    // Halfway through in wall-clock, which ease-out has carried to 0.75 of the
    // release, so ben still holds a quarter of its weight against ana's one.
    const ben = drawList(tracks, 100).drawn.find((item) => item.segment.id === 'ben')
    expect(ben && ben.arc.end - ben.arc.start).toBeCloseTo(0.25 / 1.25)
  })

  it('draws a wedge at zero hold on its frozen arc', () => {
    const ghost = { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }
    const tracks = new Map<string, Track>([['ben', ghost]])
    const { drawn } = drawList(tracks, 100)
    expect(drawn[0].arc).toEqual({ id: 'ben', start: 0.5, end: 1 })
    expect(drawn[0].presence.hold).toBe(0)
  })

  it('moves no other wedge when a ghost is present', () => {
    const solo = new Map<string, Track>([['ana', restingFor('ana')]])
    const withGhost = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }],
    ])
    const before = drawList(solo, 100).drawn[0].arc
    const after = drawList(withGhost, 100).drawn.find((item) => item.segment.id === 'ana')?.arc
    expect(after).toEqual(before)
  })

  it('drops a ghost that never had an arc', () => {
    const tracks = new Map<string, Track>([['ben', holding('ben', 0)]])
    expect(drawList(tracks, 100).drawn).toHaveLength(0)
  })

  it('reports the arcs it laid out, for the next departure to freeze', () => {
    const tracks = new Map<string, Track>([['ana', restingFor('ana')]])
    expect(drawList(tracks, 0).arcs.get('ana')).toEqual({ id: 'ana', start: 0, end: 1 })
  })

  it('orders ghosts after the live roster', () => {
    const tracks = new Map<string, Track>([
      ['ben', { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }],
      ['ana', restingFor('ana')],
    ])
    const { drawn } = drawList(tracks, 100)
    expect(drawn.map((item) => item.segment.id)).toEqual(['ana', 'ben'])
  })

  it('leaves the tracks it was given untouched', () => {
    const ben = { ...holding('ben', 0), ghostArc: { id: 'ben', start: 0.5, end: 1 } }
    const tracks = new Map<string, Track>([
      ['ana', restingFor('ana')],
      ['ben', ben],
    ])
    const before = JSON.stringify([...tracks.entries()])
    drawList(tracks, 100)
    expect(JSON.stringify([...tracks.entries()])).toBe(before)
  })
})

describe('sampleTrack', () => {
  it('eases progress out rather than running it linear', () => {
    // The WAAPI path passed `ease-out` to animate(); a keyframe list carries no
    // easing of its own, so dropping this would silently flatten every motion.
    const entering = advance(input({ now: 0 }))
    const ana = entering.get('ana')
    expect(ana && sampleTrack(ana, 200).opacity).toBeCloseTo(0.75)
    expect(ana && sampleTrack(ana, 100).opacity).toBeCloseTo(0.4375)
  })

  it('hands back the shared resting presence for a settled wedge', () => {
    // By identity, which is what freezing RESTING protects.
    expect(sampleTrack(restingFor('ana'), 500)).toBe(RESTING)
  })
})

describe('advance through drawList', () => {
  it('draws a departed wedge at the arc it last held', () => {
    const start = advance(input({ segments: [segment('ana'), segment('ben')], now: 0 }))
    const before = drawList(start, 1000)
    const leaving = advance(
      input({ tracks: start, segments: [segment('ana')], arcs: before.arcs, now: 1000 }),
    )
    const ben = drawList(leaving, 1000).drawn.find((item) => item.segment.id === 'ben')
    expect(ben?.arc).toEqual(before.arcs.get('ben'))
  })

  it('keeps the frozen arc when a wedge turns around mid-exit', () => {
    const start = advance(input({ segments: [segment('ana'), segment('ben')], now: 0 }))
    const before = drawList(start, 1000)
    const leaving = advance(
      input({ tracks: start, segments: [segment('ana')], arcs: before.arcs, now: 1000 }),
    )
    const back = advance(
      input({
        tracks: leaving,
        segments: [segment('ana'), segment('ben')],
        arcs: drawList(leaving, 1000).arcs,
        now: 1100,
      }),
    )
    expect(back.get('ben')?.ghostArc).toEqual(before.arcs.get('ben'))
  })

  it('moves no survivor on the frame a neighbor starts leaving', () => {
    const start = advance(
      input({ segments: [segment('ana'), segment('ben'), segment('cy')], now: 0 }),
    )
    const before = drawList(start, 0)
    const leaving = advance(
      input({
        tracks: start,
        segments: [segment('ana'), segment('cy')],
        arcs: before.arcs,
        now: 0,
      }),
    )
    // A hold-declaring exit, standing in for Task 8's shrink. Everything else
    // about the track is what advance built.
    const ben = leaving.get('ben') as Track
    const held = new Map(leaving)
    held.set('ben', {
      ...ben,
      frames: [
        { at: 0, hold: 1 },
        { at: 1, hold: 0 },
      ],
      declaresHold: true,
    })

    const after = drawList(held, 0)
    const at = (list: typeof after.drawn, id: string) => list.find((item) => item.segment.id === id)
    expect(at(after.drawn, 'cy')?.arc).toEqual(at(before.drawn, 'cy')?.arc)
    expect(at(after.drawn, 'ben')?.arc).toEqual(at(before.drawn, 'ben')?.arc)
  })
})

describe('settle', () => {
  it('drops everything off the roster and rests what is on it', () => {
    const settled = settle([segment('ana')])
    const ana = settled.get('ana')
    expect(settled.has('ben')).toBe(false)
    expect(ana?.phase).toBe('present')
    expect(ana && sampleTrack(ana, 999)).toEqual(RESTING)
  })

  it('rests a wedge that was still arriving, rather than dropping it', () => {
    // A spin can start against a roster whose wedges have not finished entering.
    const settled = settle([segment('ana'), segment('ben')])
    expect([...settled.keys()]).toEqual(['ana', 'ben'])
    expect([...settled.values()].every((track) => track.phase === 'present')).toBe(true)
  })
})
