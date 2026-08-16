import { describe, expect, it } from 'vitest'
import { FONT_STACK, FONT_WEIGHT } from '../slice/measure'
import css from './Wheel.css?raw'

describe('Wheel.css', () => {
  // Every fitted size comes from a canvas measured in FONT_STACK at FONT_WEIGHT.
  // Painting the label in anything else silently mis-sizes every wedge, and
  // nothing in jsdom would notice.
  it('paints a label in the face the measurer measures', () => {
    expect(css).toContain(`font-family: ${FONT_STACK};`)
    expect(css).toContain(`font-weight: ${FONT_WEIGHT};`)
  })

  // A class beats a presentation attribute, so a family on `.wheel__label`
  // would override the face a part names — measured in one, painted in another.
  it('leaves the label class no family of its own', () => {
    const rule = css.match(/\.wheel__label\s*\{([^}]*)\}/)
    expect(rule?.[1]).not.toContain('font-family')
  })

  // Where the faces themselves are declared; fonts.css.test.ts checks them.
  it('pulls in the catalogue', () => {
    expect(css).toContain('@import "./fonts.css";')
  })

  it('binds each part class to a rule', () => {
    for (const part of ['rim', 'face', 'peg', 'hub', 'sheen', 'panel', 'divider']) {
      expect(css).toContain(`.wheel__${part}`)
    }
  })
})
