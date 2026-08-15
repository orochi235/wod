import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Wheel } from './Wheel'
import type { Segment } from './types'

const segments: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1, color: '#ff0000' },
  { id: 'b', label: 'Ben', weight: 1, color: '#00ff00' },
]

describe('Wheel', () => {
  it('renders one path per weighted segment', () => {
    const { container } = render(<Wheel segments={segments} />)
    expect(container.querySelectorAll('path.wheel__segment')).toHaveLength(2)
  })

  it('renders segment labels', () => {
    render(<Wheel segments={segments} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Ben')).toBeInTheDocument()
  })

  it('applies segment color as a fill attribute rather than an inline style', () => {
    const { container } = render(<Wheel segments={segments} />)
    const first = container.querySelector('path.wheel__segment')
    expect(first?.getAttribute('fill')).toBe('#ff0000')
    expect(first?.getAttribute('style')).toBeNull()
  })

  it('omits zero-weight segments entirely', () => {
    const withGhost: Segment[] = [...segments, { id: 'ghost', label: 'hidden', weight: 0 }]
    const { container } = render(<Wheel segments={withGhost} />)
    expect(container.querySelectorAll('path.wheel__segment')).toHaveLength(2)
    expect(screen.queryByText('hidden')).not.toBeInTheDocument()
  })

  it('renders a single full-weight segment as one full ring', () => {
    const solo: Segment[] = [
      { id: 'beer', label: 'free beer', weight: 1 },
      { id: 'a', label: 'Ana', weight: 0 },
    ]
    const { container } = render(<Wheel segments={solo} />)
    const paths = container.querySelectorAll('path.wheel__segment')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('d')).not.toBe('')
  })

  it('applies rotation to the wheel group', () => {
    const { container } = render(<Wheel segments={segments} rotationDeg={90} />)
    expect(container.querySelector('g.wheel__rotor')?.getAttribute('transform')).toBe('rotate(90)')
  })

  it('renders nothing spinnable when there are no segments', () => {
    const { container } = render(<Wheel segments={[]} />)
    expect(container.querySelectorAll('path.wheel__segment')).toHaveLength(0)
  })

  it('gives every wedge the same handedness, whatever half it sits on', () => {
    const four: Segment[] = ['n', 'e', 's', 'w'].map((id) => ({
      id,
      label: id.toUpperCase(),
      weight: 1,
      slice: { id: 'radial' as const, params: {} },
    }))
    const { container } = render(<Wheel segments={four} />)
    const transforms = [...container.querySelectorAll('text.wheel__label')].map(
      (t) => t.getAttribute('transform') ?? '',
    )
    expect(transforms).toHaveLength(4)
    // A per-position flip is what makes a label's orientation depend on who
    // else is on the wheel, which a live roster changes constantly.
    expect(transforms.every((t) => t.endsWith('rotate(-90)'))).toBe(true)
  })

  it('draws a label through the resolved layout', () => {
    const { container } = render(
      <Wheel segments={[{ id: 'a', label: 'Willie Dustice', weight: 1 }]} />,
    )
    expect(container.textContent).toContain('Willie Dustice')
  })

  it('honors a per-segment layout override', () => {
    const { container } = render(
      <Wheel
        segments={[
          { id: 'a', label: 'Todd Bonzalez', weight: 1, slice: { id: 'radial', params: {} } },
        ]}
      />,
    )
    expect(container.querySelector('textPath')).toBeNull()
  })

  it('resolves layouts against layoutFrom when given one', () => {
    const drawn: Segment[] = [
      { id: 'a', label: 'Scott Dourque', weight: 0.02 },
      { id: 'b', label: 'Shown Furcotte', weight: 100 },
    ]
    const settled: Segment[] = [
      { id: 'a', label: 'Scott Dourque', weight: 1 },
      { id: 'b', label: 'Shown Furcotte', weight: 1 },
    ]
    const { container } = render(<Wheel segments={drawn} layoutFrom={settled} />)
    expect(container.textContent).toContain('Scott Dourque')
  })

  it('tags each wedge with its segment id, so a transition can find it', () => {
    const { container } = render(
      <Wheel
        segments={[
          { id: 'ana', label: 'Ana', weight: 1 },
          { id: 'ben', label: 'Ben', weight: 1 },
        ]}
      />,
    )
    expect(container.querySelector('[data-segment-id="ana"]')).not.toBeNull()
    expect(container.querySelector('[data-segment-id="ben"]')).not.toBeNull()
  })

  it('wraps the rotor in a stage, so a wheel-scope transform never fights the rotation', () => {
    const { container } = render(<Wheel segments={[{ id: 'ana', label: 'Ana', weight: 1 }]} />)
    const stage = container.querySelector('.wheel__stage')
    expect(stage?.querySelector('.wheel__rotor')).not.toBeNull()
  })
})
