import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Transport, type TransportProps } from './Transport'

const props: TransportProps = {
  durationMs: 20_000,
  valueMs: 0,
  isSpinning: false,
  showScrub: true,
  onSpin: () => undefined,
  onScrub: () => undefined,
}

describe('Transport', () => {
  it('spans the whole show from zero', () => {
    render(<Transport {...props} />)
    const slider = screen.getByLabelText(/scrub/i)
    expect(slider).toHaveValue('0')
    expect(slider).toHaveAttribute('max', '20000')
  })

  it('reports the instant scrubbed to, in ms', () => {
    const onScrub = vi.fn()
    render(<Transport {...props} onScrub={onScrub} />)
    // A range input cannot be typed into; set the value and fire the change.
    fireEvent.change(screen.getByLabelText(/scrub/i), { target: { value: '2500' } })
    expect(onScrub).toHaveBeenCalledWith(2500)
  })

  it('reads out the instant in seconds', () => {
    render(<Transport {...props} valueMs={12_400} />)
    expect(screen.getByText('12.40 s')).toBeInTheDocument()
  })

  it('triggers a spin', async () => {
    const onSpin = vi.fn()
    render(<Transport {...props} onSpin={onSpin} />)
    await userEvent.click(screen.getByRole('button', { name: /spin/i }))
    expect(onSpin).toHaveBeenCalled()
  })

  it('hides the scrubber when there is nothing to spin', () => {
    render(<Transport {...props} durationMs={0} />)
    expect(screen.queryByLabelText(/scrub/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /spin/i })).toBeInTheDocument()
  })

  it('withholds the scrubber when the caller says so', () => {
    // Dragging it replays the rig on demand, which gives away more than the
    // panels the locked editor hides.
    render(<Transport {...props} showScrub={false} />)
    expect(screen.queryByLabelText(/scrub/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /spin/i })).toBeInTheDocument()
  })

  it('disables the scrubber while a spin is running', () => {
    render(<Transport {...props} isSpinning />)
    expect(screen.getByLabelText(/scrub/i)).toBeDisabled()
  })
})
