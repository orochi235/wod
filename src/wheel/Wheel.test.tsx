import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SliceInstance } from '../slice/types'
import { Wheel } from './Wheel'
import { flat } from './themes/flat'
import { wof } from './themes/wof'
import type { Segment } from './types'

const segments: Segment[] = [
  { id: 'a', label: 'Ana', weight: 1, color: '#ff0000' },
  { id: 'b', label: 'Ben', weight: 1, color: '#00ff00' },
]

/**
 * A hand-pumped rAF clock, so a test can watch a transition mid-flight rather
 * than only on the frame it starts. Mirrors the one in usePresence.test.tsx,
 * which exists for the same reason.
 */
function installClock() {
  const queue = new Map<number, FrameRequestCallback>()
  let next = 1
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = next++
    queue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id)
  })
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)

  return {
    advance(ms: number) {
      now += ms
      const due = [...queue.entries()]
      queue.clear()
      act(() => {
        for (const [, cb] of due) cb(now)
      })
    },
    restore() {
      vi.unstubAllGlobals()
      clock.mockRestore()
    },
  }
}

/**
 * One label for every wedge, so two wedges of equal arc fit identically and a
 * test can compare them. Stay at five wedges or more: "Cal Whitmore" saturates
 * the `maxSize` cap of 26 anywhere above about a fifth of the wheel, and two
 * clamped sizes match however wrong the arc feeding them was.
 */
const roster = (ids: string[]): Segment[] =>
  ids.map((id) => ({ id, label: 'Cal Whitmore', weight: 1 }))

/** Arriving and leaving both animate the arc, which is what moves a fit. */
const opening = {
  enter: { id: 'shrink' as const, params: { durationMs: 400, staggerMs: 0 } },
  exit: { id: 'shrink' as const, params: { durationMs: 400, staggerMs: 0 } },
}

