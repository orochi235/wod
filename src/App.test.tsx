import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { publishFeed, subscribeFeedRequests } from './feed/bus'
import { DEFAULT_PRESET } from './preset/defaults'
import { PRESET_KEY } from './preset/storage'
import type { Reveal, Segment } from './wheel/types'

/**
 * Rendered wedge labels with any ellipsis stripped. A name that outruns its arc
 * is drawn truncated, so an exact match against the roster is a coin flip on
 * whichever names the default preset happened to draw.
 */
const wheelLabels = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.wheel__label')].map((node) =>
    (node.textContent ?? '').replace(/…$/, ''),
  )

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders one label per preset segment', () => {
    const { container } = render(<App />)
    const drawn = wheelLabels(container)
    expect(drawn).toHaveLength(DEFAULT_PRESET.segments.length)
    DEFAULT_PRESET.segments.forEach((segment, index) => {
      expect(segment.label.startsWith(drawn[index])).toBe(true)
    })
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
    for (const segment of DEFAULT_PRESET.segments) {
      expect(screen.queryByText(segment.label)).not.toBeInTheDocument()
    }
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
    const { container } = render(<App />)
    const [first] = DEFAULT_PRESET.segments
    expect(first.label.startsWith(wheelLabels(container)[0])).toBe(true)

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
    expect(screen.queryByText(first.label)).not.toBeInTheDocument()
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
  const keyframes: Keyframe[][] = []
  // Live counters, so a test can pin that an in-flight animation was neither
  // restarted nor cancelled out from under itself.
  const calls = { animate: 0, cancel: 0 }
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function animate(
    frames: Keyframe[] | PropertyIndexedKeyframes | null,
  ) {
    keyframes.push((Array.isArray(frames) ? frames : []) as Keyframe[])
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

describe('App spin', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('announces the swapped-in name, and the wheel agrees', async () => {
    // Pinned to an Ana win: otherWedgeId is fixed to 'ben', and the recipe
    // no-ops a wedge swapping with itself, so a pinned Ben win would never
    // exercise the trade at all. Mirrors the rng pin in useSpin.test.ts.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint32Array) array.fill(0)
      return array
    })
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({
        ...DEFAULT_PRESET,
        segments: [
          { id: 'ana', label: 'Ana', weight: 1 },
          { id: 'ben', label: 'Ben', weight: 1 },
        ],
        tricks: [
          {
            id: 's',
            name: 'the swap',
            recipe: 'swap',
            params: { otherWedgeId: 'ben', at: 0.95 },
            enabled: true,
          },
        ],
      }),
    )
    const harness = installSpinHarness()
    try {
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /^spin$/i }))
      await harness.land()

      // The announcement reads the winner's label out of the landed frame.
      // Ana won the pinned draw, so an announcement of 'Ben' is only possible
      // if the trade actually ran — that is the gag working. Scoped to the
      // announcement paragraph: with only two wedges, both labels are always
      // visible somewhere on the wheel too, so an unscoped query would always
      // find more than one match.
      const announced = screen.getByText(/^(Ana|Ben)$/, { selector: '.app__result' }).textContent
      expect(announced).toBe('Ben')

      // And the wheel agrees: the announcement and the wheel are drawn from
      // the same landed frame, so the traded name sits on the wheel too.
      const wheel = screen.getByRole('img', { name: 'wheel' })
      expect(within(wheel).getByText(announced as string)).toBeInTheDocument()
    } finally {
      harness.restore()
      vi.restoreAllMocks()
    }
  })

  it('carries the stored settle into the keyframes a plain Spin click hands the rotor', async () => {
    // onSpin builds its own override SpinConfig and useSpin always prefers an
    // override over the config it was constructed with, so this is the only
    // SpinConfig construction site in App.tsx a click on the show page's Spin
    // button can reach.
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({
        ...DEFAULT_PRESET,
        spin: {
          ...DEFAULT_PRESET.spin,
          motion: {
            ...DEFAULT_PRESET.spin.motion,
            settle: { ms: 700, curve: [0.33, 1, 0.68, 1] },
          },
        },
      }),
    )
    const harness = installSpinHarness()
    try {
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))

      expect(harness.keyframes[0]).toHaveLength(3)
      expect(harness.keyframes[0][1].easing).toBe('cubic-bezier(0.33, 1, 0.68, 1)')
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

  it('spins against the composed roster, not the one still animating', async () => {
    const harness = installSpinHarness()
    try {
      // A four-second departure, so the drawn roster stays larger than the
      // composed one for the whole test.
      window.localStorage.setItem(
        PRESET_KEY,
        JSON.stringify({
          ...DEFAULT_PRESET,
          transitions: { exit: { id: 'shrink', params: { durationMs: 4000, staggerMs: 0 } } },
        }),
      )
      render(<App />)

      await publish([{ id: 'zoe', label: 'Zoe' }])
      await waitFor(() => expect(screen.getByText('Zoe')).toBeInTheDocument())

      await publish([])
      // Still drawn: the shrink has barely started. Without this the test would
      // pass for the trivial reason that she was already gone.
      expect(screen.getByText('Zoe')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /spin/i }))

      // Settled to the roster the spin planned against, mid-departure or not.
      expect(screen.queryByText('Zoe')).not.toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })
})

