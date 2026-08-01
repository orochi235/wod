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

  it('returns the default when the version is missing entirely', () => {
    expect(parsePreset(JSON.stringify({ name: 'x', segments: [] }))).toEqual(DEFAULT_PRESET)
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

  it('migrates a v1 preset to v2', () => {
    const v1 = {
      version: 1,
      name: 'standup',
      segments: [{ id: 'ana', label: 'Ana', weight: 1 }],
      tricks: [
        {
          id: 'v',
          name: 'vanish ana',
          recipe: 'vanish',
          params: { targets: ['ana'] },
          enabled: true,
        },
      ],
      spin: { durationMs: 4500, fullSpins: 6, easing: 'linear' },
    }
    const parsed = parsePreset(JSON.stringify(v1))
    expect(parsed.version).toBe(2)
    // The migration's most user-visible failure mode is a silently emptied
    // wheel, since readTricks depends on segments — pin both surviving intact.
    expect(parsed.segments).toEqual([{ id: 'ana', label: 'Ana', weight: 1 }])
    expect(parsed.tricks).toEqual([
      {
        id: 'v',
        name: 'vanish ana',
        recipe: 'vanish',
        params: { targets: ['ana'] },
        enabled: true,
      },
    ])
    expect(parsed.spin).toEqual({
      target: { kind: 'fair' },
      motion: { durationMs: 4500, turns: 6, direction: 'cw', easing: 'linear' },
    })
    expect(parsed.branches).toEqual([])
  })

  it('preserves v1 spin behavior exactly through migration', () => {
    const v1 = {
      version: 1,
      name: 'standup',
      segments: [{ id: 'ana', label: 'Ana', weight: 1 }],
      tricks: [],
      spin: { durationMs: 1234, fullSpins: 3, easing: 'ease-in' },
    }
    const parsed = parsePreset(JSON.stringify(v1))
    expect(parsed.spin.motion.durationMs).toBe(1234)
    expect(parsed.spin.motion.turns).toBe(3)
    expect(parsed.spin.motion.easing).toBe('ease-in')
    expect(parsed.spin.motion.direction).toBe('cw')
  })

  it('rejects a negative duration in a v2 preset', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'fair' }, motion: { ...DEFAULT_PRESET.spin.motion, durationMs: -1 } },
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.spin.motion.durationMs).toBe(DEFAULT_PRESET.spin.motion.durationMs)
  })

  it('falls back to clockwise for an unknown direction', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, direction: 'sideways' },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.direction).toBe('cw')
  })

  it('reads a forced target', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'forced', segmentId: 'ana' }, motion: DEFAULT_PRESET.spin.motion },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.target).toEqual({
      kind: 'forced',
      segmentId: 'ana',
    })
  })

  it('falls back to a fair target when the forced segment id is missing', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { target: { kind: 'forced' }, motion: DEFAULT_PRESET.spin.motion },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.target).toEqual({ kind: 'fair' })
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
    const raw = {
      ...DEFAULT_PRESET,
      spin: { ...DEFAULT_PRESET.spin, motion: { ...DEFAULT_PRESET.spin.motion, durationMs: -500 } },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.durationMs).toBe(
      DEFAULT_PRESET.spin.motion.durationMs,
    )
  })

  it('rejects a zero spin duration', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { ...DEFAULT_PRESET.spin, motion: { ...DEFAULT_PRESET.spin.motion, durationMs: 0 } },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.durationMs).toBe(
      DEFAULT_PRESET.spin.motion.durationMs,
    )
  })

  it('clamps negative turns rather than spinning backwards', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: { ...DEFAULT_PRESET.spin, motion: { ...DEFAULT_PRESET.spin.motion, turns: -3 } },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.turns).toBe(0)
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
