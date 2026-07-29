import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMorphs } from './morph'
import type { SelectionStrategy } from './selection'
import { cryptoRng, weightedRandom } from './selection'
import { planSpin } from './spin'
import type { Segment, SpinConfig } from './types'

const REDUCED_MOTION_MS = 300

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
  const mountedRef = useRef(true)
  // A mutex. isSpinning is state read through a closure, so two spin() calls in
  // the same tick both observe false and both start a spin.
  const spinningRef = useRef(false)
  // Where the wheel came to rest, so the next spin continues from that angle
  // instead of teleporting back to zero before it starts turning.
  const rotationRef = useRef(0)

  const [displaySegments, setDisplaySegments] = useState(segments)
  const [isSpinning, setIsSpinning] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)

  useEffect(() => {
    // Resync only when the caller actually swaps the array, and never mid-spin —
    // that would wipe the landed state, which is the whole visual payoff when
    // weights morph. The ref is deliberately NOT advanced while spinning, so this
    // effect re-runs and applies the pending swap once isSpinning goes false.
    if (lastSegmentsRef.current === segments) return
    if (isSpinning) return
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
  }, [segments, isSpinning])

  const stopTracks = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    animationRef.current?.cancel()
    animationRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopTracks()
    }
  }, [stopTracks])

  const spin = useCallback(
    (strategy: SelectionStrategy = weightedRandom) => {
      if (spinningRef.current) return
      const rotor = rotorRef.current
      if (!rotor) return

      const plan = planSpin(segments, config, strategy, cryptoRng)
      if (!plan) return

      stopTracks()
      spinningRef.current = true
      setIsSpinning(true)
      setWinnerId(null)
      setDisplaySegments(segments)

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const durationMs = reduceMotion ? REDUCED_MOTION_MS : config.durationMs

      // Continue from the resting angle: add the requested revolutions plus
      // however much more is needed to bring the winner under the pointer.
      const from = rotationRef.current
      const delta = config.fullSpins * 360 + ((((plan.targetRotationDeg - from) % 360) + 360) % 360)
      const to = from + delta

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(
        [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }],
        { duration: durationMs, easing: config.easing, fill: 'forwards' },
      )
      animationRef.current = animation

      // Track 2: geometry. Independent of rotation; only regenerates paths.
      if (config.morphs.length > 0 && durationMs > 0) {
        const startedAt = performance.now()
        const tick = (now: number) => {
          const elapsed = Math.min(now - startedAt, durationMs)
          // Morphs are authored against config.durationMs, so the clock is scaled
          // to whatever duration actually ran. Without this, reduced motion lands
          // the rotation at 300ms while the morph keeps running for seconds, and
          // the wheel contradicts the announced winner the entire time.
          const morphElapsed = (elapsed / durationMs) * config.durationMs
          setDisplaySegments(applyMorphs(segments, config.morphs, morphElapsed))
          if (elapsed < durationMs) {
            frameRef.current = requestAnimationFrame(tick)
          }
        }
        frameRef.current = requestAnimationFrame(tick)
      }

      animation.finished
        .then(() => {
          if (!mountedRef.current || animationRef.current !== animation) return
          if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current)
            frameRef.current = null
          }
          rotationRef.current = to % 360
          spinningRef.current = false
          setDisplaySegments(plan.landing)
          setIsSpinning(false)
          setWinnerId(plan.winnerId)
          onLanded?.(plan.winnerId)
        })
        .catch(() => {
          // Cancelled — unmounted, or superseded by a newer spin.
          if (!mountedRef.current || animationRef.current !== animation) return
          spinningRef.current = false
          setIsSpinning(false)
        })
    },
    [segments, config, onLanded, stopTracks],
  )

  return { displaySegments, isSpinning, winnerId, spin, rotorRef }
}
