import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeFeed } from '../feed/bus'
import { PRESET_KEY, parsePreset } from '../preset/storage'
import { Editor } from './Editor'

describe('Editor', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
    window.localStorage.clear()
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
})

describe('Editor feed', () => {
  /** BroadcastChannel delivers on a later turn of the event loop. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  beforeEach(() => {
    window.localStorage.clear()
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
})

/**
 * Only what a landing needs: a controllable `finished` promise. The frame loop
 * is stubbed to a no-op so the morph tick never runs — the landed geometry
 * comes from the animation settling, which is exactly the path under test.
 */
function installSpinHarness() {
  const finishers: (() => void)[] = []
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function animate() {
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
    window.localStorage.clear()
  })

  it('keeps the landed wheel on screen after the spin ends', async () => {
    const harness = installSpinHarness()
    try {
      render(<Editor />)
      await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
      await userEvent.click(screen.getByRole('button', { name: /spin with these tricks/i }))
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
})
