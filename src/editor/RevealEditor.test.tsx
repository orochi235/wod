import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RevealEditor } from './RevealEditor'

describe('RevealEditor', () => {
  it('offers to add a reveal when there is none', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={undefined} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add reveal to Alex' }))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('edits the headline', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{}} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Reveal headline for Alex'), 'H')
    expect(onChange).toHaveBeenCalledWith({ headline: 'H' })
  })

  it('clears a field back to absent rather than storing an empty string', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{ headline: 'H' }} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Reveal headline for Alex'))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('writes media as a kind and value pair', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{}} onChange={onChange} />)
    // A BMP character, not an emoji: userEvent types code unit by code unit and
    // would split a surrogate pair mid-write.
    await userEvent.type(screen.getByLabelText('Reveal media value for Alex'), '★')
    expect(onChange).toHaveBeenCalledWith({ media: { kind: 'emoji', value: '★' } })
  })

  it('drops media when its value is emptied', async () => {
    const onChange = vi.fn()
    render(
      <RevealEditor
        name="Alex"
        reveal={{ media: { kind: 'emoji', value: '🍺' } }}
        onChange={onChange}
      />,
    )
    await userEvent.clear(screen.getByLabelText('Reveal media value for Alex'))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('changes the media kind while keeping the value', async () => {
    const onChange = vi.fn()
    render(
      <RevealEditor
        name="Alex"
        reveal={{ media: { kind: 'emoji', value: 'x.gif' } }}
        onChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Reveal media kind for Alex'), 'gif')
    expect(onChange).toHaveBeenCalledWith({ media: { kind: 'gif', value: 'x.gif' } })
  })

  it('removes the whole reveal', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{ headline: 'H' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove reveal from Alex' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('keeps an emptied reveal, since a bare reveal still shows the label', async () => {
    const onChange = vi.fn()
    render(<RevealEditor name="Alex" reveal={{ headline: 'H' }} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText('Reveal headline for Alex'))
    // {} not undefined: emptying the fields is not the same as removing it.
    expect(onChange).toHaveBeenCalledWith({})
  })
})
