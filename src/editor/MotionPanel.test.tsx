import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Motion } from '../preset/types'
import { MotionPanel } from './MotionPanel'

const motion: Motion = {
  durationMs: 4500,
  turns: 6,
  direction: 'cw',
  easing: [0.1, 0.8, 0.2, 1],
}

/**
 * Feeds each edit back, so a backspace-then-retype sequence runs against the
 * `motion` the previous keystroke actually produced, the way it does under
 * the real editor — a static `motion` prop never changes identity, and the
 * hazard these tests target only shows up across renders.
 */
function Harness({
  initialMotion,
  onChange = () => undefined,
}: {
  initialMotion: Motion
  onChange?: (motion: Motion) => void
}) {
  const [current, setCurrent] = useState(initialMotion)
  return (
    <MotionPanel
      motion={current}
      onChange={(next) => {
        setCurrent(next)
        onChange(next)
      }}
    />
  )
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

  it('keeps a backspaced curve when the settle is retyped', async () => {
    // The clear alone drops `settle` from the motion the panel is holding, so
    // the curve has to survive somewhere other than that prop.
    const onChange = vi.fn()
    const bouncy: Motion = { ...motion, settle: { ms: 900, curve: [0.33, 1.4, 0.68, 1] } }
    render(<Harness initialMotion={bouncy} onChange={onChange} />)

    const settle = screen.getByLabelText('Settle (ms)')
    await userEvent.clear(settle)
    await userEvent.type(settle, '400')

    expect(onChange).toHaveBeenLastCalledWith({
      ...motion,
      settle: { ms: 400, curve: [0.33, 1.4, 0.68, 1] },
    })
  })

  it('does not lose the curve to a value Number.parseInt could not read', async () => {
    // A bare '-' never reaches the handler as non-empty: `<input type="number">`
    // sanitizes any value that isn't itself a valid number down to '' before a
    // change event fires at all, in jsdom and in real browsers alike. A
    // leading-dot number like '.5' is the value that actually exercises the
    // gap — `Number.parseInt('.5', 10)` is NaN, which the old handler read as
    // an empty field and used to clear the settle and its curve.
    const onChange = vi.fn()
    const withSettle: Motion = { ...motion, settle: { ms: 900, curve: [0.33, 1, 0.68, 1] } }
    const user = userEvent.setup()
    render(<Harness initialMotion={withSettle} onChange={onChange} />)

    const settle = screen.getByLabelText('Settle (ms)')
    await user.click(settle)
    await user.keyboard('{Control>}a{/Control}')
    await user.paste('.5')

    expect(onChange).toHaveBeenLastCalledWith({
      ...motion,
      settle: { ms: 0.5, curve: [0.33, 1, 0.68, 1] },
    })
  })
})
