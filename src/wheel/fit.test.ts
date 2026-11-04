import { describe, expect, it } from 'vitest'
import { createScheduledConductor } from './conductor'
import { angleAt, fitSpin, pegTimes, scheduleFor } from './fit'
import { pegCrossings } from './flapper'
import { rotationTrack } from './rotation'
import type { SpinConfig } from './types'

const config: SpinConfig = {
  durationMs: 6000,
  fullSpins: 4,
  direction: 'cw',
  easing: [0.15, 0.85, 0.2, 1],
  morphs: [],
}
const pegs = Array.from({ length: 12 }, (_, i) => i / 12)

describe('angleAt', () => {
  it('runs from the first keyframe to the last', () => {
    const track = rotationTrack(30, 200, config)
    expect(angleAt(track, 0)).toBeCloseTo(30)
    expect(angleAt(track, config.durationMs)).toBeCloseTo(track.to)
  })

  it('reads a settled track through its own keyframe curves', () => {
    const track = rotationTrack(0, 90, {
      ...config,
      settle: { ms: 1500, curve: [0.33, 1, 0.68, 1] },
    })
    expect(angleAt(track, config.durationMs)).toBeCloseTo(track.to)
    expect(angleAt(track, 3000)).toBeLessThan(angleAt(track, 4000))
  })
})

describe('pegTimes', () => {
  it('finds as many crossings as the flapper counts, in order', () => {
    const track = rotationTrack(10, 250, config)
    let count = 0
    for (let ms = 0; ms < config.durationMs; ms += 5)
      count += pegCrossings(angleAt(track, ms), angleAt(track, ms + 5), pegs)
    const times = pegTimes(track, pegs)
    expect(times.length).toBe(count)
    expect(times.every((t, i) => i === 0 || t >= times[i - 1])).toBe(true)
  })

  it('counts the same for a wheel turning the other way', () => {
    const track = rotationTrack(10, 250, { ...config, direction: 'ccw' })
    let count = 0
    for (let ms = 0; ms < config.durationMs; ms += 5)
      count += pegCrossings(angleAt(track, ms), angleAt(track, ms + 5), pegs, -1)
    expect(pegTimes(track, pegs).length).toBe(count)
  })
})

describe('scheduleFor', () => {
  it('starts the last note on the last peg', () => {
    const units = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 2 : 1))
    const track = rotationTrack(0, 123, config)
    const schedule = scheduleFor(track, pegs, units)
    expect(schedule).not.toBeNull()
    if (!schedule) return
    const conductor = createScheduledConductor(units, schedule)
    const played = schedule.advance.map(() => conductor.peg())
    expect(played.at(-1)).toBe(units.length - 1)
    // Each note once, in order, with none after the last peg's.
    const notes = played.filter((note) => note !== null)
    expect(notes).toEqual(notes.map((_, i) => notes[0] + i))
  })
})

describe('fitSpin', () => {
  const units = Array.from({ length: 240 }, (_, i) => (i % 4 === 0 ? 2 : 1))
  const unitS = 0.15

  it('cruises at the tune tempo, then brakes', () => {
    const { config: fitted } = fitSpin(config, pegs, units, unitS)
    expect(fitted.settle?.ms).toBeGreaterThanOrEqual(4000)
    const times = pegTimes(rotationTrack(0, 180, fitted), pegs)
    // A cruising peg gap times a power of two is the tune's unit.
    const gap = times[20] - times[19]
    const perUnit = unitS / gap
    expect(Math.log2(perUnit)).toBeCloseTo(Math.round(Math.log2(perUnit)), 1)
  })

  it('starts the tune on the first peg and lands it on the last', () => {
    const fitted = fitSpin(config, pegs, units, unitS)
    const schedule = scheduleFor(rotationTrack(0, 77, fitted.config), pegs, units, fitted.threshold)
    expect(schedule?.startUnits).toBeCloseTo(0)
    if (!schedule) return
    const conductor = createScheduledConductor(units, schedule)
    const played = schedule.advance.map(() => conductor.peg())
    expect(played[0]).toBe(0)
    expect(played.at(-1)).toBe(units.length - 1)
  })
})
