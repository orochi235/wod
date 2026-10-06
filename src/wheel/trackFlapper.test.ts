import { describe, expect, it, vi } from 'vitest'
import { WHEEL } from '../clock/motion'
import { fakeMotion } from '../clock/testing'
import { anglePatch } from './anglePatch'
import { MAX_DEFLECTION_DEG } from './flapper'
import { angleAt } from './outage'
import type { RotationTrack } from './rotation'
import { trackFlapper } from './trackFlapper'

/** 0° to `to` over `ms`, linear. */
const turn = (to: number, ms: number): RotationTrack => ({
  keyframes: [{ transform: 'rotate(0deg)' }, { transform: `rotate(${to}deg)` }],
  durationMs: ms,
  easing: 'linear',
  to,
})

/** One peg at 342°: under the hinge once the wheel has turned 18°, within reach from 6° to 30°. */
const PEGS = [0.95]

function rig(track: RotationTrack) {
  const fake = fakeMotion()
  const written: number[] = []
  const click = vi.fn()
  const stop = trackFlapper(fake.motion, {
    pegs: () => PEGS,
    write: (deg) => written.push(deg),
    click,
  })
  fake.motion.wheel.cue({
    patch: anglePatch(track),
    subjects: [WHEEL],
    start: 0,
    loop: false,
    freeze: 'after',
  })
  const deflection = () => fake.motion.wheel.probe(WHEEL).deflection ?? 0
  return { ...fake, written, click, stop, deflection }
}

describe('trackFlapper', () => {
  it('lifts the arm as a peg comes under it', () => {
    const { step, deflection } = rig(turn(36, 1000))
    step(0)
    expect(deflection()).toBe(0)
    for (let t = 16; t <= 500; t += 16) step(t)
    expect(Math.abs(deflection())).toBeGreaterThan(MAX_DEFLECTION_DEG * 0.5)
    expect(Math.abs(deflection())).toBeLessThanOrEqual(MAX_DEFLECTION_DEG)
  })

  it('pushes the arm the way the peg is going', () => {
    const { step, deflection } = rig(turn(36, 1000))
    for (let t = 0; t <= 500; t += 16) step(t)
    // A clockwise wheel carries the arm's tip counter-clockwise: see deflectionDeg.
    expect(deflection()).toBeLessThan(0)
  })

  it('falls upright the same way at any frame rate', () => {
    // Stops with the peg under the hinge, so the arm is up when the wheel stops.
    const at = (frameMs: number) => {
      const { step, deflection } = rig(turn(18, 500))
      for (let t = 0; t <= 600; t += frameMs) step(t)
      return deflection()
    }
    expect(at(20)).toBeCloseTo(at(5), 0)
    expect(Math.abs(at(5))).toBeLessThan(MAX_DEFLECTION_DEG * 0.25)
  })

  it('writes the arm only when it moves', () => {
    const { step, written } = rig(turn(36, 1000))
    step(0)
    step(16)
    expect(written).toEqual([])
    for (let t = 32; t <= 500; t += 16) step(t)
    expect(written.length).toBeGreaterThan(0)
  })

  it('clicks once per peg, at the track’s own speed', () => {
    const track = turn(36, 1000)
    const { step, click } = rig(track)
    for (let t = 0; t <= 1000; t += 16) step(t)
    const clicks = click.mock.calls.filter(([count]) => count > 0)
    expect(clicks).toHaveLength(1)
    expect(clicks[0][1]).toBeCloseTo(angleAt(track, 501) - angleAt(track, 500), 6)
  })

  it('lets the clock sleep once the wheel is held and the arm is upright', () => {
    const { step, waiting } = rig(turn(18, 500))
    for (let t = 0; t <= 2000; t += 16) step(t)
    expect(waiting()).toBe(false)
  })

  it('leaves the mix when stopped', () => {
    const { step, stop, deflection } = rig(turn(36, 1000))
    for (let t = 0; t <= 500; t += 16) step(t)
    stop()
    step(516)
    expect(deflection()).toBe(0)
  })
})
