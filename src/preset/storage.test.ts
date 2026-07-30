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

describe('parsePreset guards values the wheel would choke on', () => {
  it('rejects a negative spin duration', () => {
    // Element.animate() throws synchronously on a negative duration.
    const raw = { ...DEFAULT_PRESET, spin: { ...DEFAULT_PRESET.spin, durationMs: -500 } }
    expect(parsePreset(JSON.stringify(raw)).spin.durationMs).toBe(
      DEFAULT_PRESET.spin.durationMs,
    )
  })

  it('rejects a zero spin duration', () => {
    const raw = { ...DEFAULT_PRESET, spin: { ...DEFAULT_PRESET.spin, durationMs: 0 } }
    expect(parsePreset(JSON.stringify(raw)).spin.durationMs).toBe(
      DEFAULT_PRESET.spin.durationMs,
    )
  })

  it('clamps negative fullSpins rather than spinning backwards', () => {
    const raw = { ...DEFAULT_PRESET, spin: { ...DEFAULT_PRESET.spin, fullSpins: -3 } }
    expect(parsePreset(JSON.stringify(raw)).spin.fullSpins).toBe(0)
  })

  it('drops a duplicate segment id, keeping the first', () => {
    // The wheel keys arcs by id, and spin/selection lookups resolve to the
    // first match — duplicates make the pointer and the winner disagree.
    const raw = {
      ...DEFAULT_PRESET,
      segments: [
        { id: 'ana', label: 'Ana', weight: 1 },
        { id: 'ana', label: 'Impostor', weight: 9 },
        { id: 'ben', label: 'Ben', weight: 1 },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.segments.map((segment) => segment.id)).toEqual(['ana', 'ben'])
    expect(parsed.segments[0].label).toBe('Ana')
  })
})
