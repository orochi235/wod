import { describe, expect, it } from 'vitest'
import type { Segment } from '../wheel/types'
import { RESTING } from './sample'
import { advance, sampleTrack, settle } from './tracks'
import type { Transitions } from './types'

const segment = (id: string): Segment => ({ id, label: id, weight: 1 })

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
    // Enter is 400ms of fade; interrupt it a quarter of the way in.
    const entering = advance(input({ now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [], now: 100 }))
    expect(exiting.get('ana')?.base.opacity).toBeCloseTo(0.25)
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
    // A quarter of the way out, so it turns around from 0.75 rather than
    // restarting its arrival at the 0 its entrance declares.
    expect(leaving && sampleTrack(leaving, 1100).opacity).toBeCloseTo(0.75)
    expect(arriving && sampleTrack(arriving, 1100).opacity).toBeCloseTo(0.75)
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
    expect(ben && sampleTrack(ben, 150).opacity).toBeCloseTo(0.25)
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
})

describe('settle', () => {
  it('drops exiting wedges and rests the rest', () => {
    const entering = advance(input({ segments: [segment('ana'), segment('ben')], now: 0 }))
    const exiting = advance(input({ tracks: entering, segments: [segment('ana')], now: 100 }))
    const settled = settle(exiting)
    const ana = settled.get('ana')
    expect(settled.has('ben')).toBe(false)
    expect(ana?.phase).toBe('present')
    expect(ana && sampleTrack(ana, 999)).toEqual(RESTING)
  })
})
