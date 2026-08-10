import { useCallback, useEffect, useState } from 'react'
import type { Reveal, Segment } from '../wheel/types'
import type { Landing } from '../wheel/useSpin'

export type Shown = { segment: Segment; reveal: Reveal }

export type UseRevealResult = {
  shown: Shown | null
  dismiss: () => void
}

/**
 * The overlay's whole state is one dismissed id. Landing ids only move forward,
 * so a scalar answers "has this one been dismissed" without a set.
 *
 * `shown.segment` is whatever `landing` captured at rest, so a preset edit
 * arriving from the editor window cannot rewrite a punchline mid-display.
 */
export function useReveal(landing: Landing | null): UseRevealResult {
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  const reveal = landing?.winner.reveal
  const shown =
    landing !== null && reveal !== undefined && dismissedId !== landing.id
      ? { segment: landing.winner, reveal }
      : null

  const landingId = landing?.id ?? null
  const dismiss = useCallback(() => {
    if (landingId !== null) setDismissedId(landingId)
  }, [landingId])

  // Keyed on the shown reveal's hold, not the landing's: dismissing clears
  // `shown`, which re-runs this and tears the timer down with it.
  const holdMs = shown?.reveal.holdMs
  useEffect(() => {
    if (landingId === null) return
    if (holdMs === undefined || !Number.isFinite(holdMs) || holdMs <= 0) return
    const timer = setTimeout(() => setDismissedId(landingId), holdMs)
    return () => clearTimeout(timer)
  }, [landingId, holdMs])

  return { shown, dismiss }
}
