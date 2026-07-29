import { describe, expect, it } from 'vitest'
import { fitLabel } from './label'

describe('fitLabel', () => {
  it('returns null for a zero-width arc', () => {
    expect(fitLabel('Dave', 0, 200)).toBeNull()
  })

  it('returns null for empty text', () => {
    expect(fitLabel('', 0.25, 200)).toBeNull()
  })

  it('returns null when the arc is too narrow to be legible', () => {
    expect(fitLabel('free beer', 0.0005, 200)).toBeNull()
  })

  it('returns the full text when it fits', () => {
    const fitted = fitLabel('Dave', 0.25, 200)
    expect(fitted?.text).toBe('Dave')
    expect(fitted?.fontSize).toBeGreaterThan(0)
  })

  it('truncates with an ellipsis when the text is too long', () => {
    const fitted = fitLabel(
      'my boss buys the team beer for the next decade',
      0.25,
      200,
    )
    expect(fitted?.text.endsWith('…')).toBe(true)
    expect(fitted?.text.length).toBeLessThan(46)
  })

  it('never exceeds the base font size on a wide arc', () => {
    const fitted = fitLabel('Dave', 1, 200)
    expect(fitted?.fontSize).toBeLessThanOrEqual(18)
  })

  it('scales the font down as the arc narrows', () => {
    // 0.01 turns is narrow enough to force a reduced size but still wide
    // enough to stay above the legibility floor.
    const wide = fitLabel('Dave', 0.5, 200)
    const narrow = fitLabel('Dave', 0.01, 200)
    expect(narrow).not.toBeNull()
    expect(narrow?.fontSize).toBeLessThan(wide?.fontSize ?? 0)
  })
})
