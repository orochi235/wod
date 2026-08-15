import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestFeeds, subscribeFeed } from '../feed/bus'
import { slugify } from '../feed/identity'
import { DEFAULT_POLL_INTERVAL_MS } from '../meet/poll'
import { DEFAULT_PRESET } from '../preset/defaults'
import { PRESET_KEY, parsePreset } from '../preset/storage'
import { RIG_KEY } from '../rig/visibility'
import { Editor } from './Editor'

/** The default preset draws its cast at random, so tests read it rather than name it. */
const [FIRST, SECOND] = DEFAULT_PRESET.segments
const SIM = DEFAULT_PRESET.feeds[0]
const JOINABLE = SIM.kind === 'simulated' ? SIM.pool[0] : ''
const JOINABLE_ID = slugify(JOINABLE)

/**
 * The editor ships locked, so every test about the rigging has to say it is the
 * operator looking. `Editor locked` is the one that does not.
 */
function resetUnlocked() {
  window.localStorage.clear()
  window.localStorage.setItem(RIG_KEY, '1')
}

/** Seeds storage with a preset holding one feed of each kind. */
function seedBothFeeds() {
  window.localStorage.setItem(
    PRESET_KEY,
    JSON.stringify({
      version: 4,
      name: 'standup',
      segments: [{ id: 'ana', label: 'Ana', weight: 1 }],
      feeds: [
        {
          kind: 'simulated',
          id: 'sim',
          defaults: { weight: 1 },
          pool: ['Fay'],
          autochurn: { intervalMs: 2500, targetSize: 5, volatility: 0.25 },
        },
        {
          kind: 'meet',
          id: 'meet',
          defaults: { weight: 1 },
          conference: '',
          intervalMs: DEFAULT_POLL_INTERVAL_MS,
        },
      ],
      overrides: {},
      tricks: [],
      spin: { target: { kind: 'fair' }, motion: { durationMs: 4500, turns: 6, direction: 'cw' } },
      branches: [],
    }),
  )
}

describe('Editor', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  it('renders the three columns', () => {
    render(<Editor />)
    expect(screen.getByRole('heading', { name: /segments/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /tricks/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'wheel' })).toBeInTheDocument()
  })

  it('offers a way back to the show page', () => {
    render(<Editor />)
    expect(screen.getByRole('link', { name: /show/i })).toHaveAttribute('href', '#/')
  })
})

describe('Editor integration', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  it('persists a segment edit to localStorage', async () => {
    render(<Editor />)
    const input = screen.getByDisplayValue(FIRST.label)
    await userEvent.clear(input)
    await userEvent.type(input, 'Zoe')
    const stored = parsePreset(window.localStorage.getItem(PRESET_KEY))
    expect(stored.segments[0].label).toBe('Zoe')
  })

  it('shows the takeover wedge as a ghost row once enabled', async () => {
    render(<Editor />)
    // The wedge belongs to the trick, not the preset, so a switched-off trick
    // contributes no row at all.
    expect(screen.queryByRole('button', { name: /owned by slow burn/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))

    expect(screen.getByRole('button', { name: /owned by slow burn/i })).toBeInTheDocument()
  })

  it('opens the owning trick in the right column when its ghost row is clicked', async () => {
    render(<Editor />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
    // Adding a trick selects the new one, which closes the takeover's form.
    // 'Wedge label' is a takeover-only field, so it stands in for that form.
    await userEvent.selectOptions(screen.getByLabelText(/add a trick/i), 'vanish')
    expect(screen.queryByLabelText('Wedge label')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /owned by slow burn/i }))

    // Crossing columns is the part only the Editor wires up: the segment list
    // reports the selection and the trick library has to re-seed to honor it.
    expect(screen.getByLabelText('Wedge label')).toHaveValue('free beer')
  })

  it('badges a conflict when two enabled tricks write the same weight', async () => {
    render(<Editor />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
    await userEvent.selectOptions(screen.getByLabelText(/add a trick/i), 'vanish')
    // The new vanish trick defaults to every segment, which the full-share
    // takeover also drives to zero.
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Enable Named wedges shrink away/i }),
    )
    // The badge lives in the card body, so the card has to be open to see it —
    // adding a trick selected the new one, which leaves slow burn collapsed.
    // Anchored at both ends: the segment list's ghost row ("Owned by slow burn")
    // and labkit's card head (which trails its own Remove control) both match a
    // looser name.
    await userEvent.click(
      screen.getByRole('button', { name: /^slow burn one wedge swallows the wheel$/i }),
    )
    // Named, not counted: the transport's scrub readout is also an <output>,
    // so a bare role query would pass with no conflict at all.
    expect(screen.getByRole('status', { name: /slow burn conflicts/i })).toHaveTextContent(
      /also written by another trick/i,
    )
  })

  it('persists a motion edit to localStorage', async () => {
    render(<Editor />)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '30000' } })
    fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '700' } })

    const stored = parsePreset(window.localStorage.getItem(PRESET_KEY))
    expect(stored.spin.motion.durationMs).toBe(30000)
    expect(stored.spin.motion.settle).toEqual({ ms: 700, curve: [0.33, 1, 0.68, 1] })
  })
})

