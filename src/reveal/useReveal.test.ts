import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Landing } from '../wheel/useSpin'
import { useReveal } from './useReveal'

const WITH: Landing = {
  id: 1,
  winner: { id: 'a', label: 'A', weight: 1, reveal: { headline: 'Surprise' } },
}
const WITHOUT: Landing = { id: 1, winner: { id: 'b', label: 'B', weight: 1 } }

describe('useReveal', () => {
  it('opens on a landing whose winner has a reveal', () => {
    const { result } = renderHook(() => useReveal(WITH))
    expect(result.current.shown?.reveal).toEqual({ headline: 'Surprise' })
    expect(result.current.shown?.segment.id).toBe('a')
  })

  it('stays closed for a winner with no reveal', () => {
    const { result } = renderHook(() => useReveal(WITHOUT))
    expect(result.current.shown).toBeNull()
  })

  it('stays closed while there is no landing', () => {
    const { result } = renderHook(() => useReveal(null))
    expect(result.current.shown).toBeNull()
  })

  it('opens for an empty reveal, which renders as the label', () => {
    const landing: Landing = { id: 1, winner: { id: 'a', label: 'A', weight: 1, reveal: {} } }
    const { result } = renderHook(() => useReveal(landing))
    expect(result.current.shown).not.toBeNull()
  })

  it('does not reopen after dismissal, however many times it re-renders', () => {
    const { result, rerender } = renderHook(({ landing }) => useReveal(landing), {
      initialProps: { landing: WITH },
    })
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.shown).toBeNull()
    rerender({ landing: WITH })
    rerender({ landing: WITH })
    expect(result.current.shown).toBeNull()
  })

  it('reopens when the same segment wins again', () => {
    const { result, rerender } = renderHook(({ landing }) => useReveal(landing), {
      initialProps: { landing: WITH },
    })
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.shown).toBeNull()

    // Same winner, new landing. Keyed on the segment id this would stay shut and
    // the punchline would silently never fire again.
    rerender({ landing: { ...WITH, id: 2 } })
    expect(result.current.shown).not.toBeNull()
  })

  it('closes when a new spin clears the landing', () => {
    const { result, rerender } = renderHook(
      ({ landing }: { landing: Landing | null }) => useReveal(landing),
      { initialProps: { landing: WITH as Landing | null } },
    )
    expect(result.current.shown).not.toBeNull()
    rerender({ landing: null })
    expect(result.current.shown).toBeNull()
  })

  describe('holdMs', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const held: Landing = {
      id: 1,
      winner: { id: 'a', label: 'A', weight: 1, reveal: { headline: 'Hi', holdMs: 500 } },
    }

    it('auto-dismisses after the hold', () => {
      const { result } = renderHook(() => useReveal(held))
      expect(result.current.shown).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(499)
      })
      expect(result.current.shown).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(result.current.shown).toBeNull()
    })

    it('a manual dismissal cancels the pending timer', () => {
      const { result } = renderHook(() => useReveal(held))
      act(() => {
        result.current.dismiss()
      })
      expect(result.current.shown).toBeNull()
      // A surviving timer would fire against a later landing's id.
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current.shown).toBeNull()
    })

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
      'treats a holdMs of %p as manual dismissal',
      (holdMs) => {
        const landing: Landing = {
          id: 1,
          winner: { id: 'a', label: 'A', weight: 1, reveal: { headline: 'Hi', holdMs } },
        }
        const { result } = renderHook(() => useReveal(landing))
        act(() => {
          vi.advanceTimersByTime(10_000)
        })
        expect(result.current.shown).not.toBeNull()
      },
    )
  })
})
