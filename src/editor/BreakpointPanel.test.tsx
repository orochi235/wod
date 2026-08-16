import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BreakpointPanel } from './BreakpointPanel'

const curvedAt = (from: number) => [{ from, slice: { id: 'curved' as const, params: {} } }]

describe('BreakpointPanel', () => {
  it('adds a breakpoint to an empty list', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={undefined} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add breakpoint' }))

    expect(onChange).toHaveBeenCalledWith([
      { from: expect.any(Number), slice: { id: 'composed', params: expect.anything() } },
    ])
  })

  // The whole value at once, not keystroke by keystroke: the panel is
  // controlled, and a test that does not feed `onChange` back would type its
  // digits onto a value that never changed.
  it('writes a width in degrees as turns', () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={curvedAt(0.25)} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('From (degrees)'), { target: { value: '30' } })

    expect(onChange).toHaveBeenLastCalledWith([
      { from: 30 / 360, slice: { id: 'curved', params: {} } },
    ])
  })

  it('changes the layout a breakpoint carries', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={curvedAt(0.25)} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'radial')

    expect(onChange).toHaveBeenCalledWith([
      { from: 0.25, slice: { id: 'radial', params: expect.anything() } },
    ])
  })

  // Undefined rather than empty: an empty list and no list mean the same thing,
  // and only one of them round-trips through storage.
  it('clears the list rather than leaving it empty', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={curvedAt(0.25)} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('keeps the list widest-first however a width is edited', () => {
    const onChange = vi.fn()
    render(
      <BreakpointPanel
        breakpoints={[
          { from: 0.25, slice: { id: 'curved', params: {} } },
          { from: 0.1, slice: { id: 'radial', params: {} } },
        ]}
        onChange={onChange}
      />,
    )

    const [widest] = screen.getAllByLabelText('From (degrees)')
    fireEvent.change(widest, { target: { value: '1' } })

    expect(onChange.mock.lastCall?.[0].map((point: { from: number }) => point.from)).toEqual([
      0.1,
      1 / 360,
    ])
  })
})
