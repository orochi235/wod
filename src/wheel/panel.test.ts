import { describe, expect, it } from 'vitest'
import { panelPath } from './panel'

describe('panelPath', () => {
  it('draws a slab between the two radii', () => {
    const d = panelPath(0, 0.25, 200, [0.5, 0.9], 0)
    expect(d).toContain('M ')
    expect(d).toContain('A ')
  })

  it('insets from both edges of the arc', () => {
    const wide = panelPath(0, 0.5, 200, [0.5, 0.9], 0)
    const inset = panelPath(0, 0.5, 200, [0.5, 0.9], 0.05)
    expect(inset).not.toBe(wide)
  })

  it('draws nothing once the inset has eaten the arc', () => {
    expect(panelPath(0, 0.02, 200, [0.5, 0.9], 0.05)).toBe('')
  })

  it('draws nothing for an arc with no width', () => {
    expect(panelPath(0.5, 0.5, 200, [0.5, 0.9], 0)).toBe('')
  })

  it('draws nothing when the radii are inside out', () => {
    expect(panelPath(0, 0.25, 200, [0.9, 0.5], 0)).toBe('')
  })
})
