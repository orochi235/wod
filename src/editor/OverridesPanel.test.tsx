import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ItemOverride } from '../feed/types'
import { OverridesPanel } from './OverridesPanel'

const items = [
  { id: 'ana', label: 'Ana' },
  { id: 'ben', label: 'Ben' },
]

const overrides: Record<string, ItemOverride> = {
  cal: { color: '#00ff00' },
}

/**
 * The panel is controlled, so anything about typing — a caret that stays put, a
 * row that survives being emptied — only shows up with a host that feeds the
 * change back in, exactly as the editor does.
 */
function Hosted({
  seed,
  onChange,
}: {
  seed: Record<string, ItemOverride>
  onChange: (next: Record<string, ItemOverride>) => void
}) {
  const [current, setCurrent] = useState(seed)
  return (
    <OverridesPanel
      items={items}
      overrides={current}
      onChange={(next) => {
        setCurrent(next)
        onChange(next)
      }}
    />
  )
}

describe('OverridesPanel', () => {
  it('lists present items and known absentees separately', () => {
    render(<OverridesPanel items={items} overrides={overrides} onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Present' })).toHaveTextContent('Ana')
    expect(screen.getByRole('group', { name: 'Known' })).toHaveTextContent('cal')
  })

  it('excludes someone', async () => {
    const onChange = vi.fn()
    render(<OverridesPanel items={items} overrides={{}} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Exclude Ana' }))

    expect(onChange).toHaveBeenCalledWith({ ana: { excluded: true } })
  })

  it('keeps an override for someone who is not present', async () => {
    const onChange = vi.fn()
    render(<OverridesPanel items={items} overrides={overrides} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Exclude cal' }))

    expect(onChange).toHaveBeenCalledWith({ cal: { color: '#00ff00', excluded: true } })
  })

  it('deletes an override outright', async () => {
    const onChange = vi.fn()
    render(<OverridesPanel items={items} overrides={overrides} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Forget cal' }))

    expect(onChange).toHaveBeenCalledWith({})
  })

  it('leaves the typed weight on screen while storing the parsed number', () => {
    const onChange = vi.fn()
    render(<Hosted seed={{}} onChange={onChange} />)

    // fireEvent, not userEvent: user-event normalizes a number field's text
    // before the DOM sees it, which is exactly the round-trip under test.
    const weight = screen.getByLabelText('Weight of Ana') as HTMLInputElement
    fireEvent.change(weight, { target: { value: '1.50' } })

    // The value is parsed on the way in but not formatted on the way back out.
    // react-dom compares a number field's value numerically, so 1.5 is not
    // written over "1.50" mid-word — swap this input to a text one and the
    // trailing zero disappears under the caret.
    expect(weight.value).toBe('1.50')
    expect(onChange).toHaveBeenLastCalledWith({ ana: { weight: 1.5 } })
  })

  it('hands a cleared weight back to the feed default', () => {
    const onChange = vi.fn()
    render(<Hosted seed={{ ana: { weight: 4 } }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Weight of Ana'), { target: { value: '' } })

    // Not `{ ana: { weight: undefined } }` and not weight 0: an absent field is
    // how compose is told to fall back.
    expect(onChange).toHaveBeenLastCalledWith({})
  })

  it('keeps an absentee on screen while their weight is retyped', async () => {
    const onChange = vi.fn()
    render(<Hosted seed={{ cal: { weight: 3 } }} onChange={onChange} />)

    // Clearing the field empties cal's override. The row is the only handle the
    // operator has on someone who is not in the room, so it has to survive the
    // keystroke between the old weight and the new one.
    await userEvent.clear(screen.getByLabelText('Weight of cal'))
    expect(screen.getByRole('group', { name: 'Known' })).toHaveTextContent('cal')

    await userEvent.type(screen.getByLabelText('Weight of cal'), '2')

    expect(onChange).toHaveBeenLastCalledWith({ cal: { weight: 2 } })
  })

  it('drops an emptied override for someone who is present', async () => {
    const onChange = vi.fn()
    render(<Hosted seed={{}} onChange={onChange} />)

    const exclude = screen.getByRole('checkbox', { name: 'Exclude Ana' })
    await userEvent.click(exclude)
    await userEvent.click(exclude)

    // Not `{ ana: { excluded: false } }`: an absent field means "use the feed
    // default", and a stored false would park Ana in the Known list forever the
    // moment she leaves. Her row is drawn from the feed, so nothing is lost.
    expect(onChange).toHaveBeenLastCalledWith({})
  })

  it('clears a color override without forgetting the row', async () => {
    const onChange = vi.fn()
    render(<Hosted seed={overrides} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Clear color of cal' }))

    expect(onChange).toHaveBeenLastCalledWith({ cal: {} })
    expect(screen.getByRole('button', { name: 'Clear color of cal' })).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Known' })).toHaveTextContent('cal')
  })

  it('offers no way to clear a color nobody set', () => {
    render(<OverridesPanel items={items} overrides={overrides} onChange={vi.fn()} />)

    // The swatch shows a placeholder for a row with no color override, so the
    // disabled control is what tells the operator the grey is not their choice.
    expect(screen.getByRole('button', { name: 'Clear color of Ana' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear color of cal' })).toBeEnabled()
  })
})
