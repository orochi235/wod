import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { angleOfMatrix, useWheelAngle } from './useWheelAngle'

describe('angleOfMatrix', () => {
  it('reads a rotation out of a matrix', () => {
    expect(angleOfMatrix('matrix(1, 0, 0, 1, 0, 0)')).toBeCloseTo(0)
    expect(angleOfMatrix('matrix(0, 1, -1, 0, 0, 0)')).toBeCloseTo(90)
  })

  it('reports a full turn rather than a negative angle', () => {
    expect(angleOfMatrix('matrix(0, -1, 1, 0, 0, 0)')).toBeCloseTo(270)
  })

  it('gives up on anything that is not a matrix', () => {
    expect(angleOfMatrix('none')).toBeNull()
    expect(angleOfMatrix('')).toBeNull()
    expect(angleOfMatrix('matrix(1, 0, 0)')).toBeNull()
  })
})

describe('useWheelAngle', () => {
  let frames: FrameRequestCallback[] = []

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const pump = (now: number) => {
    const due = frames
    frames = []
    act(() => {
      for (const frame of due) frame(now)
    })
  }

  function Probe({ onSample }: { onSample: (angle: number, speed: number) => void }) {
    const ref = useRef<SVGGElement>(null)
    useWheelAngle(ref, true, onSample)
    return (
      <svg aria-label="probe" role="img">
        <g ref={ref} />
      </svg>
    )
  }

  it('reports the angle and the speed it is turning at', () => {
    const seen: Array<[number, number]> = []
    let angle = 0
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: `rotate(${angle}deg)` }) as CSSStyleDeclaration,
    )
    // jsdom hands back whatever transform it was given, so drive degrees
    // directly rather than through a matrix here.
    render(<Probe onSample={(a, s) => seen.push([a, s])} />)

    angle = 10
    pump(16)
    angle = 40
    pump(32)

    expect(seen.at(-1)?.[0]).toBeCloseTo(40)
    // 30 degrees over 16ms.
    expect(seen.at(-1)?.[1]).toBeCloseTo(30 / 16, 2)
  })

  it('reports no speed on its first frame, having nothing to compare against', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: 'rotate(5deg)' }) as CSSStyleDeclaration,
    )
    const seen: Array<[number, number]> = []
    render(<Probe onSample={(a, s) => seen.push([a, s])} />)
    pump(16)
    expect(seen[0][1]).toBe(0)
  })

  it('stops sampling once it is not running', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ transform: 'rotate(0deg)' }) as CSSStyleDeclaration,
    )
    const onSample = vi.fn()
    const { unmount } = render(<Probe onSample={onSample} />)
    pump(16)
    const before = onSample.mock.calls.length
    unmount()
    pump(32)
    expect(onSample.mock.calls.length).toBe(before)
  })
})
