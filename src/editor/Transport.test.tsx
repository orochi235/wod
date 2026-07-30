import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { applyMorphs } from '../wheel/morph'
import type { Morph, Segment } from '../wheel/types'
import { Transport } from './Transport'

const segments: Segment[] = [
  { id: 'ana', label: 'Ana', weight: 1 },
  { id: 'beer', label: 'free beer', weight: 0 },
]

const morphs: Morph[] = [
  {
    segmentId: 'beer',
    durationMs: 1000,
    keyframes: [
      { at: 0, weight: 0 },
      { at: 1, weight: 4 },
    ],
  },
]

describe('Transport', () => {
  it('starts parked at zero', () => {
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        isSpinning={false}
      />,
    )
    expect(screen.getByLabelText(/scrub/i)).toHaveValue('0')
  })

  it('reports the scrubbed segments to its child', () => {
    const scrubbed: Segment[][] = []
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        isSpinning={false}
        onScrub={(next) => scrubbed.push(next)}
      />,
    )
    // A range input cannot be typed into; set the value and fire the change.
    fireEvent.change(screen.getByLabelText(/scrub/i), { target: { value: '0.5' } })
    expect(scrubbed.at(-1)).toEqual(applyMorphs(segments, morphs, 500))
  })

  it('reports the same geometry a real spin would show at that instant', () => {
    // The invariant the scrubber exists to preserve: preview geometry is the
    // same function a real spin uses, sampled at a fixed instant. Driven
    // through the component, since asserting on applyMorphs alone would pass
    // no matter what Transport did with it.
    const scrubbed: Segment[][] = []
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        isSpinning={false}
        onScrub={(next) => scrubbed.push(next)}
      />,
    )

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      fireEvent.change(screen.getByLabelText(/scrub/i), { target: { value: String(t) } })
      expect(scrubbed.at(-1)).toEqual(applyMorphs(segments, morphs, t * 1000))
    }
  })

  it('triggers a spin', async () => {
    const onSpin = vi.fn()
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={onSpin}
        isSpinning={false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /spin/i }))
    expect(onSpin).toHaveBeenCalled()
  })

  it('disables the scrubber while a spin is running', () => {
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        isSpinning
      />,
    )
    expect(screen.getByLabelText(/scrub/i)).toBeDisabled()
  })
})
