import { describe, expect, it } from 'vitest'
import { fitReport } from './report'
import type { Measure } from './types'

const measure: Measure = (text, size) => text.length * 0.5 * size

describe('fitReport', () => {
  it('reports the label a wedge will actually draw', () => {
    const [row] = fitReport(
      [{ id: 'a', label: 'Sleve McDichael', weight: 1 }],
      undefined,
      200,
      measure,
    )
    expect(row).toMatchObject({ id: 'a', label: 'Sleve McDichael', degraded: false })
    expect(row.drawn).toBe('Sleve McDichael')
  })

  it('marks a wedge that had to shorten', () => {
    const rows = fitReport(
      [
        { id: 'a', label: 'Sleve McDichael', weight: 100 },
        { id: 'b', label: 'Todd Bonzalez', weight: 1.2 },
      ],
      undefined,
      200,
      measure,
    )
    expect(rows[1].degraded).toBe(true)
    expect(rows[1].drawn).not.toBe('Todd Bonzalez')
  })

  it('marks a wedge that draws nothing', () => {
    const [row] = fitReport(
      [
        { id: 'a', label: 'Raul Chamgerlain', weight: 0.00001 },
        { id: 'b', label: 'Kevin Nogilny', weight: 100 },
      ],
      undefined,
      200,
      measure,
    )
    expect(row).toMatchObject({ drawn: null, degraded: true })
  })

  it('honors a per-wedge override', () => {
    const [row] = fitReport(
      [{ id: 'a', label: 'Willie Dustice', weight: 1, slice: { id: 'radial', params: {} } }],
      { id: 'curved', params: {} },
      200,
      measure,
    )
    expect(row.drawn).toBe('Willie Dustice')
  })
})
