import { beforeEach, describe, expect, it } from 'vitest'
import type { SimulatedFeedConfig } from '../feed/types'
import { MIN_POLL_INTERVAL_MS } from '../meet/poll'
import { readParts } from '../slice/parts'
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

  it('migrates a v1 preset to v5', () => {
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
    expect(parsed.version).toBe(5)
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
    // Deep enough to clear the cap, shallow enough that the JSON round-trip
    // below stays inside the worker's stack — V8 parses recursively.
    for (let i = 0; i < 200; i++) {
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
    ).feeds[0] as SimulatedFeedConfig

  it('migrates a v2 preset by adding empty feeds and overrides', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 2, name: 'old', segments: [], tricks: [], branches: [] }),
    )
    expect(preset.version).toBe(5)
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

  it('reads a meet feed', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 4,
        feeds: [
          {
            kind: 'meet',
            id: 'meet',
            defaults: { weight: 2 },
            conference: 'abc',
            intervalMs: 8000,
          },
        ],
      }),
    )
    expect(preset.feeds).toEqual([
      { kind: 'meet', id: 'meet', defaults: { weight: 2 }, conference: 'abc', intervalMs: 8000 },
    ])
  })

  it('floors a meet feed interval', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 4,
        feeds: [{ kind: 'meet', id: 'meet', conference: '', intervalMs: 100 }],
      }),
    )
    expect(preset.feeds[0]).toMatchObject({ intervalMs: MIN_POLL_INTERVAL_MS })
  })

  it('defaults a missing conference to the sole one in progress', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 4, feeds: [{ kind: 'meet', id: 'meet' }] }),
    )
    expect(preset.feeds[0]).toMatchObject({ conference: '', intervalMs: 5000 })
  })

  it('still drops a kind it does not know', () => {
    const preset = parsePreset(JSON.stringify({ version: 4, feeds: [{ kind: 'zoom', id: 'z' }] }))
    expect(preset.feeds).toEqual([])
  })

  it('keeps both feeds when a preset has one of each', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 4,
        feeds: [
          { kind: 'simulated', id: 'sim', pool: ['Fay'] },
          { kind: 'meet', id: 'meet' },
        ],
      }),
    )
    expect(preset.feeds.map((feed) => feed.kind)).toEqual(['simulated', 'meet'])
  })

  it('drops a meet feed whose id could never key its published items', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 4, feeds: [{ kind: 'meet', id: '__proto__' }] }),
    )
    expect(preset.feeds).toEqual([])
  })

  it('keeps the first feed when a meet feed reuses an id already taken', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 4,
        feeds: [
          { kind: 'simulated', id: 'dup', pool: [] },
          { kind: 'meet', id: 'dup' },
        ],
      }),
    )
    expect(preset.feeds).toHaveLength(1)
    expect(preset.feeds[0].kind).toBe('simulated')
  })

  it('falls back to the default interval for a negative meet interval', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 4, feeds: [{ kind: 'meet', id: 'meet', intervalMs: -500 }] }),
    )
    expect(preset.feeds[0]).toMatchObject({ intervalMs: 5000 })
  })

  it('falls back to the default interval for a non-numeric meet interval', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 4, feeds: [{ kind: 'meet', id: 'meet', intervalMs: 'soon' }] }),
    )
    expect(preset.feeds[0]).toMatchObject({ intervalMs: 5000 })
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
    const feed = preset.feeds[0] as SimulatedFeedConfig
    expect(feed.defaults.weight).toBe(1)
    expect(feed.pool).toEqual([])
    expect(feed.autochurn).toEqual({
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

describe('reveal and media', () => {
  const parseSegments = (segments: unknown) =>
    parsePreset(JSON.stringify({ version: 3, name: 'p', segments })).segments

  it('round-trips a full reveal', () => {
    const reveal = {
      headline: 'Free beer',
      body: 'on the house',
      media: { kind: 'gif', value: 'https://example.test/x.gif' },
      sound: 'airhorn',
      effect: 'confetti',
      holdMs: 2000,
    }
    const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, reveal }])
    expect(segment.reveal).toEqual(reveal)
  })

  it('keeps an empty reveal, which means an overlay showing the label', () => {
    const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, reveal: {} }])
    expect(segment.reveal).toEqual({})
  })

  it('drops a reveal that is not an object', () => {
    const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, reveal: 'yes' }])
    expect(segment.reveal).toBeUndefined()
  })

  it('reads segment media', () => {
    const [segment] = parseSegments([
      { id: 'a', label: 'A', weight: 1, media: { kind: 'emoji', value: '🍺' } },
    ])
    expect(segment.media).toEqual({ kind: 'emoji', value: '🍺' })
  })

  it.each([{ kind: 'video', value: 'x' }, { kind: 'emoji' }, { kind: 'emoji', value: 7 }, 'emoji'])(
    'drops malformed media %p without losing the segment',
    (media) => {
      const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, media }])
      expect(segment).toMatchObject({ id: 'a', label: 'A' })
      expect(segment.media).toBeUndefined()
    },
  )

  it('reads the material a wedge names', () => {
    const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, look: 'oil' }])
    expect(segment.look).toBe('oil')
  })

  it.each([7, '', null, { name: 'oil' }])(
    'drops a look of %p without losing the segment',
    (look) => {
      const [segment] = parseSegments([{ id: 'a', label: 'A', weight: 1, look }])
      expect(segment).toMatchObject({ id: 'a', label: 'A' })
      expect(segment.look).toBeUndefined()
    },
  )

  it.each([0, -5, 'soon', Number.NaN])('drops a holdMs of %p', (holdMs) => {
    const [segment] = parseSegments([
      { id: 'a', label: 'A', weight: 1, reveal: { headline: 'H', holdMs } },
    ])
    expect(segment.reveal).toEqual({ headline: 'H' })
  })

  it('reads an unknown effect as none', () => {
    const [segment] = parseSegments([
      { id: 'a', label: 'A', weight: 1, reveal: { effect: 'fireworks' } },
    ])
    expect(segment.reveal).toEqual({ effect: 'none' })
  })

  it('round-trips reveal and media on an override', () => {
    const parsed = parsePreset(
      JSON.stringify({
        version: 3,
        name: 'p',
        overrides: {
          u1: {
            media: { kind: 'image', value: 'https://example.test/u.png' },
            reveal: { headline: 'Gotcha' },
          },
        },
      }),
    )
    expect(parsed.overrides.u1).toEqual({
      media: { kind: 'image', value: 'https://example.test/u.png' },
      reveal: { headline: 'Gotcha' },
    })
  })
})