describe('Editor feed', () => {
  /** BroadcastChannel delivers on a later turn of the event loop. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  beforeEach(() => {
    resetUnlocked()
  })

  it('renders a panel for each feed', () => {
    seedBothFeeds()
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    render(<Editor />)
    expect(screen.getByText('Simulated meeting')).toBeInTheDocument()
    expect(screen.getByText('Google Meet')).toBeInTheDocument()
  })

  it('publishes an empty roster on mount, before anyone has joined', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)
    try {
      render(<Editor />)
      await flush()
      expect(seen).toHaveBeenCalledWith({ feedId: 'sim', items: [] })
    } finally {
      stop()
    }
  })

  it('answers a show window that arrives before anyone has joined', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)
    try {
      render(<Editor />)
      await flush()
      seen.mockClear()

      requestFeeds()

      await waitFor(() => expect(seen).toHaveBeenLastCalledWith({ feedId: 'sim', items: [] }))
    } finally {
      stop()
    }
  })

  it('publishes the room whenever it changes', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)
    try {
      render(<Editor />)

      await userEvent.click(screen.getByRole('button', { name: `Join ${JOINABLE}` }))
      await flush()
      expect(seen).toHaveBeenLastCalledWith({
        feedId: 'sim',
        items: [{ id: JOINABLE_ID, label: JOINABLE }],
      })

      // A pool edit is a roster change too: dropping a name from the pool has to
      // reach the show window, not wait for a churn tick that may never come.
      const pool = screen.getByLabelText('Name pool')
      await userEvent.click(pool)
      await userEvent.keyboard('{Control>}a{/Control}')
      await userEvent.paste('Gus')
      await flush()

      expect(seen).toHaveBeenLastCalledWith({ feedId: 'sim', items: [] })
    } finally {
      stop()
    }
  })

  it('answers a show window that arrives after the last publish', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)
    try {
      render(<Editor />)
      await userEvent.click(screen.getByRole('button', { name: `Join ${JOINABLE}` }))
      await flush()
      seen.mockClear()

      // A show window reloaded mid-meeting has missed every publish so far,
      // and with autochurn off there may never be another one.
      requestFeeds()

      // Polled, not flushed once: this is a round trip, so the answer is two
      // channel deliveries away — the request out, the roster back — and a
      // single macrotask only reliably covers the first.
      await waitFor(() =>
        expect(seen).toHaveBeenLastCalledWith({
          feedId: 'sim',
          items: [{ id: JOINABLE_ID, label: JOINABLE }],
        }),
      )
    } finally {
      stop()
    }
  })
})

describe('Editor add feed', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  it('adds a meet feed, and offers it only once', async () => {
    vi.stubEnv('VITE_MEET_CLIENT_ID', 'client.apps.googleusercontent.com')
    // DEFAULT_PRESET has the simulated feed and no meet feed.
    render(<Editor />)
    expect(screen.queryByText('Google Meet')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /add google meet/i }))

    expect(screen.getByText('Google Meet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add google meet/i })).not.toBeInTheDocument()
    expect(parsePreset(window.localStorage.getItem(PRESET_KEY)).feeds).toHaveLength(2)
  })
})

describe('Editor overrides', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  it('keeps an override editable after its target leaves the room', async () => {
    render(<Editor />)
    await userEvent.click(screen.getByRole('button', { name: `Join ${JOINABLE}` }))
    await userEvent.click(screen.getByRole('checkbox', { name: `Exclude ${JOINABLE}` }))

    // The whole point of keying on the item id: the person walking out must not
    // take the joke with them, and it has to still be reachable once they are gone.
    await userEvent.click(screen.getByRole('button', { name: `Remove ${JOINABLE}` }))

    const known = within(screen.getByRole('group', { name: 'Known' }))
    expect(known.getByRole('checkbox', { name: `Exclude ${JOINABLE_ID}` })).toBeChecked()
    expect(parsePreset(window.localStorage.getItem(PRESET_KEY)).overrides).toEqual({
      [JOINABLE_ID]: { excluded: true },
    })
  })
})

/**
 * Only what a landing needs: a controllable `finished` promise. The frame loop
 * is stubbed to a no-op so the morph tick never runs — the landed geometry
 * comes from the animation settling, which is exactly the path under test.
 */
function installSpinHarness() {
  const finishers: (() => void)[] = []
  const keyframes: Keyframe[][] = []
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function animate(
    frames: Keyframe[] | PropertyIndexedKeyframes | null,
  ) {
    keyframes.push((Array.isArray(frames) ? frames : []) as Keyframe[])
    let settle: (animation: Animation) => void = () => undefined
    const finished = new Promise<Animation>((resolve) => {
      settle = resolve
    })
    const animation = { finished, cancel: () => undefined } as unknown as Animation
    finishers.push(() => settle(animation))
    return animation
  } as unknown as Element['animate']

  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)

  return {
    keyframes,
    async land() {
      for (const finish of finishers) finish()
      // Two ticks: one for `finished.then`, one for the state it sets.
      await act(async () => undefined)
    },
    restore() {
      Element.prototype.animate = realAnimate
      vi.unstubAllGlobals()
    },
  }
}

describe('Editor spin', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  it('keeps the landed wheel on screen after the spin ends', async () => {
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      // A full-share takeover drives every other wedge to zero, so the landed
      // wheel carries exactly one label. Falling back to the scrub position
      // instead would put the five names back the instant the spin ended.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      expect(within(wheel).getByText('free beer')).toBeInTheDocument()
      expect(within(wheel).queryByText(FIRST.label)).not.toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })

  it('rehearses the swap in the editor', async () => {
    // Pinned to an Ana win: otherWedgeId is fixed to 'ben', and the recipe
    // no-ops a wedge swapping with itself, so a pinned Ben win would never
    // exercise the trade at all. A count-based assertion (exactly one wedge
    // reads 'Ben') would pass even with the trade never firing, because the
    // preset's five names are five distinct labels either way — swapping
    // relabels two wedges without ever duplicating a name. Reading wedge
    // position, which the trade does not reorder, is what actually shows
    // whose label moved where.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint32Array) array.fill(0)
      return array
    })
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      await userEvent.selectOptions(screen.getByLabelText(/add a trick/i), 'swap')
      await userEvent.selectOptions(screen.getByLabelText('Trades with'), SECOND.id)
      await userEvent.click(
        screen.getByRole('checkbox', { name: /enable two wedges trade identities/i }),
      )
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      // Ana (first wedge, the pinned winner) now carries Ben's name, and
      // Ben's own wedge (second) carries Ana's — the landed frame carries
      // the trade both ways.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      const labels = [...wheel.querySelectorAll('.wheel__label')].map((node) =>
        (node.textContent ?? '').replace(/…$/, ''),
      )
      expect(SECOND.label.startsWith(labels[0])).toBe(true)
      expect(FIRST.label.startsWith(labels[1])).toBe(true)
    } finally {
      harness.restore()
      vi.restoreAllMocks()
    }
  })

  it('spins the settle the operator just authored', async () => {
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '700' } })
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))

      // Three keyframes is the cruise-then-break track; two would mean the
      // panel wrote a settle nothing downstream reads.
      expect(harness.keyframes[0]).toHaveLength(3)
      expect(harness.keyframes[0][1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
    } finally {
      harness.restore()
    }
  })
})

