import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransitionPanel } from './TransitionPanel'

describe('TransitionPanel', () => {
  it('starts at none, which is the behavior that predates transitions', () => {
    render(<TransitionPanel transitions={undefined} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Wedges arriving')).toHaveValue('')
  })

  it('arms a transition with its defaults', async () => {
    const onChange = vi.fn()
    render(<TransitionPanel transitions={undefined} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), 'fly')
    expect(onChange).toHaveBeenCalledWith({
      enter: { id: 'fly', params: expect.objectContaining({ distance: 1.6 }) },
    })
  })

  it('shows the armed transition fields', () => {
    render(
      <TransitionPanel transitions={{ enter: { id: 'fly', params: {} } }} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Distance (radii)')).toBeInTheDocument()
  })

  it('disarms back to none', async () => {
    const onChange = vi.fn()
    render(
      <TransitionPanel transitions={{ enter: { id: 'fade', params: {} } }} onChange={onChange} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), '')
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('keeps another moment when arming a different transition', async () => {
    const onChange = vi.fn()
    const transitions = {
      enter: { id: 'fade' as const, params: {} },
      spin: { id: 'fly' as const, params: {} },
    }
    render(<TransitionPanel transitions={transitions} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), 'fly')
    expect(onChange).toHaveBeenCalledWith({
      spin: { id: 'fly', params: {} },
      enter: { id: 'fly', params: expect.objectContaining({ distance: 1.6 }) },
    })
  })

  it('keeps another moment when disarming, but drops to undefined when nothing is left', async () => {
    const onChange = vi.fn()
    const transitions = {
      enter: { id: 'fade' as const, params: {} },
      spin: { id: 'fly' as const, params: {} },
    }
    render(<TransitionPanel transitions={transitions} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), '')
    expect(onChange).toHaveBeenCalledWith({ spin: { id: 'fly', params: {} } })
    cleanup()

    render(
      <TransitionPanel transitions={{ enter: { id: 'fade', params: {} } }} onChange={onChange} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Wedges arriving'), '')
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })
})
