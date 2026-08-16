import { describe, expect, it } from 'vitest'
import { arcLength, budget, chord, createFit, levelRoom } from './fit'
import type { FitSpec, Measure } from './types'

/** Deterministic and linear, so a size assertion is arithmetic rather than a font. */
const measure: Measure = (text, size) => text.length * 0.5 * size

const base: Omit<FitSpec, 'text' | 'orientation'> = {
  frame: 'wheel',
  width: 0.125,
  radius: 200,
  anchor: 0.7,
  maxSize: 26,
  minSize: 9,
}

describe('chord and arcLength', () => {
  it('gives a half turn the full diameter as its chord', () => {
    expect(chord(0.5, 200)).toBeCloseTo(400)
  })

  it('caps the chord at half a turn rather than folding back', () => {
    expect(chord(0.9, 200)).toBeCloseTo(chord(0.5, 200))
  })

  it('gives a full turn the circumference as its arc', () => {
    expect(arcLength(1, 200)).toBeCloseTo(2 * Math.PI * 200)
  })
})

describe('budget', () => {
  it('gives radial a length that ignores arc width', () => {
    const narrow = budget({ ...base, orientation: 'radial', width: 0.01 })
    const wide = budget({ ...base, orientation: 'radial', width: 0.4 })
    expect(narrow.length).toBeCloseTo(wide.length)
  })

  it('grows the curved length with arc width', () => {
    const narrow = budget({ ...base, orientation: 'curved', width: 0.05 })
    const wide = budget({ ...base, orientation: 'curved', width: 0.25 })
    expect(wide.length).toBeGreaterThan(narrow.length * 4)
  })

  it('shrinks the radial natural size as the arc narrows', () => {
    const narrow = budget({ ...base, orientation: 'radial', width: 0.01 })
    const wide = budget({ ...base, orientation: 'radial', width: 0.25 })
    expect(narrow.natural).toBeLessThan(wide.natural)
  })
})

describe('levelRoom', () => {
  it('is bounded by the nearest wedge edge', () => {
    const narrow = levelRoom({ ...base, orientation: 'radial', width: 0.02 })
    const wide = levelRoom({ ...base, orientation: 'radial', width: 0.4 })
    expect(narrow).toBeLessThan(wide)
  })
})

describe('createFit', () => {
  const fit = createFit(measure)

  it('returns null for empty text', () => {
    expect(fit({ ...base, orientation: 'radial', text: '' })).toBeNull()
  })

  it('never exceeds the maximum size when there is room to spare', () => {
    const placed = fit({ ...base, orientation: 'curved', width: 0.5, text: 'Ana' })
    expect(placed?.size).toBeLessThanOrEqual(26)
  })

  it('shrinks to the length budget rather than overflowing', () => {
    const placed = fit({ ...base, orientation: 'radial', text: 'Priyanka Venkataraman' })
    expect(placed).not.toBeNull()
    expect(measure(placed?.text ?? '', placed?.size ?? 0)).toBeLessThanOrEqual(
      budget({ ...base, orientation: 'radial' }).length + 0.01,
    )
  })

  it('returns null when the arc cannot hold the text above the floor', () => {
    expect(
      fit({ ...base, orientation: 'radial', width: 0.0004, text: 'Glenallen Mixon' }),
    ).toBeNull()
  })

  it('holds a long name on a fat arc in curved that radial cannot', () => {
    const wide = { ...base, width: 0.45, text: 'Darryl Archideld' }
    const curved = fit({ ...wide, orientation: 'curved' })
    const radial = fit({ ...wide, orientation: 'radial' })
    expect(curved?.size ?? 0).toBeGreaterThan(radial?.size ?? 0)
  })

  it('fits level frame inside a disc that ignores orientation', () => {
    const spec = { ...base, frame: 'level' as const, text: 'Mike Truk' }
    const asRadial = fit({ ...spec, orientation: 'radial' })
    const asCurved = fit({ ...spec, orientation: 'curved' })
    expect(asRadial?.size).toBe(asCurved?.size)
  })
})

describe('tracking and leading', () => {
  const fit = createFit(measure)
  const spec = { ...base, orientation: 'tangential' as const, text: 'Ada Lovelace' }

  it('leaves a spec that names neither exactly where it was', () => {
    expect(fit({ ...spec, tracking: 0, leading: 1.2 })?.size).toBe(fit(spec)?.size)
  })

  // The bug this guards: tracking applied only at paint time widens a run past
  // the size the solve just proved would fit.
  it('solves a tracked run smaller than an untracked one', () => {
    const loose = fit({ ...spec, tracking: 0.2 })?.size ?? 0
    const tight = fit(spec)?.size ?? 0
    expect(loose).toBeGreaterThan(0)
    expect(loose).toBeLessThan(tight)
  })

  it('keeps a tracked run inside the length it was budgeted', () => {
    const tracking = 0.2
    const placed = fit({ ...spec, tracking })
    const size = placed?.size ?? 0
    const painted = measure(spec.text, size) + tracking * size * spec.text.length
    expect(painted).toBeLessThanOrEqual(budget(spec).length + 0.01)
  })

  it('takes the natural size down as leading opens up', () => {
    expect(budget({ ...spec, leading: 2.4 }).natural).toBeLessThan(budget(spec).natural)
  })

  it('lets leading bind a level fit, which has no length of its own', () => {
    const level = { ...spec, frame: 'level' as const }
    expect(fit({ ...level, leading: 3 })?.size ?? 0).toBeLessThan(fit(level)?.size ?? 0)
  })
})