describe('wedge colors', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps a wedge on its color when another leaves the feed', async () => {
    const { container } = render(<App />)
    await publish([
      { id: 'ana', label: 'Ana' },
      { id: 'ben', label: 'Ben' },
      { id: 'cy', label: 'Cy' },
    ])

    const fillOf = (id: string) =>
      container.querySelector(`[data-segment-id="sim:${id}"] .wheel__segment`)?.getAttribute('fill')

    const before = fillOf('cy')
    expect(before).toBeTruthy()

    await publish([
      { id: 'ana', label: 'Ana' },
      { id: 'cy', label: 'Cy' },
    ])
    expect(fillOf('cy')).toBe(before)
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

describe('App reveal', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  // One segment is always its own winner, so the landing needs no stubbed rng.
  const seed = (reveal?: Reveal) => {
    const segment: Segment = { id: 'solo', label: 'Solo', weight: 1 }
    if (reveal !== undefined) segment.reveal = reveal
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({ ...DEFAULT_PRESET, segments: [segment], tricks: [], branches: [] }),
    )
  }

  it('raises no overlay for a winner with no reveal', async () => {
    const harness = installSpinHarness()
    try {
      seed()
      const { container } = render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      // Landed, and still the quiet result line.
      expect(container.querySelector('.app__result')).toHaveTextContent('Solo')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
    } finally {
      harness.restore()
    }
  })

  it('raises the overlay for an authored reveal, blocks spin, and dismisses on click', async () => {
    const harness = installSpinHarness()
    try {
      seed({ headline: 'Free beer' })
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('Free beer')
      // No spinning out from under a reveal that is still describing the winner.
      expect(screen.getByRole('button', { name: /spin/i })).toBeDisabled()

      await userEvent.click(dialog)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /spin/i })).toBeEnabled()
    } finally {
      harness.restore()
    }
  })
})

/**
 * A landed wheel holds its frame, which is right while the landing is still
 * being announced and wrong for the rest of the meeting: the roster keeps
 * arriving and the wheel keeps ignoring it. These pin the two ways out.
 */
describe('App landed wheel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  const onWheel = (label: string) =>
    within(screen.getByRole('img', { name: 'wheel' })).queryByText(label)

  /** A wheel whose only static wedge is the guaranteed winner. */
  const seedWinner = (reveal?: Reveal) => {
    const segment: Segment = { id: 'solo', label: 'Solo', weight: 1 }
    if (reveal !== undefined) segment.reveal = reveal
    window.localStorage.setItem(
      PRESET_KEY,
      JSON.stringify({ ...DEFAULT_PRESET, segments: [segment], tricks: [], branches: [] }),
    )
  }

  it('offers no reset until something has landed', () => {
    seedWinner()
    render(<App />)
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled()
  })

  it('takes the live roster back on reset', async () => {
    const harness = installSpinHarness()
    try {
      seedWinner()
      const { container } = render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()
      expect(container.querySelector('.app__result')).toHaveTextContent('Solo')

      await publish([{ id: 'zoe', label: 'Zoe' }])
      // Held: the frame the spin drew outlives a roster that arrived under it.
      expect(onWheel('Zoe')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /reset/i }))

      expect(onWheel('Zoe')).toBeInTheDocument()
      expect(container.querySelector('.app__result')).toHaveTextContent('')
      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled()
    } finally {
      harness.restore()
    }
  })

  it('takes the live roster back when a reveal is dismissed', async () => {
    const harness = installSpinHarness()
    try {
      seedWinner({ headline: 'Free beer' })
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      await publish([{ id: 'zoe', label: 'Zoe' }])
      expect(onWheel('Zoe')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('dialog'))

      // Dismissing is the operator saying the landing has been seen, so the
      // wheel goes back to tracking the room without waiting for a spin.
      expect(onWheel('Zoe')).toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })

  it('keeps announcing the winner after a dismissed reveal releases the wheel', async () => {
    const harness = installSpinHarness()
    try {
      seedWinner({ headline: 'Free beer' })
      const { container } = render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()
      await userEvent.click(screen.getByRole('dialog'))

      // Release hands back the geometry, not the result. Clearing the announced
      // winner here would erase the answer the spin exists to produce.
      expect(container.querySelector('.app__result')).toHaveTextContent('Solo')
    } finally {
      harness.restore()
    }
  })

  it('holds a landing with no reveal until the operator resets it', async () => {
    const harness = installSpinHarness()
    try {
      seedWinner()
      render(<App />)
      await userEvent.click(screen.getByRole('button', { name: /spin/i }))
      await harness.land()

      await publish([{ id: 'zoe', label: 'Zoe' }])

      // No reveal means no dismissal, so nothing has said the landing is over.
      // Releasing on landing instead would wipe the landed frame the instant a
      // roster change that arrived mid-spin was applied.
      expect(onWheel('Zoe')).not.toBeInTheDocument()
    } finally {
      harness.restore()
    }
  })

  it('offers a mute once the look can make noise', async () => {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify({ ...DEFAULT_PRESET, theme: 'wof' }))
    render(<App />)
    expect(await screen.findByRole('button', { name: /mute/i })).toBeInTheDocument()
  })

  it('offers no mute under a silent look', () => {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify({ ...DEFAULT_PRESET, theme: 'flat' }))
    render(<App />)
    expect(screen.queryByRole('button', { name: /mute/i })).toBeNull()
  })
})
