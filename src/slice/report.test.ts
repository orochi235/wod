import { describe, expect, it } from 'vitest'
import { fitReport } from './report'
import type { Measure, SliceInstance } from './types'

const measure: Measure = (text, size) => text.length * 0.5 * size

/** Dropping a word rather than overflowing is `auto`'s, not the built-in default's. */
const AUTO: SliceInstance = { id: 'auto', params: {} }

describe('fitReport', () => {
  it('reports the label a wedge will actually draw', () => {
    const [row] = fitReport(
      [{ id: 'a', label: 'Sleve McDichael', weight: 1 }],
      undefined,
      200,
      measure,
    )
    expect(row).toMatchObject({ id: 'a', label: 'Sleve McDichael', degraded: false })
    // The default splits a name across two parts and capitalises the surname;
    // every letter is still drawn, so the row is not degraded.
    expect(row.drawn).toBe('Sleve MCDICHAEL')
  })

  it('marks a wedge that had to shorten', () => {
    // Scanned, not pinned: the weight that first defeats a full name moves with
    // every fill constant, and only the shortened-before-nothing order is a rule.
    // `auto` by name: shortening is its ladder's, and it is no longer the default.
    const shortened = []
    for (let weight = 8; weight > 0.05; weight *= 0.9) {
      const [, row] = fitReport(
        [
          { id: 'a', label: 'Sleve McDichael', weight: 100 },
          { id: 'b', label: 'Todd Bonzalez', weight },
        ],
        AUTO,
        200,
        measure,
      )
      shortened.push(row.drawn)
    }

    expect(shortened[0]).toBe('Todd Bonzalez')
    const first = shortened.findIndex((drawn) => drawn !== 'Todd Bonzalez' && drawn !== null)
    expect(first).toBeGreaterThan(0)
    expect(shortened.indexOf(null)).toBeGreaterThan(first)
  })

  it('marks a wedge that draws nothing', () => {
    const [row] = fitReport(
      [
        { id: 'a', label: 'Raul Chamgerlain', weight: 0.00001 },
        { id: 'b', label: 'Kevin Nogilny', weight: 100 },
      ],
      AUTO,
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

  it('reads what a glyph run spells and the size it starts at', () => {
    const rows = fitReport(
      [{ id: 'a', label: 'RYE', weight: 1, slice: { id: 'composed', params: {} } }],
      undefined,
      200,
      (text, size) => text.length * 0.5 * size,
    )
    expect(rows[0].drawn).toBe('RYE')
    expect(rows[0].size).toBeGreaterThan(0)
    expect(rows[0].degraded).toBe(false)
  })
})
