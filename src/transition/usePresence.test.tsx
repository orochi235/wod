import { act, render } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMotion } from '../clock/testing'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'
import { REDUCED_MOTION_MS } from '../wheel/useSpin'
import type { Transitions } from './types'

const segment = (id: string, color?: string): Segment =>
  color === undefined ? { id, label: id, weight: 1 } : { id, label: id, weight: 1, color }

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

/** NaN for a wedge nothing has painted, so an unpainted wedge never reads as transparent. */
const opacityOf = (container: HTMLElement, id: string) => {
  const element = container.querySelector(`[data-segment-id="${id}"]`) as SVGGElement
  const value = element.style.getPropertyValue('--wedge-opacity')
  return value === '' ? Number.NaN : Number(value)
}

const pathOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-segment-id="${id}"] .wheel__segment`)?.getAttribute('d')

const transitions: Transitions = {
  enter: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
  exit: { id: 'fade', params: { staggerMs: 0, durationMs: 400 } },
}

/** A motion on a hand-stepped clock, stepped inside act so the renders it causes land. */
function clock() {
  const fake = fakeMotion()
  return { ...fake, frame: (t: number) => act(() => fake.step(t)) }
}

beforeEach(() => {
  matchMedia(false)
})

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('wedge presence', () => {
  it('draws an arriving wedge from its transition start', () => {
    const { motion } = clock()
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    expect(opacityOf(container, 'ana')).toBe(0)
  })

  it('carries a wedge from its start frame to rest', () => {
    const { motion, frame } = clock()
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    // Half of a 400 ms fade, which ease-out has already carried to 0.75.
    frame(200)
    expect(opacityOf(container, 'ana')).toBeCloseTo(0.75, 3)
    frame(400)
    expect(opacityOf(container, 'ana')).toBeCloseTo(1, 3)
  })

  it('keeps drawing a wedge that leaves the roster', () => {
    const { motion } = clock()
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
      />,
    )
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    expect(wedges(container)).toContain('ben')
  })

  it('drops a departing wedge when no exit is armed', () => {
    const { motion } = clock()
    const enterOnly = { enter: transitions.enter }
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={enterOnly} />,
    )
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={enterOnly} />)
    expect(wedges(container)).not.toContain('ben')
  })

  it('draws nothing extra when no transitions are armed', () => {
    const { motion } = clock()
    const { container, rerender } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} />,
    )
    rerender(<Wheel motion={motion} segments={[segment('ana')]} />)
    expect(wedges(container)).toEqual(['ana'])
  })

  it('rests every wedge the moment a spin takes the wheel mid-transition', () => {
    const { motion, frame } = clock()
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
      />,
    )
    frame(100)
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} held />)
    expect(wedges(container)).toEqual(['ana'])
    expect(opacityOf(container, 'ana')).toBe(1)
    frame(116)
    expect(opacityOf(container, 'ana')).toBe(1)
  })

  it('keeps every wedge painted while something else owns the wheel', () => {
    const { motion } = clock()
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana', '#f4a261'), segment('ben', '#2a9d8f')]}
        transitions={transitions}
      />,
    )
    rerender(
      <Wheel
        motion={motion}
        segments={[segment('ana', '#f4a261')]}
        transitions={transitions}
        held
      />,
    )
    expect(
      container.querySelector('[data-segment-id="ana"] .wheel__segment')?.getAttribute('fill'),
    ).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('freezes a departing wedge on the arc it last held', () => {
    const { motion } = clock()
    const roster = [segment('ana'), segment('ben'), segment('cy')]
    const { container, rerender } = render(
      <Wheel motion={motion} segments={roster} transitions={transitions} />,
    )
    const before = pathOf(container, 'ben')
    rerender(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('cy')]}
        transitions={transitions}
      />,
    )
    expect(before).toBeTruthy()
    expect(pathOf(container, 'ben')).toBe(before)
  })
})

describe('the presence clock', () => {
  it('stops asking for frames once everything has settled', () => {
    const { motion, frame, waiting } = clock()
    render(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    expect(waiting()).toBe(true)
    frame(400)
    frame(416)
    frame(432)
    expect(waiting()).toBe(false)
  })

  it('starts asking again when a wedge arrives after the wheel settled', () => {
    const { motion, frame, waiting } = clock()
    const { rerender } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    frame(400)
    frame(416)
    frame(432)
    rerender(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
      />,
    )
    expect(waiting()).toBe(true)
  })

  it('asks for no further frames once unmounted', () => {
    const { motion, frame, waiting } = clock()
    const { unmount } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />,
    )
    frame(100)
    unmount()
    frame(116)
    expect(waiting()).toBe(false)
  })

  it('settles inside the reduced-motion duration, not the authored one', () => {
    matchMedia(true)
    const { motion, frame, waiting } = clock()
    const slow: Transitions = { enter: { id: 'fade', params: { staggerMs: 0, durationMs: 4000 } } }
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana')]} transitions={slow} />,
    )
    frame(REDUCED_MOTION_MS)
    expect(opacityOf(container, 'ana')).toBeCloseTo(1, 3)
    frame(REDUCED_MOTION_MS + 16)
    frame(REDUCED_MOTION_MS + 32)
    expect(waiting()).toBe(false)
  })

  it('renders nothing per frame while an entrance only fades', () => {
    const { motion, frame } = clock()
    const long: Transitions = { enter: { id: 'fade', params: { staggerMs: 0, durationMs: 2000 } } }
    let renders = 0
    const { container } = render(
      <Profiler id="wheel" onRender={() => renders++}>
        <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={long} />
      </Profiler>,
    )
    const settled = renders
    for (let i = 1; i <= 60; i++) frame(i * 16)
    expect(renders).toBe(settled)
    expect(opacityOf(container, 'ana')).toBeGreaterThan(0)
  })

  // 0.4.0: hold 'before'.
  it('keeps a staggered wedge invisible until its turn', () => {
    const { motion, frame } = clock()
    const staggered: Transitions = {
      enter: { id: 'fade', params: { staggerMs: 200, durationMs: 400 } },
    }
    const { container } = render(
      <Wheel motion={motion} segments={[segment('ana'), segment('ben')]} transitions={staggered} />,
    )
    frame(100)
    expect(opacityOf(container, 'ben')).toBe(0)
  })

  it('carries on from where an entrance was when an exit cuts in at 40%', () => {
    const { motion, frame } = clock()
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
      />,
    )
    frame(160)
    const before = opacityOf(container, 'ben')
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    expect(opacityOf(container, 'ben')).toBeCloseTo(before, 3)
    frame(176)
    expect(Math.abs(opacityOf(container, 'ben') - before)).toBeLessThan(0.06)
  })

  // 0.4.0: the exit's held last frame, then the entrance's.
  it('turns an exit around and ends fully at rest', () => {
    const { motion, frame } = clock()
    const roster = [segment('ana'), segment('ben')]
    const { container, rerender } = render(
      <Wheel motion={motion} segments={roster} transitions={transitions} />,
    )
    frame(400)
    frame(416)
    const settledPath = pathOf(container, 'ben')
    rerender(<Wheel motion={motion} segments={[segment('ana')]} transitions={transitions} />)
    frame(600)
    const before = opacityOf(container, 'ben')
    rerender(<Wheel motion={motion} segments={roster} transitions={transitions} />)
    expect(opacityOf(container, 'ben')).toBeCloseTo(before, 3)
    frame(1200)
    frame(1216)
    expect(opacityOf(container, 'ben')).toBe(1)
    expect(pathOf(container, 'ben')).toBe(settledPath)
  })

  // 0.6.0: the exit reads 'frozen' at its end.
  it('holds an exit at its last frame, then drops it and its ghost arc', () => {
    const { motion, frame, waiting } = clock()
    const retained: { current: ReadonlySet<string> } = { current: new Set() }
    const { container, rerender } = render(
      <Wheel
        motion={motion}
        segments={[segment('ana'), segment('ben')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    frame(400)
    rerender(
      <Wheel
        motion={motion}
        segments={[segment('ana')]}
        transitions={transitions}
        retainedRef={retained}
      />,
    )
    expect(retained.current.has('ben')).toBe(true)
    frame(799)
    expect(opacityOf(container, 'ben')).toBeLessThan(0.01)
    frame(800)
    expect(wedges(container)).toEqual(['ana'])
    expect([...retained.current]).toEqual(['ana'])
    frame(816)
    frame(832)
    expect(waiting()).toBe(false)
  })
})
