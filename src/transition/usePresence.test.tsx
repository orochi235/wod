import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'

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
})
