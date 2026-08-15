import { describe, expect, it } from 'vitest'
import { createFit } from './fit'
import { LADDERS, LADDER_OPTIONS, applyTransform, ellipsize, walkLadder } from './ladder'
import type { FitSpec, Measure } from './types'

const measure: Measure = (text, size) => text.length * 0.5 * size
const fit = createFit(measure)

const base: Omit<FitSpec, 'text' | 'orientation'> = {
  frame: 'wheel',
  width: 0.125,
  radius: 200,
  anchor: 0.7,
  maxSize: 26,
  minSize: 9,
}

describe('applyTransform', () => {
  it('keeps the whole label for full', () => {
    expect(applyTransform('full', 'Sleve McDichael')).toBe('Sleve McDichael')
  })

  it('takes the first word for firstName', () => {
    expect(applyTransform('firstName', 'Sleve McDichael')).toBe('Sleve')
  })

  it('takes one letter per word for initials', () => {
    expect(applyTransform('initials', 'Bobson Dugnutt')).toBe('BD')
  })

  it('leaves a single-word label alone under firstName', () => {
    expect(applyTransform('firstName', 'Dave')).toBe('Dave')
  })
})

describe('ellipsize', () => {
  it('returns the text untouched when it already fits', () => {
    expect(ellipsize('Ana', 100, 10, measure)).toBe('Ana')
  })

  it('trims to the longest prefix that fits, with an ellipsis', () => {
    const trimmed = ellipsize('Anatoli Smorin', 30, 10, measure)
    expect(trimmed.endsWith('…')).toBe(true)
    expect(measure(trimmed, 10)).toBeLessThanOrEqual(30)
  })

  it('returns a bare ellipsis when nothing else fits', () => {
    expect(ellipsize('Anatoli Smorin', 6, 10, measure)).toBe('…')
  })
})

describe('walkLadder', () => {
  it('takes the first rung that fits', () => {
    const resolved = walkLadder(
      'Ana',
      LADDERS.shrinkNameInitials,
      { ...base, width: 0.4 },
      fit,
      measure,
    )
    expect(resolved?.orientation).toBe('curved')
    expect(resolved?.content).toBe('full')
  })

  it('falls past the full-name rungs on a sliver', () => {
    // Radial's length budget ignores arc width, so a full name survives a
    // narrower arc than it looks like it should. Initials only win once the
    // chord is too short to give radial a legible size at all.
    const resolved = walkLadder(
      'Glenallen Mixon',
      LADDERS.shrinkNameInitials,
      { ...base, width: 0.012 },
      fit,
      measure,
    )
    expect(resolved?.content).toBe('initials')
  })

  it('returns null only when every rung fails', () => {
    const resolved = walkLadder(
      'Glenallen Mixon',
      LADDERS.shrinkNameInitials,
      { ...base, width: 0.00001 },
      fit,
      measure,
    )
    expect(resolved).toBeNull()
  })

  it('never shrinks below the floor under shrinkOnly', () => {
    const resolved = walkLadder(
      'Todd Bonzalez',
      LADDERS.shrinkOnly,
      { ...base, width: 0.004 },
      fit,
      measure,
    )
    expect(resolved).toBeNull()
  })

  it('offers every ladder as a select option', () => {
    expect(LADDER_OPTIONS.map((option) => option.value).sort()).toEqual(Object.keys(LADDERS).sort())
  })
})
