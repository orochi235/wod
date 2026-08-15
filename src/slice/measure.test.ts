import { describe, expect, it, vi } from 'vitest'
import { createMeasure, estimateWidth } from './measure'

describe('estimateWidth', () => {
  it('scales linearly with size', () => {
    expect(estimateWidth('Sleve', 20)).toBeCloseTo(estimateWidth('Sleve', 10) * 2)
  })

  it('is zero for empty text', () => {
    expect(estimateWidth('', 20)).toBe(0)
  })
})

describe('createMeasure', () => {
  it('falls back to the estimate when there is no canvas context', () => {
    // jsdom has no 2d context, which is the environment this branch exists for.
    const measure = createMeasure()
    expect(measure('Onson Sweemey', 16)).toBeCloseTo(estimateWidth('Onson Sweemey', 16))
  })

  it('measures once per string and scales the cached unit width', () => {
    const measureText = vi.fn(() => ({ width: 400 }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText,
    } as unknown as CanvasRenderingContext2D)

    const measure = createMeasure()
    expect(measure('Bobson Dugnutt', 10)).toBeCloseTo(40)
    expect(measure('Bobson Dugnutt', 20)).toBeCloseTo(80)
    expect(measureText).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
  })

  it('survives a canvas that throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no canvas')
    })

    const measure = createMeasure()
    expect(measure('Rey McSriff', 12)).toBeCloseTo(estimateWidth('Rey McSriff', 12))

    vi.restoreAllMocks()
  })
})
