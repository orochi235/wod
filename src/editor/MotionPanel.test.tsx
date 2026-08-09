import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Motion } from '../preset/types'
import { MotionPanel } from './MotionPanel'

const motion: Motion = {
  durationMs: 4500,
  turns: 6,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
}

describe('MotionPanel', () => {
  it('renders a control per field', () => {
    render(<MotionPanel motion={motion} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Duration (ms)')).toHaveValue(4500)
    expect(screen.getByLabelText('Turns')).toHaveValue(6)
    expect(screen.getByLabelText('Direction')).toHaveValue('cw')
    expect(screen.getByLabelText('Settle (ms)')).toHaveValue(null)
  })

  it('writes numbers, not strings', () => {
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '30000' } })
    expect(onChange).toHaveBeenCalledWith({ ...motion, durationMs: 30000 })
  })

  it('turns the wheel the other way', async () => {
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'ccw')
    expect(onChange).toHaveBeenCalledWith({ ...motion, direction: 'ccw' })
  })

  it('starts a settle on the default curve', () => {
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '900' } })
    expect(onChange).toHaveBeenCalledWith({
      ...motion,
      settle: { ms: 900, curve: [0.33, 1, 0.68, 1] },
    })
  })

  it('keeps the authored curve when only the length changes', () => {
    const onChange = vi.fn()
    const bouncy: Motion = { ...motion, settle: { ms: 900, curve: [0.33, 1.4, 0.68, 1] } }
    render(<MotionPanel motion={bouncy} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Settle (ms)'), { target: { value: '400' } })
    expect(onChange).toHaveBeenCalledWith({
      ...motion,
      settle: { ms: 400, curve: [0.33, 1.4, 0.68, 1] },
    })
  })

  it('clears the settle entirely when the field is emptied', async () => {
    // Absent, not zero. Zero stops the wheel dead from full speed; absent runs
    // the ordinary single-curve rotation, which is a different animation.
    const onChange = vi.fn()
    render(
      <MotionPanel
        motion={{ ...motion, settle: { ms: 900, curve: [0.33, 1, 0.68, 1] } }}
        onChange={onChange}
      />,
    )
    await userEvent.clear(screen.getByLabelText('Settle (ms)'))
    expect(onChange).toHaveBeenLastCalledWith(motion)
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty('settle')
  })

  it('refuses a negative duration rather than handing one to the animator', () => {
    // Element.animate() throws synchronously on a negative duration.
    const onChange = vi.fn()
    render(<MotionPanel motion={motion} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '-100' } })
    expect(onChange).toHaveBeenCalledWith({ ...motion, durationMs: 1 })
  })
})
