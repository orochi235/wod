import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
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