describe('transitions', () => {
  it('reads a transition instance', () => {
    const preset = parsePreset(
      JSON.stringify({
        version: 3,
        transitions: { enter: { id: 'fly', params: { distance: 2 } } },
      }),
    )
    expect(preset.transitions?.enter).toEqual({ id: 'fly', params: { distance: 2 } })
  })

  it('is absent when the file says nothing, which is today behavior', () => {
    expect(parsePreset(JSON.stringify({ version: 3 })).transitions).toBeUndefined()
  })

  // Same posture as an unknown recipe: drop the instance, keep the preset.
  it('drops an unknown transition rather than rejecting the preset', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 3, name: 'kept', transitions: { enter: { id: 'nope' } } }),
    )
    expect(preset.transitions?.enter).toBeUndefined()
    expect(preset.name).toBe('kept')
  })

  it('drops a moment that is not one', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 3, transitions: { whenever: { id: 'fade' } } }),
    )
    expect(preset.transitions).toBeUndefined()
  })

  it('defaults absent params to an empty object', () => {
    const preset = parsePreset(
      JSON.stringify({ version: 3, transitions: { enter: { id: 'fade' } } }),
    )
    expect(preset.transitions?.enter).toEqual({ id: 'fade', params: {} })
  })
})

describe('slice layouts', () => {
  const withSlice = (slice: unknown) =>
    parsePreset(JSON.stringify({ ...DEFAULT_PRESET, version: 4, slice }))

  it('keeps a known layout with its params', () => {
    expect(withSlice({ id: 'curved', params: { anchor: 0.8 } }).slice).toEqual({
      id: 'curved',
      params: { anchor: 0.8 },
    })
  })

  it('drops an unknown layout id', () => {
    expect(withSlice({ id: 'spiral', params: {} }).slice).toBeUndefined()
  })

  it('drops a prototype key rather than resolving it', () => {
    expect(withSlice({ id: 'constructor', params: {} }).slice).toBeUndefined()
  })

  it('defaults missing params to an empty object', () => {
    expect(withSlice({ id: 'auto' }).slice).toEqual({ id: 'auto', params: {} })
  })

  it('reads a per-segment layout', () => {
    const preset = parsePreset(
      JSON.stringify({
        ...DEFAULT_PRESET,
        version: 4,
        segments: [{ id: 'a', label: 'Karl Dandleton', weight: 1, slice: { id: 'radial' } }],
      }),
    )
    expect(preset.segments[0].slice).toEqual({ id: 'radial', params: {} })
  })

  it('reads a layout off an item override', () => {
    const preset = parsePreset(
      JSON.stringify({
        ...DEFAULT_PRESET,
        version: 4,
        overrides: { truk: { slice: { id: 'curved' } } },
      }),
    )
    expect(preset.overrides.truk.slice).toEqual({ id: 'curved', params: {} })
  })

  it('keeps a well-formed part list', () => {
    const parts = [
      { content: { from: 'text', value: 'BANKRUPT' }, orientation: 'stacked', band: [0.45, 0.94] },
    ]
    expect(withSlice({ id: 'composed', params: { parts } }).slice).toEqual({
      id: 'composed',
      params: { parts },
    })
  })

  it('clamps a band that runs outside the radius', () => {
    const slice = withSlice({
      id: 'composed',
      params: {
        parts: [{ content: { from: 'label' }, orientation: 'stacked', band: [1.4, -0.2] }],
      },
    }).slice
    expect((slice?.params.parts as { band: number[] }[])[0].band).toEqual([0, 1])
  })

  it('drops a part whose orientation names nothing', () => {
    const slice = withSlice({
      id: 'composed',
      params: {
        parts: [
          { content: { from: 'label' }, orientation: 'spiral', band: [0.4, 0.9] },
          { content: { from: 'label' }, orientation: 'archedRim', band: [0.8, 0.94] },
        ],
      },
    }).slice
    expect(slice?.params.parts).toHaveLength(1)
  })

  it('falls back to a plain label composition when parts is junk', () => {
    const slice = withSlice({ id: 'composed', params: { parts: 'BANKRUPT' } }).slice
    expect(slice?.params.parts).toEqual([
      { content: { from: 'label' }, orientation: 'stacked', band: [0.45, 0.94] },
    ])
  })

  it('leaves the params of another layout alone', () => {
    expect(withSlice({ id: 'curved', params: { anchor: 0.8 } }).slice?.params).toEqual({
      anchor: 0.8,
    })
  })
})