describe('Editor preview', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  const wheel = () => screen.getByRole('img', { name: 'wheel' })

  const hasCurved = () => wheel().querySelector('textPath') !== null

  /**
   * A preset that leaves `auto` nothing to decide: the cast is named rather
   * than drawn at random, and the stored layout is the one orientation that
   * emits no `textPath`. An editor ignoring `slice` falls back to `auto`, which
   * curves both of these on a half-wheel wedge.
   */
  function seedTwoShortNames() {
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({
        version: 5,
        name: 'standup',
        segments: [
          { id: 'ana', label: 'Ana', weight: 1 },
          { id: 'ben', label: 'Ben', weight: 1 },
        ],
        feeds: [],
        overrides: {},
        tricks: [],
        slice: { id: 'radial', params: { frame: 'wheel', anchor: 0.7, maxSize: 26 } },
        spin: {
          target: { kind: 'fair' },
          motion: { durationMs: 4500, turns: 6, direction: 'cw' },
        },
        branches: [],
      }),
    )
  }

  it('wears the look the operator picked', async () => {
    render(<Editor />)
    expect(wheel().querySelector('.wheel__rim')).toBeNull()

    await userEvent.selectOptions(screen.getByLabelText('Wheel'), 'wof')

    expect(wheel().querySelector('.wheel__rim')).not.toBeNull()
  })

  it('sets its labels the way the slice panel says', async () => {
    seedTwoShortNames()
    render(<Editor />)
    expect(hasCurved()).toBe(false)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'curved')

    expect(hasCurved()).toBe(true)
  })

  it('runs the armed exit on a wedge that leaves', async () => {
    render(<Editor />)
    await userEvent.selectOptions(screen.getByLabelText('Wedges leaving'), 'shrink')

    await userEvent.click(screen.getByRole('button', { name: `Join ${JOINABLE}` }))
    expect(within(wheel()).getByText(JOINABLE)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: `Remove ${JOINABLE}` }))

    // The shrink has barely started, so an editor that armed it still draws her.
    expect(within(wheel()).getByText(JOINABLE)).toBeInTheDocument()
  })

  it('holds a level frame level while the preview spins', async () => {
    seedTwoShortNames()
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      await userEvent.selectOptions(screen.getByLabelText('Layout'), 'curved')
      await userEvent.selectOptions(screen.getByLabelText('Frame'), 'level')
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))

      // The rotor's own track, plus one counter-rotation per level group. Only
      // the rotor animating means the level groups were never registered.
      expect(harness.keyframes.length).toBeGreaterThan(1)
    } finally {
      harness.restore()
    }
  })
})

