import { type Blitsklieg, createBlitsklieg } from 'blitsklieg'
import { useCallback, useEffect, useState } from 'react'
import type { Landing } from '../wheel/useSpin'

/**
 * An effect plays enter, holds, then leaves; there is no stay-up mode. So the
 * hold is long enough that no show reaches the end of it, and the click that
 * dismisses the banner is what cuts it short.
 */
const HOLD_MS = 30 * 60 * 1000

const ARRIVE = { enter: 'slam', active: 'sweep', exit: 'none', hold: HOLD_MS } as const

/**
 * The same word in the same place, with no entrance and no hold. Under the
 * `replace` policy it takes over from the held effect mid-pose, so the two fires
 * read as one word that slams in, waits, and shatters.
 */
const LEAVE = { enter: 'none', active: 'sweep', exit: 'shatter', hold: 0 } as const

export type CreateBanner = (fontUrl: string) => Blitsklieg

const overThePage: CreateBanner = (fontUrl) => createBlitsklieg({ fontUrl, policy: 'replace' })

export type UseBannerResult = {
  /** The word on screen, or null when there is none. */
  shown: string | null
  dismiss: () => void
}

/**
 * The winner's name in extruded type over the whole page, held until it is
 * dismissed. Like `useReveal`, the state is one dismissed landing id: ids only
 * move forward, so a scalar answers "has this one been seen".
 *
 * A page that cannot draw it raises nothing at all rather than a scrim over an
 * empty screen — the result line already names the winner.
 */
export function useBanner(
  landing: Landing | null,
  fontUrl: string,
  create: CreateBanner = overThePage,
): UseBannerResult {
  // State rather than a ref: a change of face builds a second stage, and the
  // fire below has to be told to draw the word again on it.
  const [stage, setStage] = useState<Blitsklieg | null>(null)
  const [dismissedId, setDismissedId] = useState<number | null>(null)

  useEffect(() => {
    const made = create(fontUrl)
    setStage(made)
    return () => made.destroy()
  }, [fontUrl, create])

  const landingId = landing?.id ?? null
  const label = landing?.winner.label.trim() ?? ''
  const shown =
    stage?.supported && landingId !== null && label !== '' && dismissedId !== landingId
      ? label
      : null

  // Whatever ends the banner — a click, the next spin, a change of face — runs
  // this cleanup, so the word has exactly one way off the screen.
  useEffect(() => {
    if (stage === null || shown === null || landingId === null) return
    // A font that will not load would otherwise hold a scrim over an empty screen.
    void stage.fire(shown, ARRIVE).catch(() => setDismissedId(landingId))
    return () => {
      void stage.fire(shown, LEAVE).catch(() => undefined)
    }
  }, [stage, shown, landingId])

  const dismiss = useCallback(() => {
    if (landingId !== null) setDismissedId(landingId)
  }, [landingId])

  return { shown, dismiss }
}
