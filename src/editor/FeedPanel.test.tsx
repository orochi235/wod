import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MIN_CHURN_INTERVAL_MS } from '../feed/simulated'
import type { SimulatedFeedConfig } from '../feed/types'
import { FeedPanel } from './FeedPanel'

const config: SimulatedFeedConfig = {
  kind: 'simulated',
  id: 'sim',
  defaults: { weight: 1 },
  pool: ['Ana', 'Ben'],
  autochurn: { intervalMs: 1000, targetSize: 2, volatility: 0.3 },
}

type HarnessProps = {
  initialConfig?: SimulatedFeedConfig
  initialPresent?: string[]
  onChange?: (config: SimulatedFeedConfig) => void
  onPresent?: (present: string[]) => void
}

/**
 * Feeds each edit back, so `config.pool` changes identity per keystroke exactly
 * as it does under the real editor. That is what puts the re-seed guard under
 * test: a static `config` never changes identity, the guard never runs, and the
 * textarea would type just as happily with the guard deleted.
 */
function Harness({
  initialConfig = config,
  initialPresent = [],
  onChange = () => undefined,
  onPresent = () => undefined,
}: HarnessProps) {
  const [current, setCurrent] = useState(initialConfig)
  const [present, setPresent] = useState(initialPresent)
  return (
    <FeedPanel
      config={current}
      present={present}
      onChange={(next) => {
        setCurrent(next)
        onChange(next)
      }}
      onPresent={(next) => {
        setPresent(next)
        onPresent(next)
      }}
    />
  )
}

