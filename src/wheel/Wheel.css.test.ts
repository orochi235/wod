import { describe, expect, it } from 'vitest'
import { FONT_STACK, FONT_WEIGHT } from '../slice/measure'
import css from './Wheel.css?raw'
import { wof } from './themes/wof'

describe('Wheel.css', () => {
  // jsdom applies no stylesheet, so renaming a token on both the emitting side
  // and its test would leave the suite green and the wheel unpainted.
  it('consumes every token the wof look emits', () => {
    for (const name of Object.keys(wof.tokens)) {
      expect(css).toContain(`var(${name}`)
    }
  })

  // Every fitted size comes from a canvas measured in FONT_STACK at FONT_WEIGHT.
  // Painting the label in anything else silently mis-sizes every wedge, and
  // nothing in jsdom would notice.
  it('paints a label in the face the measurer measures', () => {
    expect(css).toContain(`font-family: ${FONT_STACK};`)
    expect(css).toContain(`font-weight: ${FONT_WEIGHT};`)
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
