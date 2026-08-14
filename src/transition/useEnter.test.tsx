import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Wheel } from '../wheel/Wheel'
import type { Segment } from '../wheel/types'

type AnimateCall = { keyframes: unknown; options: KeyframeAnimationOptions }

const calls: AnimateCall[] = []

function stubAnimate(): void {
  Element.prototype.animate = function animate(
    this: Element,
    keyframes: unknown,
    options: KeyframeAnimationOptions,
  ) {
    calls.push({ keyframes, options })
    return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation
  } as unknown as Element['animate']
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

beforeEach(() => {
  calls.length = 0
  stubAnimate()
  matchMedia(false)
})

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
})

describe('enter transitions', () => {
  const transitions = { enter: { id: 'fade' as const, params: { staggerMs: 20 } } }

  it('animates a wedge that joins the roster', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    calls.length = 0
    rerender(<Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />)
    expect(calls).toHaveLength(1)
    expect(calls[0].options.delay).toBe(20)
  })

  it('leaves a wedge that was already there alone', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} transitions={transitions} />)
    calls.length = 0
    rerender(
      <Wheel segments={[{ ...segment('ana'), label: 'Ana L.' }]} transitions={transitions} />,
    )
    expect(calls).toHaveLength(0)
  })

  it('animates every wedge on first paint', () => {
    render(<Wheel segments={[segment('ana'), segment('ben')]} transitions={transitions} />)
    expect(calls).toHaveLength(2)
  })

  it('does nothing at all without a transition', () => {
    const { rerender } = render(<Wheel segments={[segment('ana')]} />)
    calls.length = 0
    rerender(<Wheel segments={[segment('ana'), segment('ben')]} />)
    expect(calls).toHaveLength(0)
  })

  it('collapses to a fade with no stagger under reduced motion', () => {
    matchMedia(true)
    render(
      <Wheel
        segments={[segment('ana'), segment('ben')]}
        transitions={{ enter: { id: 'fly', params: { staggerMs: 200, distance: 2 } } }}
      />,
    )
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.options.delay).toBe(0)
      expect(call.options.duration).toBe(300)
      // A fade moves nothing.
      for (const frame of call.keyframes as Keyframe[]) expect(frame.transform).toBe('none')
    }
  })
})
