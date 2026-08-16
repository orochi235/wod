import { describe, expect, it } from 'vitest'
import { DEFAULT_PART, LEADING_RANGE, MAX_PARTS, readPartList, readParts } from './parts'

describe('readParts', () => {
  it('falls back to a one-part label composition when parts is not an array', () => {
    expect(readParts(undefined)).toEqual([DEFAULT_PART])
    expect(readParts({ from: 'label' })).toEqual([DEFAULT_PART])
  })

  it('keeps an authored empty list empty', () => {
    expect(readParts([])).toEqual([])
  })

  it('falls back when a list has entries but none are readable', () => {
    expect(readParts([{ orientation: 'spiral' }, 7])).toEqual([DEFAULT_PART])
  })

  it('keeps a well-formed part as written', () => {
    const part = {
      content: { from: 'text', value: 'BANKRUPT' },
      orientation: 'stacked',
      band: [0.45, 0.94],
      direction: 'hubOutward',
      fan: false,
      stretch: 'fill',
      shrink: 'condense',
      shape: 'outline',
      font: 'rye',
      maxSize: 40,
      frame: 'level',
    }
    expect(readParts([part])).toEqual([part])
  })

  it('drops a part whose orientation names nothing', () => {
    const good = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    const bad = { content: { from: 'label' }, orientation: 'spiral', band: [0.4, 0.9] }
    expect(readParts([good, bad])).toEqual([good])
  })

  it('drops a part whose content names nothing', () => {
    const good = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    const bad = { content: { from: 'barcode' }, orientation: 'stacked', band: [0.4, 0.9] }
    expect(readParts([good, bad])).toEqual([good])
  })

  it('clamps a band that runs outside the radius', () => {
    const parts = readParts([
      { content: { from: 'label' }, orientation: 'stacked', band: [-2, 40] },
    ])
    expect(parts[0].band).toEqual([0, 1])
  })

  it('swaps an inverted band rather than dropping it', () => {
    const parts = readParts([
      { content: { from: 'label' }, orientation: 'stacked', band: [0.9, 0.4] },
    ])
    expect(parts[0].band).toEqual([0.4, 0.9])
  })

  it('treats a missing or unreadable band as the default', () => {
    const parts = readParts([{ content: { from: 'label' }, orientation: 'stacked' }])
    expect(parts[0].band).toEqual(DEFAULT_PART.band)
  })

  it('drops optional fields it cannot read rather than keeping junk', () => {
    const [part] = readParts([
      {
        content: { from: 'label', transform: 'shouty' },
        orientation: 'stacked',
        band: [0.4, 0.9],
        direction: 'sideways',
        fan: 'yes',
        stretch: 'enormous',
        shrink: 'squished',
        shape: 'woodcut',
        maxSize: Number.NaN,
        frame: 'tilted',
      },
    ])
    expect(part).toEqual({
      content: { from: 'label' },
      orientation: 'stacked',
      band: [0.4, 0.9],
    })
  })

  it('keeps a numeric stretch', () => {
    const [part] = readParts([
      { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9], stretch: 1.6 },
    ])
    expect(part.stretch).toBe(1.6)
  })

  it('does not cap the list — the editor does', () => {
    const part = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    expect(readParts(Array.from({ length: MAX_PARTS + 2 }, () => part))).toHaveLength(MAX_PARTS + 2)
  })

  it('keeps a valid label transform', () => {
    const [part] = readParts([
      {
        content: { from: 'label', transform: 'initials' },
        orientation: 'stacked',
        band: [0.4, 0.9],
      },
    ])
    expect(part.content).toEqual({ from: 'label', transform: 'initials' })
  })

  it('keeps a media part', () => {
    const [part] = readParts([
      { content: { from: 'media' }, orientation: 'archedRim', band: [0.4, 0.9] },
    ])
    expect(part.content).toEqual({ from: 'media' })
  })

  it('keeps each derived value', () => {
    for (const value of ['weight', 'index', 'position']) {
      const [part] = readParts([
        { content: { from: 'derived', value }, orientation: 'stacked', band: [0.4, 0.9] },
      ])
      expect(part.content).toEqual({ from: 'derived', value })
    }
  })

  it('drops a part whose derived value names nothing', () => {
    const good = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    const bad = {
      content: { from: 'derived', value: 'hue' },
      orientation: 'stacked',
      band: [0.4, 0.9],
    }
    expect(readParts([good, bad])).toEqual([good])
  })

  it('drops a text part with no string to set', () => {
    const good = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }
    const bad = { content: { from: 'text' }, orientation: 'stacked', band: [0.4, 0.9] }
    expect(readParts([good, bad])).toEqual([good])
  })
})

describe('color, tracking and leading', () => {
  const base = { content: { from: 'label' }, orientation: 'stacked', band: [0.4, 0.9] }

  it('keeps a hex color in either length', () => {
    expect(readParts([{ ...base, color: '#f0a' }])[0].color).toBe('#f0a')
    expect(readParts([{ ...base, color: '#FF00AA' }])[0].color).toBe('#FF00AA')
  })

  it('drops a color that is not hex rather than painting it', () => {
    for (const color of ['red', 'rgb(1,2,3)', '#ff', '#gggggg', 12]) {
      expect(readParts([{ ...base, color }])[0].color).toBeUndefined()
    }
  })

  it('keeps the spacing pair when both are numbers', () => {
    const part = readParts([{ ...base, tracking: 0.3, leading: 1.6 }])[0]
    expect(part.tracking).toBe(0.3)
    expect(part.leading).toBe(1.6)
  })

  // Leading divides a band into a size, so a stored zero would hand every
  // fitted run an infinite one.
  it('lifts a leading of zero to the floor rather than dividing by it', () => {
    expect(readParts([{ ...base, leading: 0 }])[0].leading).toBe(LEADING_RANGE[0])
  })

  it('clamps a negative tracking to nothing', () => {
    expect(readParts([{ ...base, tracking: -2 }])[0].tracking).toBe(0)
  })

  it('leaves both absent when they are not numbers', () => {
    const part = readParts([{ ...base, tracking: 'wide', leading: null }])[0]
    expect(part.tracking).toBeUndefined()
    expect(part.leading).toBeUndefined()
  })
})

describe('readPartList', () => {
  it('returns nothing rather than falling back', () => {
    expect(readPartList([{ orientation: 'spiral' }])).toEqual([])
    expect(readPartList('BANKRUPT')).toEqual([])
  })
})
