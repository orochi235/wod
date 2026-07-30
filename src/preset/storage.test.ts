import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PRESET } from './defaults'
import { PRESET_KEY, loadPreset, parsePreset, savePreset } from './storage'

describe('parsePreset', () => {
  it('returns the default for null', () => {
    expect(parsePreset(null)).toEqual(DEFAULT_PRESET)
  })

  it('returns the default for malformed JSON', () => {
    expect(parsePreset('{not json')).toEqual(DEFAULT_PRESET)
  })

  it('returns the default for a wrong version', () => {
    expect(parsePreset(JSON.stringify({ version: 99 }))).toEqual(DEFAULT_PRESET)
  })

  it('round-trips a valid preset', () => {
    const parsed = parsePreset(JSON.stringify(DEFAULT_PRESET))
    expect(parsed).toEqual(DEFAULT_PRESET)
  })

  it('disables a trick naming an unknown recipe rather than throwing', () => {
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [{ id: 'x', name: 'x', recipe: 'nonsense', params: {}, enabled: true }],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(false)
  })

  it('disables a trick whose target segment is gone rather than throwing', () => {
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [
        { id: 'v', name: 'v', recipe: 'vanish', params: { targets: ['ghost'] }, enabled: true },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(false)
  })

  it('drops a segment with a non-finite weight to zero', () => {
    const raw = {
      ...DEFAULT_PRESET,
      segments: [{ id: 'a', label: 'A', weight: Number.NaN }],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.segments[0].weight).toBe(0)
  })
})

describe('loadPreset and savePreset', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns the default when storage is empty', () => {
    expect(loadPreset()).toEqual(DEFAULT_PRESET)
  })

  it('round-trips through localStorage', () => {
    const edited = { ...DEFAULT_PRESET, name: 'punishment' }
    savePreset(edited)
    expect(window.localStorage.getItem(PRESET_KEY)).toBeTruthy()
    expect(loadPreset()).toEqual(edited)
  })
})