describe('FeedPanel', () => {
  it('joins a name from the pool by hand', async () => {
    const onPresent = vi.fn()
    render(<FeedPanel config={config} present={[]} onPresent={onPresent} onChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Join Ana' }))

    expect(onPresent).toHaveBeenCalledWith(['Ana'])
  })

  it('removes someone already in the room', async () => {
    const onPresent = vi.fn()
    render(
      <FeedPanel
        config={config}
        present={['Ana', 'Ben']}
        onPresent={onPresent}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Ana' }))

    expect(onPresent).toHaveBeenCalledWith(['Ben'])
  })

  it('edits the pool', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const pool = screen.getByLabelText('Name pool')
    await userEvent.clear(pool)
    // The Enter has to survive: a textarea rendered from the parsed pool has
    // nowhere to put a blank line, so 'Dee' would land on the end of 'Cal'.
    await userEvent.type(pool, 'Cal{enter}Dee')

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pool: ['Cal', 'Dee'] }))
    expect(pool).toHaveValue('Cal\nDee')
  })

  it('re-seeds the pool text when the pool changes from outside', () => {
    const { rerender } = render(
      <FeedPanel config={config} present={[]} onPresent={vi.fn()} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Name pool')).toHaveValue('Ana\nBen')

    // An import, or a second editor window writing the preset.
    rerender(
      <FeedPanel
        config={{ ...config, pool: ['Cal'] }}
        present={[]}
        onPresent={vi.fn()}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Name pool')).toHaveValue('Cal')
  })

  it('never offers to join someone the room already holds, even from a doubled pool', async () => {
    const doubled: SimulatedFeedConfig = { ...config, pool: ['Ana', 'Ana', 'Ben'] }
    const onPresent = vi.fn()
    const { rerender } = render(
      <FeedPanel config={doubled} present={[]} onPresent={onPresent} onChange={vi.fn()} />,
    )

    // One button, not two: a second 'Join Ana' would put 'Ana' in the room
    // twice, and churn removes by value — both copies would leave on one tick.
    await userEvent.click(screen.getByRole('button', { name: 'Join Ana' }))
    expect(onPresent).toHaveBeenCalledWith(['Ana'])

    rerender(
      <FeedPanel config={doubled} present={['Ana']} onPresent={onPresent} onChange={vi.fn()} />,
    )

    expect(screen.queryByRole('button', { name: 'Join Ana' })).not.toBeInTheDocument()
  })

  it('empties the room of anyone the pool edit dropped', async () => {
    const user = userEvent.setup()
    render(<Harness initialPresent={['Ana', 'Ben']} />)
    expect(screen.getByRole('button', { name: 'Remove Ben' })).toBeInTheDocument()

    // One replacement rather than clear-then-type: an empty intermediate pool
    // would empty the room on its own and prove nothing about Ben.
    const pool = screen.getByLabelText('Name pool')
    await user.click(pool)
    await user.keyboard('{Control>}a{/Control}')
    await user.paste('Ana')

    expect(screen.queryByRole('button', { name: 'Remove Ben' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Ana' })).toBeInTheDocument()
  })

  it('edits the churn rate', () => {
    // fireEvent, not userEvent: both fields clamp on write, so a controlled
    // input rewrites itself mid-word and typing would assert against whatever
    // the clamp left behind rather than against the value entered.
    const onChange = vi.fn()
    render(<FeedPanel config={config} present={[]} onPresent={vi.fn()} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Interval (ms)'), { target: { value: '750' } })
    // The whole block, not just the field touched: an edit that dropped its
    // siblings would silently reset the target size the operator had set.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ autochurn: { intervalMs: 750, targetSize: 2, volatility: 0.3 } }),
    )

    fireEvent.change(screen.getByLabelText('Volatility'), { target: { value: '0.8' } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ autochurn: { intervalMs: 1000, targetSize: 2, volatility: 0.8 } }),
    )
  })

  it('clamps the rate fields on write, the way the parser does on load', () => {
    // Without this the panel is the one place a config can acquire a value the
    // parser would have refused — and the operator would watch a clock that
    // disagrees with the number in front of them.
    const onChange = vi.fn()
    render(<FeedPanel config={config} present={[]} onPresent={vi.fn()} onChange={onChange} />)

    const interval = screen.getByLabelText('Interval (ms)')
    const volatility = screen.getByLabelText('Volatility')
    const lastChurn = () => onChange.mock.lastCall?.[0].autochurn

    fireEvent.change(interval, { target: { value: '10' } })
    expect(lastChurn().intervalMs).toBe(MIN_CHURN_INTERVAL_MS)
    // An emptied field parses to NaN, which every comparison passes through.
    fireEvent.change(interval, { target: { value: '' } })
    expect(lastChurn().intervalMs).toBe(MIN_CHURN_INTERVAL_MS)

    fireEvent.change(volatility, { target: { value: '5' } })
    expect(lastChurn().volatility).toBe(1)
    fireEvent.change(volatility, { target: { value: '-1' } })
    expect(lastChurn().volatility).toBe(0)
    fireEvent.change(volatility, { target: { value: '' } })
    expect(lastChurn().volatility).toBe(0)
  })

  it('follows an interval edit onto the running clock', async () => {
    // What makes the panel's re-floor more than defensive: the interval is now
    // editable while the clock runs, so `config` really can go under the floor
    // between two parses.
    vi.useFakeTimers()
    try {
      const onPresent = vi.fn()
      render(<Harness onPresent={onPresent} />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Run' }))

      fireEvent.change(screen.getByLabelText('Interval (ms)'), { target: { value: '400' } })
      // Wrapped: the tick hands a roster back through the harness's state, and
      // an unwrapped update would assert against a render that has not happened.
      await act(() => vi.advanceTimersByTimeAsync(399))
      expect(onPresent).not.toHaveBeenCalled()

      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(onPresent).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('churns on a tick while running', async () => {
    vi.useFakeTimers()
    try {
      const onPresent = vi.fn()
      render(<FeedPanel config={config} present={[]} onPresent={onPresent} onChange={vi.fn()} />)

      // fireEvent, not userEvent: userEvent waits on real timers between its
      // own steps, which never advance while the clock under test is faked.
      // The run toggle is uncontrolled: the panel owns whether the clock ticks.
      fireEvent.click(screen.getByRole('checkbox', { name: 'Run' }))
      await vi.advanceTimersByTimeAsync(999)
      expect(onPresent).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      // Target size 2 against an empty room: exactly one person walks in.
      expect(onPresent).toHaveBeenCalledTimes(1)
      const room = onPresent.mock.calls[0][0]
      expect(room).toHaveLength(1)
      expect(config.pool).toContain(room[0])
    } finally {
      vi.useRealTimers()
    }
  })

  it('floors the interval a config edit drove under the minimum', async () => {
    vi.useFakeTimers()
    try {
      const onPresent = vi.fn()
      const hurried: SimulatedFeedConfig = {
        ...config,
        autochurn: { ...config.autochurn, intervalMs: 10 },
      }
      render(<FeedPanel config={hurried} present={[]} onPresent={onPresent} onChange={vi.fn()} />)

      fireEvent.click(screen.getByRole('checkbox', { name: 'Run' }))
      // Far past the requested period: an unfloored clock has already fired
      // twenty times by here.
      await vi.advanceTimersByTimeAsync(MIN_CHURN_INTERVAL_MS - 1)
      expect(onPresent).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(onPresent).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not restart the clock for an interval edit the floor swallows', async () => {
    vi.useFakeTimers()
    try {
      const onPresent = vi.fn()
      const hurried = (intervalMs: number): SimulatedFeedConfig => ({
        ...config,
        autochurn: { ...config.autochurn, intervalMs },
      })
      const { rerender } = render(
        <FeedPanel config={hurried(10)} present={[]} onPresent={onPresent} onChange={vi.fn()} />,
      )
      fireEvent.click(screen.getByRole('checkbox', { name: 'Run' }))

      // 10ms and 20ms are the same clock once floored, so this edit must not
      // reach the effect. Keyed on the raw interval it would restart here and
      // push the first tick out to 850ms.
      await vi.advanceTimersByTimeAsync(200)
      rerender(
        <FeedPanel config={hurried(20)} present={[]} onPresent={onPresent} onChange={vi.fn()} />,
      )
      await vi.advanceTimersByTimeAsync(50)

      expect(onPresent).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ticks on schedule against the roster it was last given', async () => {
    vi.useFakeTimers()
    try {
      const onPresent = vi.fn()
      const { rerender } = render(
        <FeedPanel config={config} present={[]} onPresent={onPresent} onChange={vi.fn()} />,
      )
      fireEvent.click(screen.getByRole('checkbox', { name: 'Run' }))

      // Mid-period, as a hand join lands: a clock that restarted on the new
      // roster would put its first tick 600ms past the window below.
      await vi.advanceTimersByTimeAsync(600)
      rerender(
        <FeedPanel config={config} present={['Ana']} onPresent={onPresent} onChange={vi.fn()} />,
      )
      await vi.advanceTimersByTimeAsync(400)

      expect(onPresent).toHaveBeenCalledTimes(1)
      // Target size 2. A tick still reading the empty room it was rendered with
      // would hand back one name; two means it read the roster Ana joined.
      expect(onPresent.mock.calls[0][0]).toEqual(['Ana', 'Ben'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the clock when the run toggle goes off', async () => {
    vi.useFakeTimers()
    try {
      const onPresent = vi.fn()
      render(<FeedPanel config={config} present={[]} onPresent={onPresent} onChange={vi.fn()} />)

      const run = screen.getByRole('checkbox', { name: 'Run' })
      fireEvent.click(run)
      fireEvent.click(run)
      await vi.advanceTimersByTimeAsync(5000)

      expect(onPresent).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
