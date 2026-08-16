import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadPreset, savePreset } from '../preset/storage'
import { getTheme } from '../wheel/themes/registry'
import { SliceStudio } from './SliceStudio'
import { ARC_STEPS, PREVIEW_FILL, PREVIEW_RADIUS, WIDE_ARC_STEPS, previewHubRadius } from './wedge'

describe('SliceStudio', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows every step width at once rather than one at a time', () => {
    render(<SliceStudio />)

    for (const step of [...ARC_STEPS, ...WIDE_ARC_STEPS]) {
      expect(screen.getByRole('img', { name: `wedge at ${step} degrees` })).toBeInTheDocument()
    }
  })

  it('renders one last wedge the scrubber drives', () => {
    render(<SliceStudio />)

    const scrub = screen.getByLabelText('Scrubbed arc width')
    fireEvent.change(scrub, { target: { value: '37' } })

    expect(screen.getByRole('img', { name: 'wedge at 37 degrees' })).toBeInTheDocument()
  })

  const boxWidthOf = (deg: number) =>
    Number(
      screen
        .getByRole('img', { name: `wedge at ${deg} degrees` })
        .getAttribute('viewBox')
        ?.split(' ')[2],
    )

  // Cropped to the wedge, and one scale for all of them: a per-wedge crop would
  // rescale the type the gallery exists to compare. The wide pair earns a
  // doubled box by being drawn at doubled width, which is the same scale.
  it('crops every standard render to the same box', () => {
    render(<SliceStudio />)

    const boxes = ARC_STEPS.map((step) =>
      screen.getByRole('img', { name: `wedge at ${step} degrees` }).getAttribute('viewBox'),
    )
    expect(new Set(boxes).size).toBe(1)
  })

  it('gives the wide pair exactly twice the box, and twice the slot', () => {
    render(<SliceStudio />)

    expect(boxWidthOf(WIDE_ARC_STEPS[0])).toBeCloseTo(boxWidthOf(ARC_STEPS[0]) * 2, 6)
    for (const step of WIDE_ARC_STEPS) {
      const slot = screen.getByRole('img', { name: `wedge at ${step} degrees` }).closest('li')
      expect(slot?.className).toContain('studio__slot--wide')
    }
  })

  // The widest wedge has to fit the box it was given, or the crop is a clip.
  it('holds the widest wedge inside the doubled box', () => {
    render(<SliceStudio />)

    const widest = Math.max(...WIDE_ARC_STEPS)
    const half = PREVIEW_RADIUS * Math.sin(Math.PI * (widest / 360))
    expect(boxWidthOf(widest) / 2).toBeGreaterThan(half)
  })

  // The cap covers the tip on the real wheel, so a preview that drew it would
  // show room the type can never have.
  it('masks the hub out of every preview when the look wears one', () => {
    savePreset({ ...loadPreset(), theme: 'board' })
    render(<SliceStudio />)

    for (const node of screen.getAllByRole('img')) {
      const masked = node.querySelector('g[mask]')
      expect(masked).not.toBeNull()
      expect(node.querySelector('mask circle')?.getAttribute('r')).toBe(
        String(previewHubRadius(getTheme('board')?.metrics.hubRadius ?? 0)),
      )
    }
  })

  it('masks nothing out for a look with no hub at all', () => {
    savePreset({ ...loadPreset(), theme: 'flat' })
    render(<SliceStudio />)

    expect(screen.getAllByRole('img')[0].querySelector('mask')).toBeNull()
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

describe('SliceStudio wedge color', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  // SVG's default fill is black and the label ink is dark, so a wedge with no
  // color of its own previewed as nothing at all.
  it('paints a colorless wedge something other than black', () => {
    savePreset({ ...loadPreset(), segments: [{ id: 'bare', label: 'Ana', weight: 1 }] })
    render(<SliceStudio />)

    const painted = [...document.querySelectorAll('.wheel__segment')].map((node) =>
      node.getAttribute('fill'),
    )
    expect(painted.every((fill) => fill === PREVIEW_FILL)).toBe(true)
  })

  it('follows the wedge’s own color when it has one', () => {
    savePreset({
      ...loadPreset(),
      segments: [{ id: 'red', label: 'Ana', weight: 1, color: '#e8442a' }],
    })
    render(<SliceStudio />)

    expect(document.querySelector('.wheel__segment')?.getAttribute('fill')).toBe('#e8442a')
  })

  it('lets a chosen color beat the wedge’s own', async () => {
    savePreset({
      ...loadPreset(),
      segments: [{ id: 'red', label: 'Ana', weight: 1, color: '#e8442a' }],
    })
    render(<SliceStudio />)

    fireEvent.change(screen.getByLabelText('Wedge color'), { target: { value: '#00ff00' } })

    expect(document.querySelector('.wheel__segment')?.getAttribute('fill')).toBe('#00ff00')
  })
})
