import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'

/** A hand-pumped rAF clock, so a test can watch the loop rather than one frame. */
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
    pending: () => queue.size,
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

const segment = (id: string): Segment => ({ id, label: id, weight: 1 })

const matchMedia = (matches: boolean) => {
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

const wedges = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-segment-id]')].map((node) =>
    node.getAttribute('data-segment-id'),
  )

const opacityOf = (container: HTMLElement, id: string) =>
  (container.querySelector(`[data-segment-id="${id}"]`) as SVGGElement).style.getPropertyValue(
    '--wedge-opacity',
  )

const transitions = {
  enter: { id: 'fade' as const, params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade' as const, params: { staggerMs: 0, durationMs: 400 } },
}

beforeEach(() => {
  matchMedia(false)
})

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('wedge presence', () => {
  it('draws an arriving wedge from its transition start', () => {
    const { container } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(opacityOf(container, 'ana')).toBe('0')
  })

  it('keeps drawing a wedge that leaves the roster', () => {
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(wedges(container)).toContain('ben')
  })

  it('drops a departing wedge when no exit is armed', () => {
    const enterOnly = { enter: transitions.enter }
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={enterOnly} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={enterOnly} />)
    expect(wedges(container)).not.toContain('ben')
  })

  it('draws nothing extra when no transitions are armed', () => {
    const { container, rerender } = render(<Wheel segments={[segment('ana'), segment('ben')]} />)
    rerender(<Wheel segments={[segment('ana')]} />)
    expect(wedges(container)).toEqual(['ana'])
  })

  it('settles everything while something else owns the wheel', () => {
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} held={true} />)
    expect(wedges(container)).toEqual(['ana'])
    expect(opacityOf(container, 'ana')).toBe('1')
  })

  it('rests every wedge under reduced motion once the short fade is done', () => {
    matchMedia(true)
    const { container } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(wedges(container)).toEqual(['ana'])
  })
})

describe('the presence clock', () => {
  let clock: ReturnType<typeof installClock>

  beforeEach(() => {
    matchMedia(false)
    clock = installClock()
  })

  afterEach(() => {
    clock.restore()
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('carries a wedge from its start frame to rest', () => {
    const { container } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(opacityOf(container, 'ana')).toBe('0')

    // Half of a 400ms fade, which ease-out has already carried to 0.75.
    clock.advance(200)
    expect(Number(opacityOf(container, 'ana'))).toBeCloseTo(0.75, 3)

    clock.advance(200)
    expect(Number(opacityOf(container, 'ana'))).toBeCloseTo(1, 3)
  })

  it('stops asking for frames once everything has settled', () => {
    render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    expect(clock.pending()).toBeGreaterThan(0)

    clock.advance(401)
    clock.advance(1)
    expect(clock.pending()).toBe(0)
  })

  it('starts asking again when a wedge arrives after the wheel settled', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    clock.advance(401)
    clock.advance(1)
    expect(clock.pending()).toBe(0)

    rerender(<Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />)
    expect(clock.pending()).toBeGreaterThan(0)
  })

  it('asks for no further frames once unmounted', () => {
    const { unmount } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    clock.advance(100)
    expect(clock.pending()).toBeGreaterThan(0)

    unmount()
    expect(clock.pending()).toBe(0)
  })

  it('settles inside the reduced-motion duration, not the authored one', () => {
    matchMedia(true)
    const slow = { enter: { id: 'fade' as const, params: { staggerMs: 0, durationMs: 4000 } } }
    const { container } = render(<Wheel segments={[segment('ana')]} transitions={slow} />)

    clock.advance(REDUCED_MOTION_MS + 1)
    expect(Number(opacityOf(container, 'ana'))).toBeCloseTo(1, 3)
    expect(clock.pending()).toBe(0)
  })

  it('freezes a departing wedge on the arc it last held', () => {
    // fade releases its hold at once, so ben leaves the layout immediately and
    // is drawn on its frozen arc — the same path it had while on the roster.
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const path = (container: HTMLElement) =>
      container.querySelector('[data-segment-id="ben"] .wheel__segment')?.getAttribute('d')

    const { container, rerender } = render(<Wheel segments={roster} transitions={transitions} />)
    const before = path(container)
    rerender(<Wheel segments={[segment('ana'), segment('cy')]} transitions={transitions} />)
    expect(path(container)).toBe(before)
    expect(before).toBeTruthy()
  })

  it('gives a newcomer a color no wedge on the wheel is already using', () => {
    // Once a departure finishes its color is released, so the count of assigned
    // colors no longer tracks the palette index — picking by count would hand a
    // newcomer a color a survivor still holds.
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const { container, rerender } = render(<Wheel segments={roster} transitions={transitions} />)
    clock.advance(401)

    rerender(<Wheel segments={[segment('ana'), segment('cy')]} transitions={transitions} />)
    clock.advance(401)
    clock.advance(1)

    rerender(
      <Wheel
        segments={[segment('ana'), segment('cy'), segment('dan')]}
        transitions={transitions}
      />,
    )
    const fills = [...container.querySelectorAll('.wheel__segment')].map((node) =>
      node.getAttribute('fill'),
    )
    expect(fills).toHaveLength(3)
    expect(new Set(fills).size).toBe(3)
  })

  it('keeps every wedge painted while something else owns the wheel', () => {
    // A held wheel is on screen for the whole of every spin. Resolving colors
    // only on the animating path would leave each wedge with no fill at all.
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} held={true} />)
    const fill = container
      .querySelector('[data-segment-id="ana"] .wheel__segment')
      ?.getAttribute('fill')
    expect(fill).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('gives a survivor and the wedge leaving beside it different colors', () => {
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const { container, rerender } = render(<Wheel segments={roster} transitions={transitions} />)
    rerender(<Wheel segments={[segment('ana'), segment('cy')]} transitions={transitions} />)

    const fills = [...container.querySelectorAll('.wheel__segment')].map((node) =>
      node.getAttribute('fill'),
    )
    expect(new Set(fills).size).toBe(fills.length)
  })

  it('keeps a departed wedge on the color it had, not the palette index', () => {
    const { container, rerender } = render(
      <Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />,
    )
    const before = container
      .querySelector('[data-segment-id="ben"] .wheel__segment')
      ?.getAttribute('fill')
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    const after = container
      .querySelector('[data-segment-id="ben"] .wheel__segment')
      ?.getAttribute('fill')
    expect(after).toBe(before)
    expect(after).toBeTruthy()
  })

  it('reports a wedge it is still drawing after the roster drops it', () => {
    const retained: { current: ReadonlySet<string> } = { current: new Set() }
    const { rerender } = render(
      <Wheel
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    expect([...retained.current].sort()).toEqual(['ana', 'ben'])

    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} retainedRef={retained} />)
    expect(retained.current.has('ben')).toBe(true)
  })

  it('drops a wedge from the report once its exit is done', () => {
    const retained: { current: ReadonlySet<string> } = { current: new Set() }
    const { rerender } = render(
      <Wheel
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    rerender(<Wheel segments={[segment('ana')]} transitions={transitions} retainedRef={retained} />)
    clock.advance(401)
    expect([...retained.current]).toEqual(['ana'])
  })
})
