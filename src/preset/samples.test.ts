import { LOOK_NAMES } from 'klieg'
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

  it('sets the money faces by one shared layout and the word faces by their own', () => {
    // The money faces differ only by the label they carry, so they read the
    // board's default; a shared default is wrong only for the two that spell a
    // word, and those are the two that override it.
    expect(preset.slice?.id).toBe('cash')
    for (const segment of preset.segments) {
      const carriesWord = segment.label === 'BANKRUPT' || segment.label === 'LOSE A TURN'
      expect(segment.slice === undefined).toBe(!carriesWord)
    }
  })

  it('announces every face but bankruptcy in gold and gem, alternating', () => {
    // Cycled rather than assigned, as the colors are: no face means its metal.
    const solvent = preset.segments.filter((segment) => segment.label !== 'BANKRUPT')
    expect(solvent.map((segment) => segment.look)).toEqual(
      solvent.map((_, index) => (index % 2 === 0 ? 'gold' : 'gem')),
    )
  })

  it('announces bankruptcy in oil', () => {
    const bankrupt = preset.segments.filter((segment) => segment.label === 'BANKRUPT')
    for (const segment of bankrupt) expect(segment.look).toBe('oil')
  })

  it('names a material the library carries on every face', () => {
    for (const segment of preset.segments) expect(LOOK_NAMES).toContain(segment.look)
  })

  it('stands alone, with no roster behind it', () => {
    // A cash wheel that quietly grew names from a feed would be neither.
    expect(preset.feeds).toEqual([])
    expect(preset.tricks).toEqual([])
  })
})

describe('the material specimen', () => {
  const preset = (getSample('materials') as { preset: ReturnType<typeof parsePreset> }).preset

  it('carries one face per material the library ships', () => {
    // Derived from LOOK_NAMES rather than listed, so a klieg that adds a
    // material adds a wedge and one that drops it cannot leave a dead face.
    expect(preset.segments.map((segment) => segment.look)).toEqual([...LOOK_NAMES])
  })

  it('letters each face with the material it announces in', () => {
    for (const segment of preset.segments) {
      expect(segment.label).toBe(segment.look?.toUpperCase())
    }
  })

  it('stands on a theme that does not tint', () => {
    // `wof` and the board built on it set `tint: 'wedge'`, which recolors the
    // banner with the landed wedge's own color — twelve materials in one hue,
    // and the specimen shows nothing.
    expect(getTheme(preset.theme ?? '')?.tint).toBeUndefined()
  })

  it('is all spinnable, and colors every face', () => {
    for (const segment of preset.segments) {
      expect(segment.weight).toBe(1)
      expect(segment.color).toBeDefined()
    }
  })

  it('stands alone, with no roster behind it', () => {
    expect(preset.feeds).toEqual([])
    expect(preset.tricks).toEqual([])
  })
})
