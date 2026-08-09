import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PRESET } from './defaults'
import { PRESET_KEY, loadPreset, parsePreset, savePreset } from './storage'

describe('parsePreset', () => {
  it('returns the default for null', () => {
    expect(parsePreset(null)).toBe(DEFAULT_PRESET)
  })

  it('returns the default for malformed JSON', () => {
    expect(parsePreset('{not json')).toBe(DEFAULT_PRESET)
  })

  it('returns the default for a wrong version', () => {
    expect(parsePreset(JSON.stringify({ version: 99 }))).toBe(DEFAULT_PRESET)
  })

  it('returns the default when the version is missing entirely', () => {
    expect(parsePreset(JSON.stringify({ name: 'x', segments: [] }))).toBe(DEFAULT_PRESET)
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

  it('keeps a trick aimed at a roster wedge enabled', () => {
    // The wedge does not exist at parse time and cannot: items arrive on the
    // bus later. Disabling the trick for that made the editor and the show
    // window disagree about a trick the operator could watch working.
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [
        { id: 'v', name: 'v', recipe: 'vanish', params: { targets: ['sim:fay'] }, enabled: true },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(true)
  })

  it('disables a trick aimed at a namespace no configured feed owns', () => {
    // The rule is the feed's namespace, not "contains a colon" — an id from a
    // feed someone deleted is as stale as a deleted segment.
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [
        { id: 'v', name: 'v', recipe: 'vanish', params: { targets: ['gone:fay'] }, enabled: true },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(false)
  })

  it('keeps a trick aimed at another trick’s wedge enabled', () => {
    // beer:wedge is contributed by the takeover trick in the same preset, so
    // it is knowable here even though no parser ever sees it on the wheel.
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [
        ...DEFAULT_PRESET.tricks,
        {
          id: 'v',
          name: 'v',
          recipe: 'vanish',
          params: { targets: ['beer:wedge'] },
          enabled: true,
        },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[1].enabled).toBe(true)
  })

  it('keeps a trick aimed at a wedge provided by a later trick enabled', () => {
    // Declaration order is the operator's business, not a validity rule.
    const raw = {
      ...DEFAULT_PRESET,
      tricks: [
        {
          id: 'v',
          name: 'v',
          recipe: 'vanish',
          params: { targets: ['beer:wedge'] },
          enabled: true,
        },
        ...DEFAULT_PRESET.tricks,
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.tricks[0].enabled).toBe(true)
  })

  it('drops a segment with a non-finite weight to zero', () => {
    const raw = {
      ...DEFAULT_PRESET,
      segments: [{ id: 'a', label: 'A', weight: Number.NaN }],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.segments[0].weight).toBe(0)
  })

  it('migrates a v1 preset to v3', () => {
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
    expect(parsed.version).toBe(3)
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
      motion: { durationMs: 4500, turns: 6, direction: 'cw', easing: [0, 0, 1, 1] },
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
    expect(parsed.spin.motion.easing).toEqual([0.42, 0, 1, 1])
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

  it('reads a branch tree', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'escape',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          do: { kind: 'modify', modifier: { enableTricks: ['beer'] } },
        },
      ],
    }
    expect(parsePreset(JSON.stringify(raw)).branches).toEqual(raw.branches)
  })

  it('reads nested branch children', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'outer',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
          then: [{ id: 'inner', when: { kind: 'landsOn', segmentIds: ['ben'] } }],
        },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches[0].then?.[0].id).toBe('inner')
  })

  it('drops a branch node with no usable condition', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        { id: 'bad', when: { kind: 'whenever' } },
        { id: 'good', when: { kind: 'landsOn', segmentIds: ['ana'] } },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches.map((n) => n.id)).toEqual(['good'])
  })

  it('drops a branch node whose segmentIds filters down to empty', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        { id: 'literal-empty', when: { kind: 'landsOn', segmentIds: [] } },
        { id: 'all-non-string', when: { kind: 'landsOn', segmentIds: [1, null] } },
        { id: 'good', when: { kind: 'landsOn', segmentIds: ['ana'] } },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches.map((n) => n.id)).toEqual(['good'])
  })

  it('truncates a then chain nested past the depth cap without throwing', () => {
    let deep: unknown = { id: 'leaf', when: { kind: 'landsOn', segmentIds: ['ana'] } }
    for (let i = 0; i < 5000; i++) {
      deep = {
        id: `n${i}`,
        when: { kind: 'landsOn', segmentIds: ['ana'] },
        // biome-ignore lint/suspicious/noThenProperty: `then` is BranchNode's routing field, not a thenable.
        then: [deep],
      }
    }
    const raw = { ...DEFAULT_PRESET, branches: [deep] }
    let parsed: ReturnType<typeof parsePreset> | undefined
    expect(() => {
      parsed = parsePreset(JSON.stringify(raw))
    }).not.toThrow()

    let depth = 0
    let node = parsed?.branches[0]
    while (node) {
      depth++
      node = node.then?.[0]
    }
    expect(depth).toBe(64)
  })

  it('drops a branch node with a non-string id', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [{ id: 7, when: { kind: 'landsOn', segmentIds: ['ana'] } }],
    }
    expect(parsePreset(JSON.stringify(raw)).branches).toEqual([])
  })

  it('drops an unusable action but keeps the node', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        { id: 'n', when: { kind: 'landsOn', segmentIds: ['ana'] }, do: { kind: 'detonate' } },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches).toHaveLength(1)
    expect(parsed.branches[0].do).toBeUndefined()
  })

  it('reads branches as empty when absent', () => {
    const { branches, ...withoutBranches } = DEFAULT_PRESET
    expect(parsePreset(JSON.stringify(withoutBranches)).branches).toEqual([])
  })

  it('keeps a legal inert node — a matchable condition with neither do nor then', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [{ id: 'idle', when: { kind: 'landsOn', segmentIds: ['ana'] } }],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.branches).toEqual([
      { id: 'idle', when: { kind: 'landsOn', segmentIds: ['ana'] } },
    ])
    expect(parsed.branches[0].do).toBeUndefined()
    expect(parsed.branches[0].then).toBeUndefined()
  })

  it('reads the array form its own export writes', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, easing: [0.2, 0.9, 0.3, 1] },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.easing).toEqual([0.2, 0.9, 0.3, 1])
  })

  it('falls back to the default curve for an easing it cannot read', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, easing: 'steps(4)' },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.easing).toEqual(
      DEFAULT_PRESET.spin.motion.easing,
    )
  })

  it('reads a settle', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: {
          ...DEFAULT_PRESET.spin.motion,
          settle: { ms: 800, curve: 'ease-out' },
        },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle).toEqual({
      ms: 800,
      curve: [0, 0, 0.58, 1],
    })
  })

  it('clamps a settle longer than half the spin', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: {
          durationMs: 4000,
          turns: 6,
          direction: 'cw',
          easing: 'linear',
          settle: { ms: 9000 },
        },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle?.ms).toBe(2000)
  })

  it('clamps a settle against the recovered duration, not a garbage one', () => {
    // durationMs: -1 is invalid and recovers to the default preset's duration
    // before readSettle ever sees it. A regression that clamped against the
    // raw -1 instead would produce a settle of 0, not half the default.
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, durationMs: -1, settle: { ms: 100000 } },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle?.ms).toBe(
      DEFAULT_PRESET.spin.motion.durationMs / 2,
    )
  })

  it('keeps a zero settle, which is not the same as having none', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, settle: { ms: 0 } },
      },
    }
    const parsed = parsePreset(JSON.stringify(raw))
    expect(parsed.spin.motion.settle?.ms).toBe(0)
    expect(parsed.spin.motion.settle?.curve).toEqual([0.33, 1, 0.68, 1])
  })

  it('drops a settle with no usable length', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: { ...DEFAULT_PRESET.spin.motion, settle: { curve: 'ease-out' } },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle).toBeUndefined()
  })

  it('replaces a settle curve with no handover speed', () => {
    const raw = {
      ...DEFAULT_PRESET,
      spin: {
        target: { kind: 'fair' },
        motion: {
          ...DEFAULT_PRESET.spin.motion,
          // Flat at the start: the solve would ask the settle to cover
          // infinite ground.
          settle: { ms: 500, curve: [0.5, 0, 0.68, 1] },
        },
      },
    }
    expect(parsePreset(JSON.stringify(raw)).spin.motion.settle?.curve).toEqual([0.33, 1, 0.68, 1])
  })

  it('reads a settle out of a branch modifier', () => {
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'stall',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          do: { kind: 'modify', modifier: { motion: { settle: { ms: 400, curve: 'ease-out' } } } },
        },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    const action = parsed.branches[0].do
    expect(action?.kind).toBe('modify')
    expect(action?.kind === 'modify' ? action.modifier.motion?.settle : null).toEqual({
      ms: 400,
      curve: [0, 0, 0.58, 1],
    })
  })

  it('leaves a branch modifier settle unclamped, unlike readMotion', () => {
    // A modifier carries no duration to clamp against, and rotationTrack
    // clamps at spin time regardless — so a settle far longer than any
    // reasonable spin must survive parsing untouched.
    const raw = {
      ...DEFAULT_PRESET,
      branches: [
        {
          id: 'stall',
          when: { kind: 'landsOn', segmentIds: ['ana'] },
          do: { kind: 'modify', modifier: { motion: { settle: { ms: 50000 } } } },
        },
      ],
    }
    const parsed = parsePreset(JSON.stringify(raw))
    const action = parsed.branches[0].do
    expect(action?.kind === 'modify' ? action.modifier.motion?.settle?.ms : null).toBe(50000)
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

  it('drops a segment claiming a selector id', () => {
    // Id generation never emits '@', but imported JSON is hand-editable. Such a
    // wedge would be permanently unaddressable: a trick naming it would expand
    // to the token's whole set instead of reaching it.
    const raw = {
      ...DEFAULT_PRESET,
      segments: [
        { id: '@all', label: 'Impostor', weight: 1 },
        { id: 'ana', label: 'Ana', weight: 1 },
      ],
    }
    expect(parsePreset(JSON.stringify(raw)).segments.map((segment) => segment.id)).toEqual(['ana'])
  })
})

