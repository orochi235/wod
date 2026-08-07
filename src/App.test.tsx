import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { publishFeed, subscribeFeedRequests } from './feed/bus'
import { DEFAULT_PRESET } from './preset/defaults'
import { PRESET_KEY } from './preset/storage'

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders one label per preset segment', () => {
    render(<App />)
    for (const segment of DEFAULT_PRESET.segments) {
      expect(screen.getByText(segment.label)).toBeInTheDocument()
    }
  })

  it('does not show the trick-owned wedge while its trick is disabled', () => {
    render(<App />)
    expect(screen.queryByText('free beer')).not.toBeInTheDocument()
  })

  it('shows the wedge at zero width once its trick is enabled', () => {
    const enabled = {
      ...DEFAULT_PRESET,
      tricks: DEFAULT_PRESET.tricks.map((trick) => ({ ...trick, enabled: true })),
    }
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(enabled))
    render(<App />)
    // Present in the segment set but zero-width, so the wheel draws no label.
    expect(screen.queryByText('free beer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
  })

  it('renders the stored preset rather than a built-in list', () => {
    // The decisive test. The default preset's names happen to match the array
    // App.tsx used to hardcode, so asserting against them passes either way.
    // These names exist nowhere in the source.
    const custom = {
      ...DEFAULT_PRESET,
      segments: [
        { id: 'zed', label: 'Zebediah', weight: 1 },
        { id: 'quo', label: 'Quorra', weight: 1 },
      ],
    }
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(custom))

    render(<App />)

    expect(screen.getByText('Zebediah')).toBeInTheDocument()
    expect(screen.getByText('Quorra')).toBeInTheDocument()
    expect(screen.queryByText('Ana')).not.toBeInTheDocument()
  })

  it('draws no arc for the zero-width wedge', () => {
    // A weight-0 segment must occupy no arc at all, not a hairline one.
    const { container, unmount } = render(<App />)
    const withoutTrick = container.querySelectorAll('.wheel__segment').length
    unmount()

    const enabled = {
      ...DEFAULT_PRESET,
      tricks: DEFAULT_PRESET.tricks.map((trick) => ({ ...trick, enabled: true })),
    }
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(enabled))
    const second = render(<App />)

    expect(second.container.querySelectorAll('.wheel__segment')).toHaveLength(withoutTrick)
  })

  it('disables spinning and explains itself when the wheel is empty', () => {
    // The design doc requires an explanatory empty state rather than a live
    // button that silently does nothing, which is what planSpin returning null
    // would otherwise look like.
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({ ...DEFAULT_PRESET, segments: [], tricks: [] }),
    )

    render(<App />)

    expect(screen.getByRole('button', { name: /spin/i })).toBeDisabled()
    expect(screen.getByText(/nothing on the wheel yet/i)).toBeInTheDocument()
  })

  it('keeps spinning available as soon as there is a segment', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
    expect(screen.queryByText(/nothing on the wheel yet/i)).not.toBeInTheDocument()
  })

  it('follows a preset written by another window', () => {
    // The editor lives at #/edit in a separate window; the storage event is how
    // an already-open show window learns about an edit without a reload.
    render(<App />)
    expect(screen.getByText('Ana')).toBeInTheDocument()

    const edited = {
      ...DEFAULT_PRESET,
      segments: [{ id: 'new', label: 'Wilhelmina', weight: 1 }],
    }
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: PRESET_KEY, newValue: JSON.stringify(edited) }),
      )
    })

    expect(screen.getByText('Wilhelmina')).toBeInTheDocument()
    expect(screen.queryByText('Ana')).not.toBeInTheDocument()
  })
})

/**
 * Only what a landing needs: a controllable `finished` promise, and a frame loop
 * stubbed to a no-op so the morph tick never runs. Mirrors the harness in
 * Editor.test.tsx, which exists for the same reason — jsdom implements no Web
 * Animations API, so without this a spin throws instead of landing.
 */
function installSpinHarness() {
  const finishers: (() => void)[] = []
  // Live counters, so a test can pin that an in-flight animation was neither
  // restarted nor cancelled out from under itself.
  const calls = { animate: 0, cancel: 0 }
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function animate() {
    let settle: (animation: Animation) => void = () => undefined
    const finished = new Promise<Animation>((resolve) => {
      settle = resolve
    })
    const animation = {
      finished,
      cancel: () => {
        calls.cancel += 1
      },
    } as unknown as Animation
    calls.animate += 1
    finishers.push(() => settle(animation))
    return animation
  } as unknown as Element['animate']

  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)

  return {
    calls,
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

describe('App empty guard', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('disables spinning when the roster empties under a landed wheel', async () => {
    // The wheel holds its landed frame until the next spin, so displaySegments
    // outlives an emptied roster. Deriving the guard from it left the button
    // live over a roster onSpin can no longer resolve, and the click silently
    // did nothing — the exact failure the guard exists to prevent.
    const harness = installSpinHarness()
    try {
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: PRESET_KEY,
            newValue: JSON.stringify({ ...DEFAULT_PRESET, segments: [], tricks: [] }),
          }),
        )
      })

      // The landed wheel is still on screen — otherwise this passes for the
      // trivial reason that the hold was never in play.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      expect(wheel.querySelectorAll('.wheel__segment').length).toBeGreaterThan(0)

      expect(screen.getByRole('button', { name: /spin/i })).toBeDisabled()
      expect(screen.getByText(/nothing on the wheel yet/i)).toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })
})

