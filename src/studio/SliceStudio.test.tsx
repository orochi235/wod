import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadPreset, savePreset } from '../preset/storage'
import { SliceStudio } from './SliceStudio'
import { ARC_STEPS } from './wedge'

describe('SliceStudio', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows every step width at once rather than one at a time', () => {
    render(<SliceStudio />)

    for (const step of ARC_STEPS) {
      expect(screen.getByRole('img', { name: `wedge at ${step} degrees` })).toBeInTheDocument()
    }
  })

  it('renders a sixth wedge the scrubber drives', () => {
    render(<SliceStudio />)

    const scrub = screen.getByLabelText('Scrubbed arc width')
    fireEvent.change(scrub, { target: { value: '37' } })

    expect(screen.getByRole('img', { name: 'wedge at 37 degrees' })).toBeInTheDocument()
  })

  // Cropped to the wedge, and one box for all six: a per-wedge crop would
  // rescale the type the gallery exists to compare.
  it('crops every render to the same box', () => {
    render(<SliceStudio />)

    const boxes = screen.getAllByRole('img').map((node) => node.getAttribute('viewBox'))
    expect(new Set(boxes).size).toBe(1)
  })

  it('offers the slice controls rather than a second set of its own', () => {
    render(<SliceStudio />)
    expect(screen.getByLabelText('Layout')).toBeInTheDocument()
  })

  it('persists a layout change the way the editor does', async () => {
    render(<SliceStudio />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'curved')

    expect(loadPreset().slice?.id).toBe('curved')
  })

  it('previews the wedge the preset carries, not a stand-in', () => {
    const preset = loadPreset()
    savePreset({
      ...preset,
      segments: [{ id: 'only', label: 'Bobson Dugnutt', weight: 1 }],
    })

    render(<SliceStudio />)

    expect(screen.getByLabelText('Preview on')).toHaveValue('only')
  })
})