describe('v3 feeds and overrides', () => {
  /** Parses one feed, so a clamp test states only the field it is about. */
  const feedFrom = (feed: Record<string, unknown>) =>
    parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        feeds: [{ kind: 'simulated', id: 'sim', ...feed }],
      }),
    ).feeds[0]

  it('migrates a v2 preset by adding empty feeds and overrides', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 2, name: 'old', segments: [], tricks: [], branches: [] }),
    )
    expect(preset.version).toBe(3)
    expect(preset.feeds).toEqual([])
    expect(preset.overrides).toEqual({})
  })

  it('reads a simulated feed', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'standup',
        segments: [],
        tricks: [],
        branches: [],
        feeds: [
          {
            kind: 'simulated',
            id: 'sim',
            defaults: { weight: 2, color: '#123456' },
            insertAfter: 'seg1',
            pool: ['Ana', 'Ben', 7],
            autochurn: { intervalMs: 500, targetSize: 3, volatility: 0.8 },
          },
        ],
      }),
    )
    expect(preset.feeds).toEqual([
      {
        kind: 'simulated',
        id: 'sim',
        defaults: { weight: 2, color: '#123456' },
        insertAfter: 'seg1',
        pool: ['Ana', 'Ben'],
        autochurn: { intervalMs: 500, targetSize: 3, volatility: 0.8 },
      },
    ])
  })

  it('defaults a malformed feed rather than dropping the preset', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        feeds: [
          { kind: 'simulated', id: 'sim' },
          { kind: 'simulated', id: 'sim' },
          { kind: 'nonsense', id: 'x' },
          'garbage',
        ],
      }),
    )
    expect(preset.feeds).toHaveLength(1)
    expect(preset.feeds[0].defaults.weight).toBe(1)
    expect(preset.feeds[0].pool).toEqual([])
    expect(preset.feeds[0].autochurn).toEqual({
      intervalMs: 2000,
      targetSize: 6,
      volatility: 0.3,
    })
  })

  it('floors a churn interval that would peg the tab', () => {
    // The simulator hands this to setInterval, where 0.5ms becomes a 4ms timer
    // republishing the roster ~250 times a second.
    expect(feedFrom({ autochurn: { intervalMs: 0.5 } }).autochurn.intervalMs).toBe(250)
  })

  it('rounds a fractional target size', () => {
    // A roster can never equal 2.5, so churn would add and remove forever.
    expect(feedFrom({ autochurn: { targetSize: 2.5 } }).autochurn.targetSize).toBe(3)
    expect(feedFrom({ autochurn: { targetSize: -4 } }).autochurn.targetSize).toBe(0)
  })

  it('clamps volatility into 0..1', () => {
    expect(feedFrom({ autochurn: { volatility: 7 } }).autochurn.volatility).toBe(1)
    expect(feedFrom({ autochurn: { volatility: -1 } }).autochurn.volatility).toBe(0)
    expect(feedFrom({ autochurn: { volatility: 'churny' } }).autochurn.volatility).toBe(0.3)
  })

  it('keeps usable override fields and drops the rest', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        overrides: {
          ana: { excluded: true, label: 'ANA', weight: -3, color: '#ff0000' },
          ben: { weight: 'lots' },
          cal: 'garbage',
        },
      }),
    )
    expect(preset.overrides.ana).toEqual({
      excluded: true,
      label: 'ANA',
      weight: 0,
      color: '#ff0000',
    })
    expect(preset.overrides).not.toHaveProperty('ben')
    expect(preset.overrides).not.toHaveProperty('cal')
  })

  it('round-trips an override for an item that is not present', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'n',
        segments: [],
        tricks: [],
        branches: [],
        overrides: { absent: { color: '#00ff00' } },
      }),
    )
    expect(parsePreset(JSON.stringify(preset)).overrides.absent).toEqual({ color: '#00ff00' })
  })
})

describe('v3 prototype-shaped keys', () => {
  // Written as raw JSON: an object literal with a `__proto__` key would set the
  // prototype here instead of producing the key a hand-edited file contains.
  const withProtoKeys = `{
    "version": 3, "name": "n", "segments": [], "tricks": [], "branches": [],
    "feeds": [{ "kind": "simulated", "id": "__proto__" }],
    "overrides": { "__proto__": { "excluded": true }, "constructor": { "label": "C" } }
  }`

  it('drops a feed whose id could never key its published items', () => {
    expect(parsePreset(withProtoKeys).feeds).toEqual([])
  })

  it('drops a `__proto__` override instead of replacing the record prototype', () => {
    const { overrides } = parsePreset(withProtoKeys)
    expect(Object.getPrototypeOf(overrides)).toBe(Object.prototype)
    expect(Object.hasOwn(overrides, '__proto__')).toBe(false)
    // Every other prototype-shaped key stores and reads back fine, because the
    // one lookup that matters (composeBase) already uses Object.hasOwn.
    expect(overrides.constructor).toEqual({ label: 'C' })
  })
})
