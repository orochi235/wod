import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OutageRun } from '../wheel/useSpin'
import type { Fx } from './fx'
import { useOutageFx } from './useOutageFx'

const plan = { sparkAtMs: 0, brakeAtMs: 100, popAtMs: 500, lightsAtMs: 900, resumedAtMs: 1600 }
const runOf = (id: number): OutageRun => ({ id, plan, startedAt: 0 })

function fake() {
  const stops: ReturnType<typeof vi.fn>[] = []
  const fx: Fx = {
    play: vi.fn(() => {
      const stop = vi.fn()
      stops.push(stop)
      return stop
    }),
    setMuted: vi.fn(),
    dispose: vi.fn(),
  }
  return { fx, stops, create: vi.fn(() => fx) }
}

function render(initial: OutageRun | null, create: () => Fx) {
  const targetRef = { current: document.createElement('div') }
  return renderHook(
    ({ run, muted }) => useOutageFx(run, { targetRef, depth: 1, sound: true, muted, create }),
    { initialProps: { run: initial, muted: false } },
  )
}

describe('useOutageFx', () => {
  it('builds nothing until an outage runs', () => {
    const { create } = fake()
    render(null, create)
    expect(create).not.toHaveBeenCalled()
  })

  it('plays a run once, however often it re-renders', () => {
    const { fx, create } = fake()
    const run = runOf(1)
    const view = render(run, create)
    view.rerender({ run, muted: false })
    expect(fx.play).toHaveBeenCalledTimes(1)
  })

  it('lets a run play on after its spin ends', () => {
    const { stops, create } = fake()
    const view = render(runOf(1), create)
    view.rerender({ run: null, muted: false })
    expect(stops[0]).not.toHaveBeenCalled()
  })

  it('cuts a run short when a newer one starts, and tidies up on leaving', () => {
    const { fx, stops, create } = fake()
    const view = render(runOf(1), create)
    view.rerender({ run: runOf(2), muted: false })
    expect(stops[0]).toHaveBeenCalled()
    view.unmount()
    expect(stops[1]).toHaveBeenCalled()
    expect(fx.dispose).toHaveBeenCalled()
  })

  it('follows the page mute', () => {
    const { fx, create } = fake()
    const run = runOf(1)
    const view = render(run, create)
    view.rerender({ run, muted: true })
    expect(fx.setMuted).toHaveBeenLastCalledWith(true)
  })
})
