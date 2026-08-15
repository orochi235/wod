import type { CSSProperties } from 'react'
import { describe, expect, it } from 'vitest'
import wheelCss from '../wheel/Wheel.css?raw'
import { styleOf, transformOf } from './css'
import { RESTING, samplePresence } from './sample'
import { fly } from './transitions/fly'

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

describe('styleOf', () => {
  it('emits nothing extra for a resting presence', () => {
    const style = styleOf(RESTING, target)
    expect(style['--wedge-transform']).toBe('none')
    expect(style['--wedge-opacity']).toBe('1')
  })

  it('emits opacity and a transform together', () => {
    const style = styleOf({ ...RESTING, opacity: 0.5, scale: 0.9 }, target)
    expect(style['--wedge-opacity']).toBe('0.5')
    expect(style['--wedge-transform']).toContain('scale(0.9)')
  })

  it('clips only when the aperture is closed', () => {
    expect(styleOf(RESTING, target)['--wedge-clip']).toBeUndefined()
    expect(styleOf({ ...RESTING, aperture: 0.5 }, target)['--wedge-clip']).toBe(
      'circle(35.355% at 50% 50%)',
    )
  })

  it('is assignable to a React style prop', () => {
    const style: CSSProperties = styleOf(RESTING, target)
    expect(style).toBeTruthy()
  })

  it('lets an undeclared direction fall through to the wedge angle', () => {
    // An absent offsetAngle means the wedge's own angle, which only the emitter
    // knows. A presence that pins it to 0 would send every wedge to 12 o'clock.
    expect(styleOf({ ...RESTING, offset: 1 }, target)['--wedge-transform']).toBe(
      transformOf({ at: 0, offset: 1 }, target),
    )
  })

  it('flies a wedge along its own radius at fly’s default direction', () => {
    const { keyframes } = fly.frames(fly.defaults, {
      index: 0,
      count: 3,
      angle: target.angle,
      durationMs: 500,
      moment: 'enter',
    })
    const presence = samplePresence(keyframes, 0, RESTING)
    expect(styleOf(presence, target)['--wedge-transform']).toBe(transformOf(keyframes[0], target))
  })

  it('reuses the keyframe transform arithmetic', () => {
    const presence = { ...RESTING, offset: 1, offsetAngle: 45 }
    expect(styleOf(presence, target)['--wedge-transform']).toBe(
      transformOf({ at: 0, offset: 1, offsetAngle: 45 }, target),
    )
  })

  it('reads back off an element as the property the stylesheet consumes', () => {
    const node = document.createElement('div')
    for (const [key, value] of Object.entries(styleOf({ ...RESTING, opacity: 0.25 }, target))) {
      node.style.setProperty(key, value)
    }
    expect(node.style.getPropertyValue('--wedge-opacity')).toBe('0.25')
  })

  // jsdom does not substitute var(), so nothing at runtime can prove these reach
  // the properties they name. Renaming or re-pairing one would otherwise leave
  // every test green and every wedge unanimated.
  it('names properties Wheel.css binds, to the properties they drive', () => {
    const bindings = [
      ['--wedge-transform', 'transform'],
      ['--wedge-opacity', 'opacity'],
      ['--wedge-clip', 'clip-path'],
    ]
    expect(Object.keys(styleOf({ ...RESTING, aperture: 0.5 }, target))).toHaveLength(
      bindings.length,
    )
    for (const [name, property] of bindings) {
      expect(wheelCss).toContain(`${property}: var(${name},`)
    }
  })
})
