import { mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { WHEEL, type WheelPose, wheelKit } from '../clock/motion'
import { blackoutKeyframes, blackoutMs } from './schedule'
import { blackoutPatch, darkPatch } from './voices'

const plan = { sparkAtMs: 0, popAtMs: 500, lightsAtMs: 900, resumedAtMs: 900 }

function reader(patch: ReturnType<typeof darkPatch>) {
  const wheel = mix<string, WheelPose>(wheelKit)
  wheel.cue({ patch, subjects: [WHEEL], start: 0, loop: false })
  return (t: number) => {
    wheel.sync(t)
    return wheel.probe(WHEEL)
  }
}

describe('darkPatch', () => {
  it('is dark from the pop until the lights, to the millisecond', () => {
    const read = reader(darkPatch(plan))
    expect([499, 500, 899, 900].map((t) => read(t).dark ?? false)).toEqual([
      false,
      true,
      true,
      false,
    ])
  })
})

describe('blackoutPatch', () => {
  it('lands on every blackout keyframe', () => {
    const read = reader(blackoutPatch(0.6))
    const total = blackoutMs()
    for (const frame of blackoutKeyframes(0.6)) {
      const t = (frame.offset as number) * total
      if (t >= total) continue
      expect(read(t).blackout).toBeCloseTo(Number(frame.opacity), 9)
    }
  })
})
