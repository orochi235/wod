import { describe, expect, it } from 'vitest'
import type { Curve } from '../wheel/types'
import { spinConfigOf } from './motion'
import type { Motion } from './types'

const motion: Motion = {
  durationMs: 4000,
  turns: 5,
  direction: 'cw',
  easing: [0.25, 0.1, 0.25, 1],
}

describe('spinConfigOf', () => {
  it('renames turns to fullSpins', () => {
    expect(spinConfigOf(motion, []).fullSpins).toBe(5)
  })

  it('carries settle through when present', () => {
    const settle = { ms: 300, curve: [0, 0, 1, 1] as Curve }
    expect(spinConfigOf({ ...motion, settle }, []).settle).toBe(settle)
  })

  it('omits the settle key entirely when absent, rather than settle: undefined', () => {
    expect(spinConfigOf(motion, [])).not.toHaveProperty('settle')
  })

  it('carries the given morphs through unchanged', () => {
    const morphs = [{ segmentId: 'a', keyframes: [], durationMs: 100 }]
    expect(spinConfigOf(motion, morphs).morphs).toBe(morphs)
  })
})
