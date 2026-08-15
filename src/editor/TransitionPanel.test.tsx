import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fade } from '../transition/transitions/fade'
import type { Transition } from '../transition/types'
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

  it('arms a transition for departing wedges', async () => {
    const onChange = vi.fn()
    render(<TransitionPanel transitions={undefined} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Wedges leaving'), 'shrink')

    expect(onChange).toHaveBeenCalledWith({
      exit: { id: 'shrink', params: expect.objectContaining({ durationMs: 500 }) },
    })
  })

  it('keeps the other moment when one is disarmed', async () => {
    const onChange = vi.fn()
    const armed = {
      enter: { id: 'fade' as const, params: {} },
      exit: { id: 'fade' as const, params: {} },
    }
    render(<TransitionPanel transitions={armed} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('Wedges leaving'), '')

    expect(onChange).toHaveBeenCalledWith({ enter: { id: 'fade', params: {} } })
  })

  it('offers only transitions that serve the moment', () => {
    render(<TransitionPanel transitions={undefined} onChange={vi.fn()} />)
    const options = [...screen.getByLabelText('Wedges leaving').querySelectorAll('option')]
    expect(options.map((option) => option.value)).toEqual(['', 'fade', 'fly', 'shrink'])
  })

  // Every registered transition serves both membership moments, so the test
  // above passes with the filter deleted. A stand-in registry is the only way
  // to hold the rule until a moment-restricted transition exists.
  it('leaves out a transition that does not serve the moment', async () => {
    vi.resetModules()
    const enterOnly: Transition = { ...fade, moments: ['enter'] }
    vi.doMock('../transition/registry', () => ({
      TRANSITION_LIST: [enterOnly],
      getTransition: (id: string) => (id === enterOnly.id ? enterOnly : null),
    }))
    const { TransitionPanel: Panel } = await import('./TransitionPanel')

    render(<Panel transitions={undefined} onChange={vi.fn()} />)

    expect([...screen.getByLabelText('Wedges arriving').querySelectorAll('option')]).toHaveLength(2)
    expect([...screen.getByLabelText('Wedges leaving').querySelectorAll('option')]).toHaveLength(1)
    vi.doUnmock('../transition/registry')
  })

  // Every field row is labeled the same in both moments, so an edit landing on
  // the wrong one is invisible on screen and green under the tests above.
  it('edits the fields of the moment they belong to', async () => {
    const onChange = vi.fn()
    const armed = { exit: { id: 'shrink' as const, params: { durationMs: 500 } } }
    render(<TransitionPanel transitions={armed} onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('Duration (ms)'), '0')

    expect(onChange).toHaveBeenLastCalledWith({
      exit: { id: 'shrink', params: { durationMs: 5000 } },
    })
  })
})
