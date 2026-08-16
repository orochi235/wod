import { describe, expect, it } from 'vitest'
import app from './App.css?raw'
import wheel from './wheel/Wheel.css?raw'
import { wof } from './wheel/themes/wof'

/**
 * A look dresses two things now — the wheel, and the page it is shown on — so
 * the token it emits may be read by either stylesheet. jsdom applies no
 * stylesheet, so renaming a token on both the emitting side and its consumer's
 * test would otherwise leave the suite green and the look unpainted.
 */
describe('look tokens', () => {
  it('are all consumed by a stylesheet', () => {
    const sheets = `${wheel}\n${app}`
    for (const name of Object.keys(wof.tokens)) {
      expect(sheets).toContain(`var(${name}`)
    }
  })
})
