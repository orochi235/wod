import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Breakpoint } from '../slice/breakpoints'
import { BreakpointPanel } from './BreakpointPanel'

const at = (degrees: number, id: string): Breakpoint => ({
  from: degrees / 360,
  slice: { id: id as 'curved', params: {} },
})

const wheelSlice = { id: 'radial' as const, params: {} }

describe('BreakpointPanel', () => {
  it('starts on the band no breakpoint claims', () => {
    render(<BreakpointPanel breakpoints={undefined} wheelSlice={wheelSlice} onChange={vi.fn()} />)

    expect(screen.getByText(/set as the wheel is/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Layout')).not.toBeInTheDocument()
  })

  it('cuts the first breakpoint out of that band, carrying the wheel layout', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={undefined} wheelSlice={wheelSlice} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Split band' }))

    expect(onChange).toHaveBeenCalledWith([{ from: expect.any(Number), slice: wheelSlice }])
  })

  it('splits a band into two that resolve the same way', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={[at(12, 'cash')]} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cash' }))
    await userEvent.click(screen.getByRole('button', { name: 'Split band' }))

    expect(onChange.mock.lastCall?.[0].map((point: Breakpoint) => point.slice.id)).toEqual([
      'cash',
      'cash',
    ])
  })

  it('shows the layout of the band that was clicked', async () => {
    render(<BreakpointPanel breakpoints={[at(30, 'curved'), at(12, 'cash')]} onChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cash' }))

    expect(screen.getByLabelText('Layout')).toHaveValue('cash')
    expect(screen.getByText('From 1/30')).toBeInTheDocument()
  })

  it('changes the layout the selected band carries', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={[at(12, 'cash')]} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cash' }))
    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'radial')

    expect(onChange).toHaveBeenCalledWith([
      { from: 12 / 360, slice: { id: 'radial', params: expect.anything() } },
    ])
  })

  // Undefined rather than empty: an empty list and no list mean the same thing,
  // and only one of them round-trips through storage.
  it('clears the list rather than leaving it empty', async () => {
    const onChange = vi.fn()
    render(<BreakpointPanel breakpoints={[at(12, 'cash')]} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cash' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('offers no remove for the band that is not a breakpoint', () => {
    render(<BreakpointPanel breakpoints={[at(12, 'cash')]} onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('keeps the list widest-first', async () => {
    const onChange = vi.fn()
    render(
      <BreakpointPanel breakpoints={[at(4, 'radial'), at(30, 'curved')]} onChange={onChange} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Radial' }))
    await userEvent.click(screen.getByRole('button', { name: 'Split band' }))

    const written = onChange.mock.lastCall?.[0].map((point: Breakpoint) => point.from)
    expect(written).toEqual([...written].sort((a: number, b: number) => b - a))
  })
})
