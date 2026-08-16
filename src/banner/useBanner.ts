import { type Blitsklieg, type FireOptions, createBlitsklieg } from 'blitsklieg'
import { useCallback, useEffect, useState } from 'react'
import { cryptoRng } from '../wheel/selection'
import type { Landing } from '../wheel/useSpin'
import { type BannerStyle, rollStyle } from './style'

/**
 * An effect plays enter, holds, then leaves; there is no stay-up mode. So the
 * hold is long enough that no show reaches the end of it, and the click that
 * dismisses the banner is what cuts it short.
 */
const HOLD_MS = 30 * 60 * 1000

const arriveWith = (style: BannerStyle, tint?: number): FireOptions => ({
  enter: style.enter,
  active: style.active,
  exit: 'none',
  look: style.look,
  tint,
  hold: HOLD_MS,
})

/**
 * The same word in the same material and the same place, with no entrance and
 * no hold. Under the `replace` policy it takes over from the held effect
 * mid-pose, so the two fires read as one word arriving, waiting, and leaving.
 */
const leaveWith = (style: BannerStyle, tint?: number): FireOptions => ({
  enter: 'none',
  active: style.active,
  exit: style.exit,
  look: style.look,
  tint,
  hold: 0,
})

export type CreateBanner = (fontUrl: string) => Blitsklieg

const overThePage: CreateBanner = (fontUrl) => createBlitsklieg({ fontUrl, policy: 'replace' })

export type BannerOptions = {
  /** The face the word is set in. */
  fontUrl: string
  /**
   * Recolors whichever metal the roll picked, as `0xe8442a`. Absent leaves it
   * the metal's own color.
   */
  tint?: number
  /**
   * The material the word is extruded in. Absent — or an id the library does not
   * carry — rolls one. Composes with `tint`, which recolors whichever metal ends
   * up chosen rather than replacing it.
   */
  look?: string
  /** Undefined opens a real overlay. */
  create?: CreateBanner
}

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
export function useBanner(landing: Landing | null, options: BannerOptions): UseBannerResult {
  const { fontUrl, tint, look, create = overThePage } = options
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
    // Rolled here so both fires wear it: the exit has to be the same word in the
    // same material, or dismissing it swaps the metal on the way out.
    const style = rollStyle(cryptoRng, look)
    // A font that will not load would otherwise hold a scrim over an empty screen.
    void stage.fire(shown, arriveWith(style, tint)).catch(() => setDismissedId(landingId))
    return () => {
      void stage.fire(shown, leaveWith(style, tint)).catch(() => undefined)
    }
  }, [stage, shown, landingId, tint, look])

  const dismiss = useCallback(() => {
    if (landingId !== null) setDismissedId(landingId)
  }, [landingId])

  return { shown, dismiss }
}
