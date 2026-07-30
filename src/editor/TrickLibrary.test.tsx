import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Conflict } from '../tricks/conflicts'
import type { Trick } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { TrickLibrary, reorder } from './TrickLibrary'

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
    expect(screen.getByText('slow burn')).toBeInTheDocument()
    expect(screen.getByText('ana goes')).toBeInTheDocument()
  })

  it('shows the structural recipe name alongside it', () => {
    renderLibrary()
    // The same recipe name also appears as an <option> in the "Add a trick"
    // catalog select further down the panel, so a bare getByText would match
    // two elements. Scope to the card's own recipe badge.
    expect(
      screen.getByText(/One wedge swallows the wheel/, { selector: '.trick-card__recipe' }),
    ).toBeInTheDocument()
  })

  it('toggles a trick', async () => {
    const props = renderLibrary()
    await userEvent.click(screen.getByRole('checkbox', { name: /enable slow burn/i }))
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
    // EffectCard labels every remove button "Remove"; the first card is beer.
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(props.onChange).toHaveBeenCalledWith([tricks[1]])
  })

  it('renders the param form only for the expanded trick', () => {
    // EffectCard renders its body only when expanded, and defaultExpandedIds
    // comes from selectedId — so the unselected trick's fields stay unmounted.
    // `vanish` (the unselected 'v' trick) has its own "Wedges" field, so
    // checking for its absence — not just an unrelated recipe's field —
    // actually proves the collapsed card's form never mounted.
    renderLibrary({ selectedId: 'beer' })
    expect(screen.getByLabelText('Wedge label')).toBeInTheDocument()
    expect(screen.queryByLabelText('New label')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Wedges')).not.toBeInTheDocument()
  })

  it('renames a trick', async () => {
    const onChange = vi.fn()
    render(<ControlledTrickLibrary initialTricks={tricks} onChangeSpy={onChange} />)
    const input = screen.getByLabelText('Rename slow burn')
    await userEvent.clear(input)
    await userEvent.type(input, 'Z')
    const last = onChange.mock.calls.at(-1)?.[0] as Trick[]
    expect(last[0].name).toBe('Z')
  })

  it('badges a trick that shares a write with another', () => {
    renderLibrary({
      conflicts: [{ segmentId: 'ana', property: 'weight', trickIds: ['beer', 'v'] }],
    })
    expect(screen.getByRole('status', { name: /slow burn conflicts/i })).toHaveTextContent('ana')
  })
})

describe('reorder', () => {
  it('moves a trick after another', () => {
    expect(reorder(tricks, 'beer', 'v', 'after').map((trick) => trick.id)).toEqual(['v', 'beer'])
  })

  it('moves a trick before another', () => {
    expect(reorder(tricks, 'v', 'beer', 'before').map((trick) => trick.id)).toEqual(['v', 'beer'])
  })

  it('leaves the list alone when the source is unknown', () => {
    expect(reorder(tricks, 'ghost', 'v', 'after')).toEqual(tricks)
  })
})