describe('Editor locked', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  /** Rigs the preset through the operator's editor, then locks it back up. */
  async function rigThenLock() {
    window.localStorage.setItem(RIG_KEY, '1')
    render(<Editor />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
    cleanup()
    window.localStorage.removeItem(RIG_KEY)
  }

  it('hides the rigging without a flag', () => {
    render(<Editor />)
    expect(screen.queryByRole('heading', { name: /tricks/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /attendees/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument()
  })

  it('leaves the innocent panels alone', () => {
    render(<Editor />)
    expect(screen.getByRole('heading', { name: /segments/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /motion/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'wheel' })).toBeInTheDocument()
    expect(screen.getByText(/import/i)).toBeInTheDocument()
  })

  it('offers transitions even when locked, because they are not rigging', () => {
    window.localStorage.removeItem(RIG_KEY)
    render(<Editor />)
    expect(screen.getByLabelText('Wedges arriving')).toBeInTheDocument()
  })

  it('shows all of it with the flag', () => {
    window.localStorage.setItem(RIG_KEY, '1')
    render(<Editor />)
    expect(screen.getByRole('heading', { name: /tricks/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /attendees/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /export/i })).toBeInTheDocument()
  })

  it('hides the ghost row a rigged wedge would otherwise announce', async () => {
    await rigThenLock()

    render(<Editor />)

    // The ghost row names its owning trick in the left column, so hiding the
    // right one alone would still spell out the rig.
    expect(screen.queryByRole('button', { name: /owned by slow burn/i })).not.toBeInTheDocument()
  })

  it('offers no scrubber to replay the rig with', async () => {
    await rigThenLock()

    render(<Editor />)

    // With a trick armed the morphs are real, so a scrubber here would let
    // anyone drag the wheel through the whole takeover at their own pace.
    expect(screen.queryByLabelText(/scrub/i)).not.toBeInTheDocument()
  })

  it('still fires the trick it is hiding', async () => {
    await rigThenLock()

    const harness = installSpinHarness()
    try {
      render(<Editor />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      // The whole constraint: the flag is cosmetic. A full-share takeover
      // leaves one label on the landed wheel whether or not anyone can see
      // the panel that authored it.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      expect(within(wheel).getByText('free beer')).toBeInTheDocument()
      expect(within(wheel).queryByText(FIRST.label)).not.toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })
})
