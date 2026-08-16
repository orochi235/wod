import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadPreset, savePreset } from '../preset/storage'
import { cash } from '../slice/layouts/cash'
import { getTheme } from '../wheel/themes/registry'
import { SliceStudio } from './SliceStudio'
import {
  ARC_STEPS,
  FALLBACK_HUB_RADIUS,
  PREVIEW_FILL,
  PREVIEW_RADIUS,
  WIDE_ARC_STEPS,
  previewHubRadius,
} from './wedge'

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

  // Each wide box is only as wide as its own wedge needs, so 1/6 does not sit in
  // the empty half of a box sized for 1/3.
  it('gives each wide wedge a box that just holds it', () => {
    render(<SliceStudio />)

    for (const step of WIDE_ARC_STEPS) {
      const half = PREVIEW_RADIUS * Math.sin(Math.PI * (step / 360))
      const box = boxWidthOf(step) / 2
      expect(box).toBeGreaterThan(half)
      // Only the margin beyond the wedge itself — never a box sized for another.
      expect(box - half).toBeLessThan(10)
    }
    expect(boxWidthOf(WIDE_ARC_STEPS[0])).toBeLessThan(boxWidthOf(WIDE_ARC_STEPS[1]))
  })

  // Every box shares a height, which is what lets a fixed rendered height set
  // one px-per-unit for all of them however wide each one is.
  it('keeps every box the same height whatever its width', () => {
    render(<SliceStudio />)

    const heights = [...ARC_STEPS, ...WIDE_ARC_STEPS].map(
      (step) =>
        screen
          .getByRole('img', { name: `wedge at ${step} degrees` })
          .getAttribute('viewBox')
          ?.split(' ')[3],
    )
    expect(new Set(heights).size).toBe(1)
  })

  it('lets the scrubbed preview take the row’s slack', () => {
    render(<SliceStudio />)

    const slot = screen.getByLabelText('Scrubbed arc width').closest('li')
    expect(slot?.className).toContain('studio__slot--fill')
  })

  // The cap covers the tip on the real wheel, so a preview that drew it would
  // show room the type can never have.
  it('masks the hub out of every preview when the look wears one', () => {
    savePreset({ ...loadPreset(), theme: 'board' })
    render(<SliceStudio />)

    const expected = String(previewHubRadius(getTheme('board')?.metrics.hubRadius ?? 0))
    for (const node of screen.getAllByRole('img')) {
      expect(node.querySelector('g[mask]')).not.toBeNull()
      expect(node.querySelector('mask circle')?.getAttribute('r')).toBe(expected)
    }
  })

  // The flat look wears none, and a clip that silently did nothing there taught
  // the wrong thing about the tip of a wedge.
  it('follows a hubless look by default, and clips anyway when asked', async () => {
    savePreset({ ...loadPreset(), theme: 'flat' })
    render(<SliceStudio />)

    expect(screen.getAllByRole('img')[0].querySelector('mask')).toBeNull()

    await userEvent.click(screen.getByLabelText('Clip the hub'))

    for (const node of screen.getAllByRole('img')) {
      expect(node.querySelector('mask circle')?.getAttribute('r')).toBe(
        String(previewHubRadius(FALLBACK_HUB_RADIUS)),
      )
    }
  })

  it('drops the clip on a hubbed look when it is turned off', async () => {
    savePreset({ ...loadPreset(), theme: 'board' })
    render(<SliceStudio />)

    await userEvent.click(screen.getByLabelText('Clip the hub'))

    expect(screen.getAllByRole('img')[0].querySelector('mask')).toBeNull()
  })

  // The room a part was given, which is what explains the size it solved to.
  it('outlines one band per part when asked, and none until then', async () => {
    savePreset({ ...loadPreset(), slice: { id: 'cash', params: { ...cash.defaults } } })
    render(<SliceStudio />)

    expect(document.querySelector('.studio__band')).toBeNull()

    await userEvent.click(screen.getByLabelText('Show the room'))

    const expected = cash.bands?.(cash.defaults).length ?? 0
    expect(expected).toBeGreaterThan(1)
    for (const node of screen.getAllByRole('img')) {
      expect(node.querySelectorAll('.studio__band')).toHaveLength(expected)
    }
  })

  // A layout that names no bands still has room — the wedge's own run.
  it('falls back to the wedge run for a layout that names no band', async () => {
    savePreset({ ...loadPreset(), slice: { id: 'curved', params: {} } })
    render(<SliceStudio />)

    await userEvent.click(screen.getByLabelText('Show the room'))

    expect(screen.getAllByRole('img')[0].querySelectorAll('.studio__band')).toHaveLength(1)
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

describe('SliceStudio breakpoints', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('draws each preview as the width it is, not as the wedge resolves once', () => {
    // A fixed string per instance, so which one a preview drew is readable off
    // the DOM without depending on how either would have fitted the label.
    const saying = (text: string) => ({
      id: 'composed' as const,
      params: {
        parts: [
          { content: { from: 'text', value: text }, orientation: 'radial', band: [0.2, 0.9] },
        ],
      },
    })
    savePreset({
      ...loadPreset(),
      slice: saying('NARROW'),
      // A twelfth of a turn is 30°, so only the last step and the wide pair clear it.
      breakpoints: [{ from: 1 / 12, slice: saying('WIDE') }],
    })
    render(<SliceStudio />)

    const drawnIn = (deg: number) =>
      screen.getByRole('img', { name: `wedge at ${deg} degrees` }).textContent

    expect(drawnIn(30)).toContain('WIDE')
    expect(drawnIn(60)).toContain('WIDE')
    // 12° rather than 8°: the narrowest step holds neither word at a readable
    // size, so it draws nothing and says nothing about which one resolved.
    expect(drawnIn(12)).toContain('NARROW')
    expect(drawnIn(20)).toContain('NARROW')
  })

  it('names the breakpoint a preview landed on', () => {
    savePreset({
      ...loadPreset(),
      breakpoints: [{ from: 1 / 12, slice: { id: 'curved', params: {} } }],
    })
    render(<SliceStudio />)

    // Scoped to the caption: 'Curved' is also an option in the layout select.
    expect(screen.getAllByText('Curved', { selector: '.studio__resolved' }).length).toBe(3)
  })

  it('leaves a caption bare where no breakpoint fired', () => {
    savePreset({
      ...loadPreset(),
      breakpoints: [{ from: 1 / 12, slice: { id: 'curved', params: {} } }],
    })
    const { container } = render(<SliceStudio />)

    // Five stepped widths and the scrubber, of which only 30° clears the floor.
    expect(container.querySelectorAll('.studio__resolved')).toHaveLength(3)
  })
})

describe('SliceStudio breakpoint authoring', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('authors a breakpoint that the gallery immediately draws', async () => {
    render(<SliceStudio />)

    await userEvent.click(screen.getByRole('button', { name: 'Add breakpoint' }))

    // `DEFAULT_SLICE` is the composed layout, and a new breakpoint's floor of a
    // twelfth of a turn is exactly the 30° step, so that caption names it.
    expect(loadPreset().breakpoints).toHaveLength(1)
    expect(screen.getAllByText('Composed', { selector: '.studio__resolved' })).toHaveLength(3)
  })
})
