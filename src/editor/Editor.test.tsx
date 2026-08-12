import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestFeeds, subscribeFeed } from '../feed/bus'
import { PRESET_KEY, parsePreset } from '../preset/storage'
import { RIG_KEY } from '../rig/visibility'
import { Editor } from './Editor'

/**
 * The editor ships locked, so every test about the rigging has to say it is the
 * operator looking. `Editor locked` is the one that does not.
 */
function resetUnlocked() {
  window.localStorage.clear()
  window.localStorage.setItem(RIG_KEY, '1')
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
    const input = screen.getByDisplayValue('Ana')
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

  it('publishes the room whenever it changes', async () => {
    const seen = vi.fn()
    const stop = subscribeFeed(seen)
    try {
      render(<Editor />)

      await userEvent.click(screen.getByRole('button', { name: 'Join Fay' }))
      await flush()
      expect(seen).toHaveBeenLastCalledWith({
        feedId: 'sim',
        items: [{ id: 'fay', label: 'Fay' }],
      })

      // A pool edit is a roster change too: dropping Fay from the pool has to
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
      await userEvent.click(screen.getByRole('button', { name: 'Join Fay' }))
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
          items: [{ id: 'fay', label: 'Fay' }],
        }),
      )
    } finally {
      stop()
    }
  })
})

describe('Editor overrides', () => {
  beforeEach(() => {
    resetUnlocked()
  })

  it('keeps an override editable after its target leaves the room', async () => {
    render(<Editor />)
    await userEvent.click(screen.getByRole('button', { name: 'Join Fay' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Exclude Fay' }))

    // The whole point of keying on the item id: Fay walking out must not take
    // the joke with her, and it has to still be reachable with her gone.
    await userEvent.click(screen.getByRole('button', { name: 'Remove Fay' }))

    const known = within(screen.getByRole('group', { name: 'Known' }))
    expect(known.getByRole('checkbox', { name: 'Exclude fay' })).toBeChecked()
    expect(parsePreset(window.localStorage.getItem(PRESET_KEY)).overrides).toEqual({
      fay: { excluded: true },
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
      expect(within(wheel).queryByText('Ana')).not.toBeInTheDocument()
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
      await userEvent.selectOptions(screen.getByLabelText('Trades with'), 'ben')
      await userEvent.click(
        screen.getByRole('checkbox', { name: /enable two wedges trade identities/i }),
      )
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      // Ana (first wedge, the pinned winner) now carries Ben's name, and
      // Ben's own wedge (second) carries Ana's — the landed frame carries
      // the trade both ways.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      const labels = wheel.querySelectorAll('.wheel__label')
      expect(labels[0]?.textContent).toBe('Ben')
      expect(labels[1]?.textContent).toBe('Ana')
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
      expect(within(wheel).queryByText('Ana')).not.toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })
})
