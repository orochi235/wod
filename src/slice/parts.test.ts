import { describe, expect, it } from 'vitest'
import { DEFAULT_PART, MAX_PARTS, readPartList, readParts } from './parts'

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
})

describe('readPartList', () => {
  it('returns nothing rather than falling back', () => {
    expect(readPartList([{ orientation: 'spiral' }])).toEqual([])
    expect(readPartList('BANKRUPT')).toEqual([])
  })
})