/**
 * A published roster lands a React state update from outside React, so the
 * act() wrapper is what keeps the suite's only console warnings out of it —
 * BroadcastChannel delivers on a later turn, hence the inner await.
 */
const publish = (items: { id: string; label: string }[]) =>
  act(async () => {
    publishFeed({ feedId: 'sim', items })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe('feed', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('puts published attendees on the wheel', async () => {
    render(<App />)

    await publish([{ id: 'zoe', label: 'Zoe' }])

    await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())
  })

  it('drops someone who leaves', async () => {
    render(<App />)

    await publish([{ id: 'zoe', label: 'Zoe' }])
    await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())

    await publish([])
    await waitFor(() => expect(screen.queryByText('Zoe')).not.toBeInTheDocument())
  })

  it('asks for a roster on arrival instead of waiting for the next change', async () => {
    // The show window reloaded mid-meeting. Standing in for the editor: a
    // publisher that has already published everything it is going to publish
    // until someone joins or leaves.
    const stop = subscribeFeedRequests(() => {
      publishFeed({ feedId: 'sim', items: [{ id: 'zoe', label: 'Zoe' }] })
    })
    try {
      await act(async () => {
        render(<App />)
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())
    } finally {
      stop()
    }
  })
})

describe('churn during a spin', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  /** Labels the wheel is actually drawing, ignoring the announced-winner line. */
  const onWheel = (label: string) =>
    within(screen.getByRole('img', { name: 'wheel' })).queryByText(label)

  it('holds a roster change that arrives mid-spin until the next spin releases it', async () => {
    // A feed-only preset, deliberately: the empty state is the one thing derived
    // from the live roster that stays visible while the wheel holds its
    // geometry, so emptying the roster is what proves the mid-spin publish was
    // delivered rather than never arriving. With statics on the wheel the
    // "Zoe is still there" assertion would pass just as well for a message that
    // was silently dropped.
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({
        ...DEFAULT_PRESET,
        segments: [],
        tricks: [],
        spin: { ...DEFAULT_PRESET.spin, motion: { ...DEFAULT_PRESET.spin.motion, durationMs: 20 } },
      }),
    )
    const harness = installSpinHarness()
    try {
      render(<App />)

      await publish([{ id: 'zoe', label: 'Zoe' }])
      await waitFor(() => expect(onWheel('Zoe')).toBeInTheDocument())

      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      expect(harness.calls.animate).toBe(1)

      // Zoe leaves while the wheel is turning.
      await publish([])

      // Delivered: the app has already recomposed and knows the room is empty…
      expect(screen.getByText(/nothing on the wheel yet/i)).toBeInTheDocument()
      // …while the wheel keeps the geometry it launched with, on the same
      // animation — no reindex under the pointer, no restart.
      expect(onWheel('Zoe')).toBeInTheDocument()
      expect(harness.calls.animate).toBe(1)
      expect(harness.calls.cancel).toBe(0)

      await harness.land()

      // Still held at rest. The hold lifts on the next spin, not on landing:
      // releasing here would wipe the landed frame the spin just drew.
      expect(onWheel('Zoe')).toBeInTheDocument()
      expect(harness.calls.animate).toBe(1)
      expect(harness.calls.cancel).toBe(0)
      // Nothing left to spin, so the button that would release it is off — the
      // empty guard reads the live roster, not the frame still on screen.
      expect(screen.getByRole('button', { name: /spin/i })).toBeDisabled()

      // Someone new joins, which re-arms the button. The wheel is still held.
      await publish([{ id: 'yan', label: 'Yan' }])
      expect(onWheel('Zoe')).toBeInTheDocument()
      expect(onWheel('Yan')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /spin/i }))

      // The next spin draws from the live roster, so every change that landed
      // while the wheel was held was queued rather than dropped.
      expect(onWheel('Yan')).toBeInTheDocument()
      expect(onWheel('Zoe')).not.toBeInTheDocument()
      expect(harness.calls.animate).toBe(2)
    } finally {
      harness.restore()
    }
  })
})
