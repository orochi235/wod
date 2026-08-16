import { describe, expect, it } from 'vitest'
import { getSlice } from '../slice/registry'
import { wantsInverseInk } from '../wheel/ink'
import { getTheme } from '../wheel/themes/registry'
import { SAMPLES, getSample } from './samples'
import { parsePreset } from './storage'

describe('samples', () => {
  it('offers each one under an id of its own', () => {
    const ids = SAMPLES.map((sample) => sample.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const sample of SAMPLES) expect(getSample(sample.id)).toBe(sample)
  })

  it('answers nothing for an id no build carries', () => {
    // Comes off a select, but a stale one: the id outlives the option.
    expect(getSample('constructor')).toBeNull()
    expect(getSample('')).toBeNull()
  })

  it.each(SAMPLES)('survives the parser it is loaded through ($id)', (sample) => {
    // Loading runs the sample through parsePreset, which drops anything it does
    // not recognise. A typo in a slice param would otherwise vanish in silence.
    const parsed = parsePreset(JSON.stringify(sample.preset))
    expect(parsed).toEqual(sample.preset)
  })

  it.each(SAMPLES)('names a layout and a look this build has ($id)', (sample) => {
    const { slice, theme, segments } = sample.preset
    if (slice) expect(getSlice(slice.id)).not.toBeNull()
    if (theme) expect(getTheme(theme)).not.toBeNull()
    // A per-face layout too: an id no build carries falls back in silence.
    for (const segment of segments) {
      if (segment.slice) expect(getSlice(segment.slice.id)).not.toBeNull()
    }
  })
})

describe('the cash wheel', () => {
  const preset = (getSample('cash-wheel') as { preset: ReturnType<typeof parsePreset> }).preset

  it('is 24 faces, all spinnable', () => {
    expect(preset.segments).toHaveLength(24)
    for (const segment of preset.segments) expect(segment.weight).toBe(1)
  })

  it('carries the two faces that cost you', () => {
    const labels = preset.segments.map((segment) => segment.label)
    expect(labels.filter((label) => label === 'BANKRUPT')).toHaveLength(2)
    expect(labels.filter((label) => label === 'LOSE A TURN')).toHaveLength(1)
  })

  it('colors every face, and letters the black one in the inverse', () => {
    for (const segment of preset.segments) expect(segment.color).toBeDefined()
    const bankrupt = preset.segments.filter((segment) => segment.label === 'BANKRUPT')
    for (const segment of bankrupt) expect(wantsInverseInk(segment.color)).toBe(true)
  })

  it('sets every face by a layout of its own', () => {
    // The board names no default. A shared one that suited the cash faces
    // printed a lone currency mark on the two that carry a word instead.
    expect(preset.slice).toBeUndefined()
    for (const segment of preset.segments) expect(segment.slice).toBeDefined()
  })

  it('stands alone, with no roster behind it', () => {
    // A cash wheel that quietly grew names from a feed would be neither.
    expect(preset.feeds).toEqual([])
    expect(preset.tricks).toEqual([])
  })
})
