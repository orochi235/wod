import { describe, expect, it } from 'vitest'
import { DARK_MS } from '../wheel/outage'
import {
  BLOW_MS,
  CHORD,
  CLANKS,
  DEAD_HUM,
  DRONE,
  FLICKERS,
  FLICKER_MS,
  HITS,
  SWOOPS,
  blackoutKeyframes,
  blackoutMs,
  escalation,
} from './schedule'

describe('the passage', () => {
  it('keeps every drum-led event on the 110 bpm sixteenth grid', () => {
    const sixteenth = 60000 / 110 / 4
    const first = HITS[0].at
    const onGrid = (at: number) => {
      const steps = (at - first) / sixteenth
      return Math.abs(steps - Math.round(steps)) * sixteenth < 0.5
    }
    const rises = SWOOPS.filter((swoop) => swoop.to > swoop.from)
    for (const at of [
      ...HITS.map((hit) => hit.at),
      ...CLANKS.map((clank) => clank.at),
      ...rises.map((rise) => rise.at),
      ...FLICKERS.map((flicker) => flicker.at),
      CHORD.at,
      DEAD_HUM.from,
    ]) {
      expect(onGrid(at), `${at} ms is off the grid`).toBe(true)
    }
  })

  it('brings the lights back on the chord the wheel is timed to', () => {
    expect(Math.abs(CHORD.at - DARK_MS)).toBeLessThan(1)
  })
})

describe('the blackout', () => {
  it('flickers no more than three times in any second', () => {
    // WCAG 2.3.1. A flicker is one full dip and return, so it counts once.
    const starts = FLICKERS.map((flicker) => flicker.at)
    for (const start of starts) {
      const inWindow = starts.filter((at) => at >= start && at < start + 1000)
      expect(inWindow.length).toBeLessThanOrEqual(3)
    }
  })

  it('only ever lifts the black partway', () => {
    for (const flicker of FLICKERS) expect(flicker.lift).toBeLessThan(1)
  })

  it('keeps each flicker clear of the next', () => {
    const starts = FLICKERS.map((flicker) => flicker.at).sort((a, b) => a - b)
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThan(FLICKER_MS)
    }
  })

  it('sags at the pop, is black by the end of the drone, still black on the chord, and clear at the end', () => {
    const frames = blackoutKeyframes(1)
    expect(frames[0].offset).toBe(0)
    expect(frames[0].opacity).toBeGreaterThan(0)
    expect(frames[0].opacity).toBeLessThan(0.5)
    const dimmed = frames.find((frame) => frame.offset === (DRONE.to + 500) / blackoutMs())
    expect(dimmed?.opacity).toBe(1)
    const chord = frames.find((frame) => frame.offset === DARK_MS / blackoutMs())
    expect(chord?.opacity).toBe(1)
    expect(frames[frames.length - 1]).toEqual({ offset: 1, opacity: 0 })
  })

  it('never passes the depth it is given', () => {
    for (const frame of blackoutKeyframes(0.6)) expect(frame.opacity).toBeLessThanOrEqual(0.6)
  })

  it('has offsets that never go backwards', () => {
    const offsets = blackoutKeyframes(1).map((frame) => frame.offset as number)
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
  })
})

describe('escalation', () => {
  const shots = escalation(5000)

  it('stops where the blow takes over', () => {
    for (const shot of shots) expect(shot.at).toBeLessThan(5000 - BLOW_MS + 100)
  })

  it('comes faster and harder as it goes', () => {
    const leads = shots.filter((shot, i) => i === 0 || shot.at - shots[i - 1].at > 100)
    const gaps = leads.slice(1).map((shot, i) => shot.at - leads[i].at)
    expect(gaps[gaps.length - 1]).toBeLessThan(gaps[0])
    expect(leads[leads.length - 1].energy).toBeGreaterThan(leads[0].energy)
  })

  it('works up from sputters to showers', () => {
    expect(shots[0].kind).toBe('sputter')
    expect(shots.some((shot) => shot.kind === 'arc')).toBe(true)
    expect(shots.some((shot) => shot.kind === 'shower')).toBe(true)
  })

  it('leaves a phase no longer than the blow to the blow alone', () => {
    expect(escalation(BLOW_MS)).toEqual([])
  })
})
