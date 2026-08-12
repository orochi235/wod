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
        showScrub={true}
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
        showScrub={true}
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
        showScrub={true}
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
        showScrub={true}
        isSpinning={false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /spin/i }))
    expect(onSpin).toHaveBeenCalled()
  })

  it('hides the scrubber when no morph would move', () => {
    // A slider that cannot move anything reads as broken, and in the locked
    // editor — where no trick can be enabled — that is the only state it has.
    render(
      <Transport
        segments={segments}
        morphs={[]}
        durationMs={1000}
        onSpin={vi.fn()}
        showScrub={true}
        isSpinning={false}
      />,
    )
    expect(screen.queryByLabelText(/scrub/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /spin/i })).toBeInTheDocument()
  })

  it('withholds the scrubber when the caller says so, armed morphs and all', () => {
    // Dragging it replays the rig on demand, which gives away more than the
    // panels the locked editor hides.
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        showScrub={false}
        isSpinning={false}
      />,
    )
    expect(screen.queryByLabelText(/scrub/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /spin/i })).toBeInTheDocument()
  })

  it('hands back unmorphed geometry when the last morph goes away', () => {
    // Hiding the slider must not stop the reporting: the parent renders
    // whatever it last heard, so a scrubbed frame would otherwise outlive the
    // trick that produced it and freeze the wheel mid-morph.
    const scrubbed: Segment[][] = []
    const props = {
      segments,
      durationMs: 1000,
      onSpin: vi.fn(),
      showScrub: true,
      isSpinning: false,
      onScrub: (next: Segment[]) => scrubbed.push(next),
    }
    const { rerender } = render(<Transport {...props} morphs={morphs} />)
    fireEvent.change(screen.getByLabelText(/scrub/i), { target: { value: '1' } })
    expect(scrubbed.at(-1)).not.toEqual(segments)

    rerender(<Transport {...props} morphs={[]} />)

    expect(scrubbed.at(-1)).toEqual(segments)
  })

  it('disables the scrubber while a spin is running', () => {
    render(
      <Transport
        segments={segments}
        morphs={morphs}
        durationMs={1000}
        onSpin={vi.fn()}
        showScrub={true}
        isSpinning
      />,
    )
    expect(screen.getByLabelText(/scrub/i)).toBeDisabled()
  })
})
