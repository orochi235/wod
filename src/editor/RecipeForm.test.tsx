import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { wedgeIndexOf } from '../compose/compose'
import { recolor } from '../tricks/recipes/recolor'
import { takeover } from '../tricks/recipes/takeover'
import type { TrickParams } from '../tricks/types'
import type { Segment } from '../wheel/types'
import { RecipeForm } from './RecipeForm'

const segments: Segment[] = [{ id: 'ana', label: 'Ana', weight: 1 }]

/**
 * Same controlled-input gotcha SegmentList.test.tsx hits: a bare `vi.fn()`
 * onChange never re-renders, so React DOM restores the input's DOM value from
 * the stale `value` prop after each keystroke batch. Feed onChange back into
 * state so typed text actually accumulates.
 */
function ControlledRecipeForm({
  initialParams,
  onChangeSpy,
}: {
  initialParams: TrickParams
  onChangeSpy: (params: TrickParams) => void
}) {
  const [params, setParams] = useState(initialParams)
  return (
    <RecipeForm
      fields={takeover.fields}
      params={params}
      segments={segments}
      onChange={(next) => {
        onChangeSpy(next)
        setParams(next)
      }}
    />
  )
}

describe('RecipeForm', () => {
  it('renders a control per recipe field', () => {
    render(
      <RecipeForm
        fields={takeover.fields}
        params={takeover.defaults}
        segments={segments}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Wedge label')).toBeInTheDocument()
    expect(screen.getByLabelText('Holds until')).toBeInTheDocument()
    expect(screen.getByLabelText('Final share')).toBeInTheDocument()
  })

  it('reports a text change', async () => {
    const onChange = vi.fn()
    render(<ControlledRecipeForm initialParams={takeover.defaults} onChangeSpy={onChange} />)
    const input = screen.getByLabelText('Wedge label')
    await userEvent.clear(input)
    await userEvent.type(input, 'X')
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ wedgeLabel: 'X' })
  })

  it('reports a slider change as a number', () => {
    const onChange = vi.fn()
    render(
      <RecipeForm
        fields={takeover.fields}
        params={takeover.defaults}
        segments={segments}
        onChange={onChange}
      />,
    )
    // SliderRow's wrapping <label> also contains an editable text readout,
    // which sits before the range input in DOM order — jsdom associates a
    // wrapping label with only the first labelable descendant, so a plain
    // getByLabelText('Final share') resolves to the readout, not the slider.
    // The `selector` option steers the match to the actual range input. A
    // range input cannot be typed into; set the value and fire the change.
    const slider = screen.getByLabelText('Final share', { selector: 'input[type="range"]' })
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(onChange.mock.calls.at(-1)?.[0].endShare).toBe(0.5)
  })

  it('lists the current segments in a segments field', () => {
    render(
      <RecipeForm
        fields={recolor.fields}
        params={recolor.defaults}
        segments={segments}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument()
  })

  it('offers the selectors in their own group, above the wedges', () => {
    // Grouped, not just listed: a wedge someone labeled "All roster wedges"
    // would otherwise be indistinguishable from the selector of that name.
    render(
      <RecipeForm
        fields={recolor.fields}
        params={recolor.defaults}
        segments={segments}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('option', { name: 'All roster wedges' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Selectors' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Wedges' })).toBeInTheDocument()
  })

  it('writes a single-wedge field as a bare id the recipe accepts', async () => {
    // The whole point of the field kind: takeover reads wedgeSegmentId with
    // readString, so a multi-select writing ['ana'] left validate() reporting
    // "no wedge chosen" whatever the operator picked.
    const onChange = vi.fn()
    const params = { ...takeover.defaults, wedgeMode: 'existing' }
    render(
      <RecipeForm
        fields={takeover.fields}
        params={params}
        segments={segments}
        onChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Existing wedge'), 'ana')

    const next = onChange.mock.calls.at(-1)?.[0]
    expect(next?.wedgeSegmentId).toBe('ana')
    expect(takeover.validate(next as TrickParams, wedgeIndexOf(segments))).toBeNull()
  })

  it('leaves a single-wedge field unchosen rather than defaulting to a wedge', () => {
    // '' is a real state: takeover.validate reports "no wedge chosen" for it,
    // and an operator who switched to 'existing' has not chosen yet.
    render(
      <RecipeForm
        fields={takeover.fields}
        params={{ ...takeover.defaults, wedgeMode: 'existing' }}
        segments={segments}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Existing wedge')).toHaveValue('')
  })

  it('renders from a bare field list, with no recipe in sight', () => {
    const onChange = vi.fn()
    render(
      <RecipeForm
        fields={[{ key: 'staggerMs', label: 'Stagger (ms)', kind: 'number', min: 0 }]}
        params={{ staggerMs: 40 }}
        segments={[]}
        onChange={onChange}
      />,
    )
    expect(screen.getByLabelText('Stagger (ms)')).toHaveValue(40)
  })
})
