import { keys, mix } from '@msb235/blits'
import { describe, expect, it } from 'vitest'
import { type WedgePose, wedgeKit } from '../clock/motion'

const wedges = () => mix<string, WedgePose>(wedgeKit)

describe('presence channels', () => {
  it('read at rest for a wedge no voice touches', () => {
    const w = wedges()
    w.sync(0)
    const pose = w.probe('ana')
    expect(pose).toMatchObject({
      share: 1,
      opacity: 1,
      scale: 1,
      offset: 0,
      rotate: 0,
      aperture: 1,
    })
    // Absent means the wedge's own angle, which no number can say.
    expect(pose.offsetAngle).toBeUndefined()
  })

  it('interpolate a direction as a number', () => {
    const w = wedges()
    w.cue({
      patch: keys<string, WedgePose>(400, [
        { at: 0, delta: { offsetAngle: 0 } },
        { at: 1, delta: { offsetAngle: 90 } },
      ]),
      subjects: ['ana'],
      start: 0,
      loop: false,
    })
    w.sync(200)
    expect(w.probe('ana').offsetAngle).toBe(45)
  })

  it('keep share and aperture inside 0…1', () => {
    const w = wedges()
    w.cue({
      patch: keys<string, WedgePose>(400, [{ at: 0, delta: { share: 1.5, aperture: -0.5 } }]),
      subjects: ['ana'],
      start: 0,
      loop: false,
    })
    w.sync(10)
    expect(w.probe('ana')).toMatchObject({ share: 1, aperture: 0 })
  })
})