const labelSize = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-segment-id="${id}"] text.wheel__label`)?.getAttribute('font-size')

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

  it('fits a label against the layout arc, not the arc it is drawn at', () => {
    const clock = installClock()
    try {
      // Five at rest, then a sixth joins: only the newcomer's arc is moving, so
      // its layout arc (a sixth of the wheel, fitting at 18.88) and its presence
      // arc (0.5/5.5 of it, halfway through a shrink, fitting at 10.29)
      // disagree, and neither is near the size cap that would hide the gap.
      const { container, rerender } = render(
        <Wheel segments={roster(['ana', 'ben', 'cy', 'dee', 'eli'])} transitions={opening} />,
      )
      clock.advance(1000)

      rerender(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli', 'cal'])}
          transitions={opening}
        />,
      )
      clock.advance(200)

      expect(labelSize(container, 'cal')).toBe('18.88')
      expect(labelSize(container, 'ana')).toBe('18.88')
    } finally {
      clock.restore()
    }
  })

  it('keeps a departing wedge on the layout arc it last had', () => {
    const clock = installClock()
    try {
      const { container, rerender } = render(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli', 'cal'])}
          transitions={opening}
        />,
      )
      clock.advance(1000)
      expect(labelSize(container, 'cal')).toBe('18.88')

      rerender(
        <Wheel segments={roster(['ana', 'ben', 'cy', 'dee', 'eli'])} transitions={opening} />,
      )
      clock.advance(200)

      // Gone from the roster, so there is no layout arc to look up — only the
      // one it had while it was still on the wheel.
      expect(container.querySelector('[data-segment-id="cal"]')).not.toBeNull()
      expect(labelSize(container, 'cal')).toBe('18.88')
      // The survivors have grown to a fifth each, so 18.88 is a size nothing
      // else on the wheel now holds.
      expect(labelSize(container, 'ana')).toBe('22.65')
    } finally {
      clock.restore()
    }
  })

  it('registers a level element at its layout angle, not the one it is passing through', () => {
    const clock = installClock()
    try {
      const level: SliceInstance = { id: 'auto', params: { frame: 'level' } }
      const seen = new Map<string, number>()
      const levelRef = (id: string, restingDeg: number) => {
        seen.set(id, restingDeg)
        return () => undefined
      }

      const { rerender } = render(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli'])}
          slice={level}
          levelRef={levelRef}
          transitions={opening}
        />,
      )
      clock.advance(1000)

      rerender(
        <Wheel
          segments={roster(['ana', 'ben', 'cy', 'dee', 'eli', 'cal'])}
          slice={level}
          levelRef={levelRef}
          transitions={opening}
        />,
      )
      clock.advance(200)

      // Sixth of six: the last sixth of the wheel, centred at 330°. Drawn at
      // half its arc it is centred near 344°, which is what it must not report.
      expect(seen.get('cal')).toBeCloseTo(-330)
    } finally {
      clock.restore()
    }
  })
})

describe('parts', () => {
  it('draws no new part under the flat look', () => {
    const { container } = render(<Wheel segments={segments} theme={flat} />)
    expect(container.querySelector('.wheel__rim')).toBeNull()
    expect(container.querySelector('.wheel__hub')).toBeNull()
    expect(container.querySelector('.wheel__sheen')).toBeNull()
  })

  it('points at the winner with the notch under the flat look', () => {
    const { container } = render(<Wheel segments={segments} theme={flat} />)
    expect(container.querySelectorAll('.wheel__pointer')).toHaveLength(1)
    expect(container.querySelectorAll('.wheel__flapper')).toHaveLength(0)
  })

  // Both name the winner, so a look that hangs a flapper drops the notch.
  it('points at the winner with the flapper instead under a look that has one', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelectorAll('.wheel__flapper')).toHaveLength(1)
    expect(container.querySelectorAll('.wheel__pointer')).toHaveLength(0)
  })

  it('casts a shadow only for a look that asks for one', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelector('.wheel__body--shadow')).not.toBeNull()

    const flatWheel = render(<Wheel segments={segments} theme={flat} />)
    expect(flatWheel.container.querySelector('.wheel__body--shadow')).toBeNull()
  })

  it('draws the machinery under a look that asks for it', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelector('.wheel__rim')).not.toBeNull()
    expect(container.querySelector('.wheel__face')).not.toBeNull()
    expect(container.querySelector('.wheel__hub')).not.toBeNull()
    expect(container.querySelector('.wheel__sheen')).not.toBeNull()
  })

  it("puts the rim outside the face by the look's own metric", () => {
    const { container } = render(<Wheel segments={segments} radius={200} theme={wof} />)
    const rim = container.querySelector('.wheel__rim')
    expect(rim?.getAttribute('r')).toBe(String(200 + wof.metrics.rimWidth))
  })

  it("sets the look's tokens on the wheel root", () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    const svg = container.querySelector('.wheel') as SVGElement
    expect(svg.style.getPropertyValue('--wheel-rim-fill')).toBe('url(#wheel-gold)')
  })

  it('defaults to the flat look with no theme at all', () => {
    const { container } = render(<Wheel segments={segments} />)
    expect(container.querySelector('.wheel__rim')).toBeNull()
  })

  it('puts one peg on each wedge boundary', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelectorAll('.wheel__peg')).toHaveLength(2)
  })

  it('follows the roster as it grows', () => {
    const three = [...segments, { id: 'cy', label: 'Cy', weight: 1 }]
    const { container } = render(<Wheel segments={three} theme={wof} />)
    expect(container.querySelectorAll('.wheel__peg')).toHaveLength(3)
  })

  it('spaces a fixed count evenly instead, when a look asks for that', () => {
    const fixed = { ...wof, pegs: { kind: 'fixed' as const, count: 8 } }
    const { container } = render(<Wheel segments={segments} theme={fixed} />)
    expect(container.querySelectorAll('.wheel__peg')).toHaveLength(8)
  })

  it('draws a panel and a divider inside each wedge', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    const wedge = container.querySelector('.wheel__wedge')
    expect(wedge?.querySelector('.wheel__panel')).not.toBeNull()
    expect(wedge?.querySelector('.wheel__divider')).not.toBeNull()
  })

  it('strokes every seam after both of the wedges it separates', () => {
    const three = [...segments, { id: 'cy', label: 'Cy', weight: 1 }]
    const { container } = render(<Wheel segments={three} theme={wof} />)
    const painted = [...container.querySelectorAll('.wheel__segment, .wheel__divider')]
    const lastIndexOf = (matches: (node: Element) => boolean): number =>
      painted.reduce((found, node, index) => (matches(node) ? index : found), -1)

    const lastFill = lastIndexOf((node) => node.classList.contains('wheel__segment'))
    // Twelve o'clock is the seam the paint order can lose: the wedge that
    // strokes it is drawn first and the wedge on its other side last, so a
    // stroke laid before that fill comes out at half width.
    const atTwelve = lastIndexOf(
      (node) =>
        node.classList.contains('wheel__divider') &&
        Math.abs(Number(node.getAttribute('x2'))) < 1e-6,
    )
    expect(atTwelve).toBeGreaterThan(lastFill)
  })

  it('draws neither under the flat look', () => {
    const { container } = render(<Wheel segments={segments} theme={flat} />)
    expect(container.querySelector('.wheel__panel')).toBeNull()
    expect(container.querySelector('.wheel__divider')).toBeNull()
  })

  it('keeps every filter off the wedge, which is rewritten every frame', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    for (const node of container.querySelectorAll('.wheel__wedge *')) {
      expect(node.getAttribute('filter')).toBeNull()
    }
  })

  it('takes a mute it can be told about', () => {
    // The clicker is silent under a mute regardless of what the look asks for.
    const { container } = render(<Wheel segments={segments} theme={wof} muted />)
    expect(container.querySelector('.wheel')).not.toBeNull()
  })

  it('unlocks the clicker the wheel is actually using, not one it replaced', async () => {
    // React runs mount effects twice in development, and the cleanup between
    // them retires the clicker the second run would otherwise have captured.
    // Reading it back at the gesture is what keeps the two the same object.
    const { StrictMode } = await import('react')
    const unlock = vi.fn()
    const module = await import('./flapperAudio')
    vi.spyOn(module, 'createClicker').mockImplementation(() => ({
      unlock,
      setMuted: () => undefined,
      click: () => undefined,
      close: () => undefined,
    }))

    render(
      <StrictMode>
        <Wheel segments={segments} theme={wof} />
      </StrictMode>,
    )
    window.dispatchEvent(new Event('pointerdown'))

    expect(unlock).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('hangs a flapper above the rim when a look asks for one', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    expect(container.querySelector('.wheel__flapper')).not.toBeNull()
  })

  it('leaves it off under the flat look', () => {
    const { container } = render(<Wheel segments={segments} theme={flat} />)
    expect(container.querySelector('.wheel__flapper')).toBeNull()
  })

  it('keeps the flapper outside the rotor, which turns underneath it', () => {
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    const flapper = container.querySelector('.wheel__flapper')
    expect(flapper?.closest('.wheel__rotor')).toBeNull()
  })

  it('turns the pegs with the wheel, not with a wedge', () => {
    // A peg belongs to the rim. A wedge flying in from off-screen must not drag
    // one across the screen with it.
    const { container } = render(<Wheel segments={segments} theme={wof} />)
    const peg = container.querySelector('.wheel__peg')
    expect(peg?.closest('.wheel__wedge')).toBeNull()
    expect(peg?.closest('.wheel__rotor')).not.toBeNull()
  })
})
