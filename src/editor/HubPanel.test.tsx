import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HubPanel } from './HubPanel'

describe('HubPanel', () => {
  it('starts an emblem on the kind that was chosen', async () => {
    const onChange = vi.fn()
    render(<HubPanel hub={undefined} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Emblem'), 'emoji')

    expect(onChange).toHaveBeenCalledWith({ emblem: { kind: 'emoji', value: '' } })
  })

  it('keeps the value when the kind changes under it', async () => {
    const onChange = vi.fn()
    render(<HubPanel hub={{ emblem: { kind: 'image', value: '/logo.png' } }} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Emblem'), 'gif')

    expect(onChange).toHaveBeenCalledWith({ emblem: { kind: 'gif', value: '/logo.png' } })
  })

  it('asks for a character or an address depending on the kind', () => {
    const { unmount } = render(
      <HubPanel hub={{ emblem: { kind: 'emoji', value: '🎡' } }} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Character')).toBeInTheDocument()
    unmount()

    render(<HubPanel hub={{ emblem: { kind: 'image', value: '' } }} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Address')).toBeInTheDocument()
  })

  // Absent rather than empty, matching what storage keeps.
  it('clears the hub outright when the last thing on it goes', async () => {
    const onChange = vi.fn()
    render(<HubPanel hub={{ emblem: { kind: 'emoji', value: '🎡' } }} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Emblem'), '')

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('keeps an emblem when only the flag goes', async () => {
    const onChange = vi.fn()
    render(
      <HubPanel
        hub={{ emblem: { kind: 'emoji', value: '🎡' }, spins: true }}
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByLabelText('Turns with the wheel'))

    expect(onChange).toHaveBeenCalledWith({ emblem: { kind: 'emoji', value: '🎡' } })
  })
})
