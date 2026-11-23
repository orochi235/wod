import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Conflict } from '../tricks/conflicts'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { applyCards, TrickLibrary } from './TrickLibrary'

const segments: Segment[] = [{ id: 'ana', label: 'Ana', weight: 1 }]

const tricks: Trick[] = [
  {
    id: 'beer',
    name: 'slow burn',
    recipe: 'takeover',
    params: { wedgeMode: 'new', wedgeLabel: 'free beer', endShare: 1 },
    enabled: true,
  },
  { id: 'v', name: 'ana goes', recipe: 'vanish', params: { targets: ['ana'] }, enabled: false },
]

function renderLibrary(overrides: Partial<Parameters<typeof TrickLibrary>[0]> = {}) {
  const props = {
    tricks,
    segments,
    conflicts: [] as Conflict[],
    selectedId: 'beer',
    onChange: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  }
  render(<TrickLibrary {...props} />)
  return props
}

/**
 * Same controlled-input gotcha as SegmentList.test.tsx: renaming needs to
 * survive a re-render between keystrokes, which a bare `vi.fn()` onChange
 * cannot provide.
 */
function ControlledTrickLibrary({
  initialTricks,
  onChangeSpy,
}: {
  initialTricks: Trick[]
  onChangeSpy: (tricks: Trick[]) => void
}) {
  const [current, setCurrent] = useState(initialTricks)
  return (
    <TrickLibrary
      tricks={current}
      segments={segments}
      conflicts={[]}
      selectedId="beer"
      onChange={(next) => {
        onChangeSpy(next)
        setCurrent(next)
      }}
      onSelect={vi.fn()}
    />
  )
}

describe('TrickLibrary', () => {
  it('lists every trick by its operator name', () => {
    renderLibrary()
    expect(screen.getByDisplayValue('slow burn')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ana goes')).toBeInTheDocument()
  })

  it('shows the structural recipe name alongside it', () => {
    renderLibrary()
    // The same recipe name also appears as an <option> in the "Add a trick"
    // catalog select further down the panel, and cards size their kind label
    // with hidden copies of every kind's; leave both out.
    const shown = screen
      .getAllByText(/One wedge swallows the wheel/)
      .filter((el) => el.tagName !== 'OPTION' && !el.closest('[aria-hidden]'))
    expect(shown).toHaveLength(1)
  })

  it('toggles a trick', async () => {
    const props = renderLibrary()
    await userEvent.click(screen.getByRole('switch', { name: 'Run slow burn' }))
    expect(props.onChange).toHaveBeenCalledWith([{ ...tricks[0], enabled: false }, tricks[1]])
  })

  it('adds a trick from the recipe catalog', async () => {
    const props = renderLibrary()
    await userEvent.selectOptions(screen.getByLabelText(/add a trick/i), 'relabel')
    const next = vi.mocked(props.onChange).mock.calls.at(-1)?.[0] as Trick[]
    expect(next).toHaveLength(3)
    expect(next[2].recipe).toBe('relabel')
  })

  it('deletes a trick', async () => {
    const props = renderLibrary()
    await userEvent.click(screen.getByRole('button', { name: 'Remove slow burn' }))
    expect(props.onChange).toHaveBeenCalledWith([tricks[1]])
  })

  it('renders the param form only for the expanded trick', () => {
    // `vanish` (the unselected 'v' trick) has its own "Wedges" field, so its
    // absence, not just an unrelated recipe's field, proves that card is folded.
    renderLibrary({ selectedId: 'beer' })
    expect(screen.getByLabelText('Wedge label')).toBeVisible()
    expect(screen.queryByLabelText('New label')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Wedges')).not.toBeInTheDocument()
  })

  it('renames a trick', async () => {
    const onChange = vi.fn()
    render(<ControlledTrickLibrary initialTricks={tricks} onChangeSpy={onChange} />)
    const input = screen.getByLabelText('Name of card 1')
    await userEvent.clear(input)
    await userEvent.type(input, 'Z')
    const last = onChange.mock.calls.at(-1)?.[0] as Trick[]
    expect(last[0].name).toBe('Z')
  })

  it('badges a trick that shares a write with another', () => {
    renderLibrary({
      conflicts: [{ segmentId: 'ana', property: 'weight', trickIds: ['beer', 'v'], blends: true }],
    })
    expect(screen.getByRole('status', { name: /slow burn conflicts/i })).toHaveTextContent('ana')
  })
})

describe('applyCards', () => {
  const card = (trick: Trick) => ({
    id: trick.id,
    kind: trick.recipe,
    name: trick.name,
    on: trick.enabled,
  })

  it("takes the cards' order", () => {
    const next = applyCards(tricks, [card(tricks[1]), card(tricks[0])])
    expect(next.map((trick) => trick.id)).toEqual(['v', 'beer'])
  })

  it("takes a card's name and switch", () => {
    const next = applyCards(tricks, [{ ...card(tricks[0]), name: 'Z', on: false }, card(tricks[1])])
    expect(next[0]).toEqual({ ...tricks[0], name: 'Z', enabled: false })
    expect(next[1]).toBe(tricks[1])
  })

  it('drops a trick whose card is gone', () => {
    expect(applyCards(tricks, [card(tricks[1])])).toEqual([tricks[1]])
  })
})
