import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SPECIMEN } from '../slice/fonts/specimen'
import { MAX_PARTS } from '../slice/parts'
import type { SlicePart } from '../slice/types'
import { PartsField } from './PartsField'

function Controlled({ initial, spy }: { initial: unknown; spy: (parts: SlicePart[]) => void }) {
  const [parts, setParts] = useState<unknown>(initial)
  return (
    <PartsField
      label="Part"
      max={MAX_PARTS}
      value={parts}
      onChange={(next) => {
        spy(next)
        setParts(next)
      }}
    />
  )
}

const onePart: SlicePart[] = [
  { content: { from: 'text', value: 'BANKRUPT' }, orientation: 'stacked', band: [0.45, 0.94] },
]

const slider = (label: string, index: number) =>
  screen.getAllByLabelText(label, { selector: 'input[type="range"]' })[index]

describe('PartsField', () => {
  it('renders one slot per allowed part', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getAllByLabelText('Content')).toHaveLength(MAX_PARTS)
  })

  it('shows only the content row for an empty slot', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getAllByLabelText('Orientation')).toHaveLength(1)
  })

  it('shows the authored word only when the content is an authored word', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Word')).toHaveValue('BANKRUPT')
    expect(screen.queryByLabelText('Shorten')).toBeNull()
  })

  it('shows the shortening choice only when the content is the label', () => {
    const parts: SlicePart[] = [
      { content: { from: 'label' }, orientation: 'stacked', band: [0.45, 0.94] },
    ]
    render(<PartsField label="Part" max={MAX_PARTS} value={parts} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Shorten')).toBeInTheDocument()
    expect(screen.queryByLabelText('Word')).toBeNull()
  })

  it('fills an empty slot on the part defaults', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Content')[1], 'label')

    expect(spy).toHaveBeenCalledWith([
      onePart[0],
      { content: { from: 'label' }, orientation: 'stacked', band: [0.45, 0.94] },
    ])
  })

  it('empties a slot when its content is set to none', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Content')[0], '')

    expect(spy).toHaveBeenCalledWith([])
    expect(screen.queryByLabelText('Orientation')).toBeNull()
  })

  it('changes one slot without touching another', async () => {
    const spy = vi.fn()
    const two: SlicePart[] = [
      ...onePart,
      { content: { from: 'label' }, orientation: 'archedRim', band: [0.8, 0.94] },
    ]
    render(<Controlled initial={two} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Orientation')[1], 'taperedRadial')

    expect(spy).toHaveBeenCalledWith([two[0], { ...two[1], orientation: 'taperedRadial' }])
  })

  it('closes the gap when a filled slot is emptied', async () => {
    const spy = vi.fn()
    const two: SlicePart[] = [
      ...onePart,
      { content: { from: 'label' }, orientation: 'archedRim', band: [0.8, 0.94] },
    ]
    render(<Controlled initial={two} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Content')[0], '')

    // The stored list is dense: a part's place on the wedge is its band, not its
    // slot, so there is nothing for a hole to mean.
    expect(spy).toHaveBeenCalledWith([two[1]])
    expect(screen.getAllByLabelText('Orientation')).toHaveLength(1)
  })

  it('keeps the band ordered when one edge is dragged past the other', () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    fireEvent.change(slider('Inner edge', 0), { target: { value: '0.99' } })

    const last = spy.mock.calls.at(-1)?.[0] as SlicePart[]
    expect(last[0].band[0]).toBeLessThanOrEqual(last[0].band[1])
  })

  it('offers a stretch of none, fill, or a chosen amount', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getAllByLabelText('Stretch')[0], 'custom')
    expect(screen.queryAllByLabelText('Stretch amount')).not.toHaveLength(0)

    await userEvent.selectOptions(screen.getAllByLabelText('Stretch')[0], 'fill')
    expect(screen.queryAllByLabelText('Stretch amount')).toHaveLength(0)
    expect((spy.mock.calls.at(-1)?.[0] as SlicePart[])[0].stretch).toBe('fill')
  })
})

describe('the face a part is set in', () => {
  it('follows the look until a face is chosen', () => {
    render(<PartsField label="Part" max={MAX_PARTS} value={onePart} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Face')).toHaveValue('')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('writes the chosen face onto the part, and shows it', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    await userEvent.selectOptions(screen.getByLabelText('Face'), 'rye')

    expect(spy).toHaveBeenCalledWith([expect.objectContaining({ font: 'rye' })])
    // Set live in the face itself, and only the face that was picked is asked for.
    expect(document.querySelector('[data-specimen="rye"]')?.textContent).toBe(DEFAULT_SPECIMEN)
  })

  // A part carries the key only when it names a face, so going back to the
  // look's face has to remove it rather than store an empty one.
  it('clears the face rather than storing an empty one', async () => {
    const spy = vi.fn()
    render(<Controlled initial={[{ ...onePart[0], font: 'rye' }]} spy={spy} />)

    await userEvent.selectOptions(screen.getByLabelText('Face'), '')

    expect(spy).toHaveBeenCalledWith([expect.not.objectContaining({ font: expect.anything() })])
  })

  it('chooses the shape the run is drawn as', async () => {
    const spy = vi.fn()
    render(<Controlled initial={onePart} spy={spy} />)

    expect(screen.getByLabelText('Drawn as')).toHaveValue('glyphs')
    await userEvent.selectOptions(screen.getByLabelText('Drawn as'), 'outline')

    expect(spy).toHaveBeenCalledWith([expect.objectContaining({ shape: 'outline' })])
  })
})
