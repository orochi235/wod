import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { composeBase } from '../compose/compose'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { SegmentList } from './SegmentList'

/** Statics only: what the wheel holds before any feed or trick contributes. */
const baseOf = (statics: Segment[]) => composeBase({ statics, feeds: [], items: {}, overrides: {} })

/**
 * SegmentList's inputs are genuinely controlled: React restores an <input>'s
 * DOM value to its `value` prop after every event batch unless the parent
 * re-renders with the new value in between (see React DOM's
 * `restoreStateOfTarget`). A bare `vi.fn()` onChange never re-renders, so
 * typing across two userEvent macro-ops (e.g. `clear()` then `type()`) would
 * see the DOM snap back to the stale prop value in between. This harness
 * mirrors what Editor.tsx actually does — feed onChange back into state — so
 * the tests exercise the same round-trip the real app relies on.
 */
function ControlledSegmentList({
  initialSegments,
  onChangeSpy,
}: {
  initialSegments: Segment[]
  onChangeSpy: (segments: Segment[]) => void
}) {
  const [segments, setSegments] = useState(initialSegments)
  return (
    <SegmentList
      segments={segments}
      base={baseOf(segments)}
      tricks={[]}
      showOwners={true}
      selectedTrickId={null}
      onChange={(next) => {
        onChangeSpy(next)
        setSegments(next)
      }}
      onSelectTrick={vi.fn()}
    />
  )
}

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'ben', label: 'Ben', weight: 2 },
]

const base = baseOf(segments)

const beerTrick: Trick = {
  id: 'beer',
  name: 'slow burn',
  recipe: 'takeover',
  params: { wedgeMode: 'new', wedgeLabel: 'free beer', wedgeColor: '#ffd166' },
  enabled: true,
}

describe('SegmentList', () => {
  it('renders a row per editable segment', () => {
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[]}
        showOwners={true}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Ben')).toBeInTheDocument()
  })

  it('adds a segment', async () => {
    const onChange = vi.fn()
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[]}
        showOwners={true}
        selectedTrickId={null}
        onChange={onChange}
        onSelectTrick={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /add segment/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: 'New' })]),
    )
    expect(onChange.mock.calls[0][0]).toHaveLength(3)
  })

  it('deletes a segment', async () => {
    const onChange = vi.fn()
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[]}
        showOwners={true}
        selectedTrickId={null}
        onChange={onChange}
        onSelectTrick={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /delete ana/i }))
    expect(onChange).toHaveBeenCalledWith([segments[1]])
  })

  it('renames a segment', async () => {
    const onChange = vi.fn()
    render(<ControlledSegmentList initialSegments={segments} onChangeSpy={onChange} />)
    const input = screen.getByDisplayValue('Ana')
    await userEvent.clear(input)
    await userEvent.type(input, 'Z')
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)?.[0] as Segment[]
    expect(last[0].label).toBe('Z')
  })

  it('changes a weight', async () => {
    const onChange = vi.fn()
    render(<ControlledSegmentList initialSegments={segments} onChangeSpy={onChange} />)
    const slider = screen.getByLabelText(/weight of ana/i)
    await userEvent.clear(slider)
    await userEvent.type(slider, '5')
    const last = onChange.mock.calls.at(-1)?.[0] as Segment[]
    expect(last[0].weight).toBe(5)
  })

  it('shows a trick-owned wedge as a non-deletable ghost row', () => {
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[beerTrick]}
        showOwners={true}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(screen.getByText('free beer')).toBeInTheDocument()
    expect(screen.getByText(/slow burn/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete free beer/i })).not.toBeInTheDocument()
  })

  it('withholds the ghost row, and the trick name on it, when owners are hidden', () => {
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[beerTrick]}
        showOwners={false}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(screen.queryByText('free beer')).not.toBeInTheDocument()
    expect(screen.queryByText(/slow burn/)).not.toBeInTheDocument()
    // The authored rows are not the trick's to hide.
    expect(screen.getByLabelText(/label of ana/i)).toBeInTheDocument()
  })

  it('marks the ghost row of the trick under edit', () => {
    const { container } = render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[beerTrick]}
        showOwners={true}
        selectedTrickId="beer"
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(container.querySelector('.segment-list__row--active')).not.toBeNull()
  })

  it('selects the owning trick when a ghost row is clicked', async () => {
    const onSelectTrick = vi.fn()
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[beerTrick]}
        showOwners={true}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={onSelectTrick}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /owned by slow burn/i }))
    expect(onSelectTrick).toHaveBeenCalledWith('beer')
  })
})

describe('SegmentList reordering', () => {
  it('moves a segment up', async () => {
    const onChange = vi.fn()
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[]}
        showOwners={true}
        selectedTrickId={null}
        onChange={onChange}
        onSelectTrick={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /move ben up/i }))
    expect(onChange).toHaveBeenCalledWith([segments[1], segments[0]])
  })

  it('disables the controls that would run off either end', () => {
    // They previously rendered live and silently did nothing when clicked.
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[]}
        showOwners={true}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /move ana up/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move ben down/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move ana down/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /move ben up/i })).toBeEnabled()
  })

  it('never shows the internal wedge id when a trick has no label', () => {
    const unlabelled = {
      id: 'beer',
      name: 'slow burn',
      recipe: 'takeover' as const,
      params: { wedgeMode: 'new', wedgeColor: '#ffd166' },
      enabled: true,
    }
    render(
      <SegmentList
        segments={segments}
        base={base}
        tricks={[unlabelled]}
        showOwners={true}
        selectedTrickId={null}
        onChange={vi.fn()}
        onSelectTrick={vi.fn()}
      />,
    )
    expect(screen.queryByText(/beer:wedge/)).not.toBeInTheDocument()
    expect(screen.getByText('unnamed wedge')).toBeInTheDocument()
  })
})

describe('layout override', () => {
  it('sets a layout override from the row', async () => {
    const onChange = vi.fn()
    render(
      <SegmentList
        segments={[{ id: 'a', label: 'Dean Wesrey', weight: 1 }]}
        base={baseOf([])}
        tricks={[]}
        showOwners={false}
        selectedTrickId={null}
        onChange={onChange}
        onSelectTrick={vi.fn()}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Layout of Dean Wesrey'), 'radial')

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ slice: { id: 'radial', params: expect.any(Object) } }),
    ])
  })

  it('clears the override back to the wheel default', async () => {
    const onChange = vi.fn()
    render(
      <SegmentList
        segments={[
          { id: 'a', label: 'Dean Wesrey', weight: 1, slice: { id: 'radial', params: {} } },
        ]}
        base={baseOf([])}
        tricks={[]}
        showOwners={false}
        selectedTrickId={null}
        onChange={onChange}
        onSelectTrick={vi.fn()}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Layout of Dean Wesrey'), '')

    expect(onChange).toHaveBeenCalledWith([
      expect.not.objectContaining({ slice: expect.anything() }),
    ])
  })
})
