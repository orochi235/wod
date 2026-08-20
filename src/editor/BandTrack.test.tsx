import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Breakpoint } from '../slice/breakpoints'
import { BandTrack } from './BandTrack'

const at = (degrees: number, id: string): Breakpoint => ({
  from: degrees / 360,
  slice: { id: id as 'curved', params: {} },
})

const list = [at(30, 'curved'), at(12, 'cash')]

const draw = (props: Partial<Parameters<typeof BandTrack>[0]> = {}) => {
  const onChange = vi.fn()
  const onSelect = vi.fn()
  render(
    <BandTrack
      breakpoints={list}
      fallbackName="Name plate"
      nameOf={(slice) => slice.id}
      selected={null}
      onSelect={onSelect}
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange, onSelect }
}

describe('BandTrack', () => {
  it('draws a band per span, named by what it resolves to', () => {
    draw()

    expect(screen.getAllByRole('button').map((band) => band.textContent)).toEqual([
      'Name plate',
      'cash',
      'curved',
    ])
  })

  it('says which share of the wheel each boundary sits at', () => {
    draw()

    expect(screen.getByText('1/30')).toBeInTheDocument()
    expect(screen.getByText('1/12')).toBeInTheDocument()
  })

  it('selects the band that was clicked', async () => {
    const { onSelect } = draw()

    await userEvent.click(screen.getByRole('button', { name: 'cash' }))

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('selects nothing for the span no breakpoint claims', async () => {
    const { onSelect } = draw()

    await userEvent.click(screen.getByRole('button', { name: 'Name plate' }))

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('marks the selected band', () => {
    draw({ selected: 0 })

    expect(screen.getByRole('button', { name: 'curved' })).toHaveAttribute('aria-pressed', 'true')
  })

  // A key press moves the axis by a hundredth of its length, far less than the
  // gap between stops — the boundary has to reach the next one anyway, or the
  // arrow key does nothing.
  it('moves a boundary one stop at a time', () => {
    const { onChange } = draw()

    fireEvent.keyDown(screen.getAllByRole('slider')[1], { key: 'ArrowRight' })

    expect(onChange).toHaveBeenCalledWith([at(36, 'curved'), at(12, 'cash')])
  })

  it('leaves the boundaries it did not move exactly as they were stored', () => {
    const fine = [
      at(30, 'curved'),
      { from: 12.4 / 360, slice: { id: 'cash' as const, params: {} } },
    ]
    const { onChange } = draw({ breakpoints: fine })

    fireEvent.keyDown(screen.getAllByRole('slider')[1], { key: 'ArrowRight' })

    expect(onChange.mock.lastCall?.[0][1].from).toBe(12.4 / 360)
  })

  it('keeps a boundary a stop clear of its neighbour', () => {
    const tight = [at(15, 'curved'), at(12, 'cash')]
    const { onChange } = draw({ breakpoints: tight })

    fireEvent.keyDown(screen.getAllByRole('slider')[0], { key: 'ArrowRight' })

    expect(onChange).not.toHaveBeenCalled()
  })
})
