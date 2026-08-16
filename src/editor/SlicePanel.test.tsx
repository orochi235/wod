import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlicePanel } from './SlicePanel'

describe('SlicePanel', () => {
  it('starts a chosen layout on its defaults', async () => {
    const onChange = vi.fn()
    render(<SlicePanel slice={undefined} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'curved')

    expect(onChange).toHaveBeenCalledWith({
      id: 'curved',
      params: expect.objectContaining({ frame: 'wheel' }),
    })
  })

  it("renders the chosen layout's own fields", () => {
    render(<SlicePanel slice={{ id: 'auto', params: {} }} onChange={vi.fn()} />)
    expect(screen.getByLabelText("When it won't fit")).toBeInTheDocument()
  })

  it('drops back to the built-in default when cleared', async () => {
    const onChange = vi.fn()
    render(<SlicePanel slice={{ id: 'curved', params: {} }} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), '')

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('ignores a stored id that names no layout', () => {
    render(<SlicePanel slice={{ id: 'spiral' as never, params: {} }} onChange={vi.fn()} />)
    expect(screen.queryByLabelText("When it won't fit")).toBeNull()
  })
})

describe('SlicePanel panels', () => {
  // Split by what a field decides — how the wedge is laid out, or what is set on
  // it. The parts list is long enough to bury the layout's own knobs.
  it('puts a layout’s own knobs and its parts in separate panels', () => {
    render(<SlicePanel slice={{ id: 'composed', params: {} }} onChange={vi.fn()} />)

    const titles = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(titles).toContain('Slice layout')
    expect(titles).toContain('On the slice')
  })

  it('offers no second panel for a layout with no parts of its own', () => {
    render(<SlicePanel slice={{ id: 'curved', params: {} }} onChange={vi.fn()} />)

    const titles = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(titles).toContain('Slice layout')
    expect(titles).not.toContain('On the slice')
  })

  it('keeps the layout picker alone when nothing is chosen', () => {
    render(<SlicePanel slice={undefined} onChange={vi.fn()} />)

    expect(screen.getAllByRole('heading').map((node) => node.textContent)).toEqual(['Slice layout'])
  })
})
