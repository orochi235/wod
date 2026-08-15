import { describe, expect, it } from 'vitest'
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

  it('binds each part class to a rule', () => {
    for (const part of ['rim', 'face', 'peg', 'hub', 'sheen', 'panel', 'divider']) {
      expect(css).toContain(`.wheel__${part}`)
    }
  })
})
