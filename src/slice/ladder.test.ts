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
  it('keeps only the digits of a figure', () => {
    expect(applyTransform('digits', '$650')).toBe('650')
    expect(applyTransform('digits', '$1,000')).toBe('1000')
  })

  it('leaves nothing of a label with no figure in it', () => {
    // Drawn as nothing rather than as the word: a part asking for the figure on
    // a face that carries a word has no figure to set.
    expect(applyTransform('digits', 'BANKRUPT')).toBe('')
  })

  it('keeps the whole label for full', () => {
    expect(applyTransform('full', 'Sleve McDichael')).toBe('Sleve McDichael')
  })

  it('takes the first word for firstName', () => {
    expect(applyTransform('firstName', 'Sleve McDichael')).toBe('Sleve')
  })

  it('takes the last word for lastName', () => {
    expect(applyTransform('lastName', 'Sleve McDichael')).toBe('McDichael')
    expect(applyTransform('lastName', 'Mario Van Peebles')).toBe('Peebles')
  })

  it('gives lastName nothing to set when a label is one word', () => {
    // Paired with firstName across two parts, a one-word label would otherwise
    // be drawn twice on the same wedge.
    expect(applyTransform('lastName', 'Dave')).toBe('')
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

  it('falls past the full-name rungs before it gives up', () => {
    // Scanned rather than pinned to one width: which arc first defeats a full
    // name depends on every fill constant, and a fixture tuned to the exact
    // crossing is a test that breaks on any retune without a bug behind it.
    const contents = []
    for (let width = 0.3; width > 0.0005; width *= 0.92) {
      contents.push(
        walkLadder('Glenallen Mixon', LADDERS.shrinkNameInitials, { ...base, width }, fit, measure)
          ?.content ?? null,
      )
    }

    const firstShortened = contents.findIndex((content) => content !== 'full' && content !== null)
    const firstNothing = contents.indexOf(null)
    expect(contents[0]).toBe('full')
    expect(firstShortened).toBeGreaterThan(0)
    expect(firstNothing).toBeGreaterThan(firstShortened)
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
