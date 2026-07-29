import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMorphs } from './morph'
import { cryptoRng, weightedRandom } from './selection'
import type { SelectionStrategy } from './selection'
import { planSpin } from './spin'
import type { Segment, SpinConfig } from './types'

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  isSpinning: boolean
  winnerId: string | null
  spin: (strategy?: SelectionStrategy) => void
  rotorRef: RefObject<SVGGElement | null>
}

export function useSpin(
  segments: Segment[],
  config: SpinConfig,
  onLanded?: (winnerId: string) => void,
): UseSpinResult {
  const rotorRef = useRef<SVGGElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const animationRef = useRef<Animation | null>(null)
  const lastSegmentsRef = useRef(segments)
  const [displaySegments, setDisplaySegments] = useState(segments)
  const [isSpinning, setIsSpinning] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)

  useEffect(() => {
    // Only resync when the caller actually swaps the segment array. Resyncing on
    // every isSpinning transition would wipe out the landed state, which is the
    // whole visual payoff when weights morph mid-spin.
    if (lastSegmentsRef.current === segments) return
    lastSegmentsRef.current = segments
    if (!isSpinning) setDisplaySegments(segments)
  }, [segments, isSpinning])

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      animationRef.current?.cancel()
    },
    [],
  )

  const spin = useCallback(
    (strategy: SelectionStrategy = weightedRandom) => {
      if (isSpinning) return
      const rotor = rotorRef.current
      if (!rotor) return

      const plan = planSpin(segments, config, strategy, cryptoRng)
      if (!plan) return

      setIsSpinning(true)
      setWinnerId(null)
      setDisplaySegments(segments)

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const durationMs = reduceMotion ? 300 : config.durationMs

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(
        [{ transform: 'rotate(0deg)' }, { transform: `rotate(${plan.targetRotationDeg}deg)` }],
        { duration: durationMs, easing: config.easing, fill: 'forwards' },
      )
      animationRef.current = animation

      // Track 2: geometry. Independent of rotation; only regenerates paths.
      if (config.morphs.length > 0) {
        const startedAt = performance.now()
        const tick = (now: number) => {
          const elapsed = Math.min(now - startedAt, config.durationMs)
          setDisplaySegments(applyMorphs(segments, config.morphs, elapsed))
          if (elapsed < config.durationMs) {
            frameRef.current = requestAnimationFrame(tick)
          }
        }
        frameRef.current = requestAnimationFrame(tick)
      }

      animation.finished
        .then(() => {
          setDisplaySegments(plan.landing)
          setIsSpinning(false)
          setWinnerId(plan.winnerId)
          onLanded?.(plan.winnerId)
        })
        .catch(() => {
          // The animation was cancelled (unmount, or a future re-target).
          setIsSpinning(false)
        })
    },
    [segments, config, isSpinning, onLanded],
  )

  return { displaySegments, isSpinning, winnerId, spin, rotorRef }
}
