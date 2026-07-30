import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
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