describe('theme', () => {
  it('reads a stored theme by id', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: 'wof' })
    expect(parsePreset(raw).theme).toBe('wof')
  })

  it('leaves the theme absent when a v4 preset has none', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 4 })
    expect(parsePreset(raw).theme).toBeUndefined()
  })

  it('drops an id no theme answers to', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: 'nope' })
    expect(parsePreset(raw).theme).toBeUndefined()
  })

  it('drops a prototype key rather than resolving it', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: '__proto__' })
    expect(parsePreset(raw).theme).toBeUndefined()
  })

  it('reads a v5 preset back out at version 5', () => {
    const raw = JSON.stringify({ ...DEFAULT_PRESET, version: 5, theme: 'wof' })
    expect(parsePreset(raw).version).toBe(5)
  })
})

describe('hub', () => {
  const withHub = (hub: unknown) =>
    parsePreset(JSON.stringify({ ...DEFAULT_PRESET, version: 5, hub }))

  it('keeps an emblem and its flag as written', () => {
    expect(withHub({ emblem: { kind: 'emoji', value: '🎡' }, spins: true }).hub).toEqual({
      emblem: { kind: 'emoji', value: '🎡' },
      spins: true,
    })
  })

  it('keeps a flag with no emblem, and an emblem with no flag', () => {
    expect(withHub({ spins: true }).hub).toEqual({ spins: true })
    expect(withHub({ emblem: { kind: 'image', value: '/logo.png' } }).hub).toEqual({
      emblem: { kind: 'image', value: '/logo.png' },
    })
  })

  // An empty hub and no hub are the bare cap either way, and only one of them
  // survives a round trip unchanged.
  it('comes back absent when nothing is authored', () => {
    expect(withHub({}).hub).toBeUndefined()
    expect(withHub(undefined).hub).toBeUndefined()
    expect(withHub('🎡').hub).toBeUndefined()
  })

  it('drops an emblem whose kind or value is not one', () => {
    expect(withHub({ emblem: { kind: 'sculpture', value: 'x' } }).hub).toBeUndefined()
    expect(withHub({ emblem: { kind: 'emoji', value: 7 } }).hub).toBeUndefined()
    expect(withHub({ emblem: { kind: 'emoji', value: '🎡' }, spins: 'yes' }).hub).toEqual({
      emblem: { kind: 'emoji', value: '🎡' },
    })
  })
})

describe('breakpoints', () => {
  const round = (data: unknown) => parsePreset(JSON.stringify(data))

  it('reads a list widest-first whatever order it was written in', () => {
    const preset = round({
      ...DEFAULT_PRESET,
      breakpoints: [
        { from: 0, slice: { id: 'radial', params: {} } },
        { from: 1 / 12, slice: { id: 'curved', params: {} } },
      ],
    })
    expect(preset.breakpoints?.map((point) => point.from)).toEqual([1 / 12, 0])
  })

  it('drops an entry with no usable width or no usable layout', () => {
    const preset = round({
      ...DEFAULT_PRESET,
      breakpoints: [
        { from: 'wide', slice: { id: 'radial', params: {} } },
        { from: -1, slice: { id: 'radial', params: {} } },
        { from: 0.1, slice: { id: 'spiral', params: {} } },
        { from: 0.2, slice: { id: 'curved', params: {} } },
      ],
    })
    expect(preset.breakpoints).toEqual([{ from: 0.2, slice: { id: 'curved', params: {} } }])
  })

  it('leaves a preset with no list undefined rather than empty', () => {
    expect(round({ ...DEFAULT_PRESET }).breakpoints).toBeUndefined()
    expect(round({ ...DEFAULT_PRESET, breakpoints: [] }).breakpoints).toBeUndefined()
    expect(round({ ...DEFAULT_PRESET, breakpoints: 'nope' }).breakpoints).toBeUndefined()
  })

  it('reads the parts of a breakpoint the way it reads any other slice', () => {
    const preset = round({
      ...DEFAULT_PRESET,
      breakpoints: [{ from: 0, slice: { id: 'composed', params: { parts: 'nope' } } }],
    })
    expect(preset.breakpoints?.[0].slice.params.parts).toEqual(readParts('nope'))
  })
})
