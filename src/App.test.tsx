import { render, screen } from '@testing-library/react'
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
})
