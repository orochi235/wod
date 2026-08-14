import { describe, expect, it } from 'vitest'
import { toKeyframes, transformOf } from './css'

const target = { angle: 90, radius: 200, pivot: 120 }

describe('transformOf', () => {
  it('is the identity when a frame moves nothing', () => {
    expect(transformOf({ at: 0 }, target)).toBe('none')
  })

  // Out along the wedge's own angle: rotate into its frame, move, rotate back.
  it('pushes a wedge out along its own angle', () => {
    expect(transformOf({ at: 0, offset: 1.5 }, target)).toBe(
      'rotate(90deg) translate(0px, -300px) rotate(-90deg)',
    )
  })

  it('honors an explicit direction over the wedge angle', () => {
    expect(transformOf({ at: 0, offset: 1, offsetAngle: 0 }, target)).toBe(
      'rotate(0deg) translate(0px, -200px) rotate(0deg)',
    )
  })

  it('tumbles about the wedge centroid, not the hub', () => {
    expect(transformOf({ at: 0, rotate: 45 }, target)).toBe(
      'rotate(90deg) translate(0px, -120px) rotate(45deg) translate(0px, 120px) rotate(-90deg)',
    )
  })

  it('scales about the hub', () => {
    expect(transformOf({ at: 0, scale: 0.5 }, target)).toBe('scale(0.5)')
  })

  it('composes offset, tumble, and scale in that order', () => {
    expect(transformOf({ at: 0, offset: 1, rotate: 90, scale: 2 }, target)).toBe(
      'rotate(90deg) translate(0px, -200px) rotate(-90deg) rotate(90deg) translate(0px, -120px) rotate(90deg) translate(0px, 120px) rotate(-90deg) scale(2)',
    )
  })

  // A pivot of zero is the wheel scope: there is no centroid but the hub.
  it('tumbles about the hub at wheel scope', () => {
    expect(transformOf({ at: 0, rotate: 30 }, { angle: 0, radius: 200, pivot: 0 })).toBe(
      'rotate(0deg) translate(0px, 0px) rotate(30deg) translate(0px, 0px) rotate(0deg)',
    )
  })

  it('emits css units, without which the browser drops the whole transform', () => {
    const css = transformOf({ at: 0, offset: 1, rotate: 45, scale: 2 }, target)
    for (const [, angle] of css.matchAll(/rotate\(([^)]*)\)/g)) {
      expect(angle).toMatch(/^-?[\d.]+deg$/)
    }
    for (const [, move] of css.matchAll(/translate\(([^)]*)\)/g)) {
      expect(move).toMatch(/^-?[\d.]+px, -?[\d.]+px$/)
    }
  })
})

describe('toKeyframes', () => {
  it('carries timing across as the WAAPI offset', () => {
    const frames = toKeyframes(
      [
        { at: 0, opacity: 0 },
        { at: 1, opacity: 1 },
      ],
      target,
    )
    expect(frames.map((frame) => frame.offset)).toEqual([0, 1])
    expect(frames.map((frame) => frame.opacity)).toEqual([0, 1])
  })

  it('omits opacity entirely when no frame sets it', () => {
    for (const frame of toKeyframes(
      [
        { at: 0, scale: 0 },
        { at: 1, scale: 1 },
      ],
      target,
    )) {
      expect('opacity' in frame).toBe(false)
    }
  })

  // A property present in only some keyframes interpolates from the computed
  // style rather than from the authored value, which is a different animation.
  it('fills a partially set property across every keyframe', () => {
    const frames = toKeyframes([{ at: 0, aperture: 0 }, { at: 1 }], target)
    expect(frames[0].clipPath).toBe('circle(0% at 50% 50%)')
    expect(frames[1].clipPath).toBe('circle(70.711% at 50% 50%)')
  })

  it('always emits a transform, so no keyframe interpolates from the layout', () => {
    for (const frame of toKeyframes([{ at: 0, offset: 1 }, { at: 1 }], target)) {
      expect(typeof frame.transform).toBe('string')
    }
  })
})
