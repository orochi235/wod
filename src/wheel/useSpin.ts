import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMorphs } from './morph'
import type { SelectionStrategy } from './selection'
import { cryptoRng, weightedRandom } from './selection'
import { planSpin } from './spin'
import type { Segment, SpinConfig } from './types'

const REDUCED_MOTION_MS = 300

/**
 * Per-spin overrides. A resolved scripted spin supplies its own segments,
 * config, and winner for one spin without changing the hook's props — which
 * keeps `useSpin` ignorant of branching.
 */
export type SpinOverride = {
  segments?: Segment[]
  config?: SpinConfig
  strategy?: SelectionStrategy
}

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  isSpinning: boolean
  winnerId: string | null
  spin: (override?: SpinOverride) => void
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
  const [landed, setLanded] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)

  useEffect(() => {
    // Resync only when the caller actually swaps the array, and never while a
    // spin owns the geometry — running or landed. A live roster republishes
    // mid-spin, and applying that would wipe the landed frame, which is the
    // whole visual payoff when weights morph. Nothing is lost by dropping the
    // swap: the next spin takes ownership and draws from the live prop itself.
    if (lastSegmentsRef.current === segments) return
    if (isSpinning || landed) return
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
  }, [segments, isSpinning, landed])

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
    (override: SpinOverride = {}) => {
      if (spinningRef.current) return
      const rotor = rotorRef.current
      if (!rotor) return

      const spinSegments = override.segments ?? segments
      const spinConfig = override.config ?? config
      const strategy = override.strategy ?? weightedRandom

      const plan = planSpin(spinSegments, spinConfig, strategy, cryptoRng)
      if (!plan) return

      stopTracks()
      spinningRef.current = true
      setIsSpinning(true)
      setLanded(false)
      setWinnerId(null)
      setDisplaySegments(spinSegments)
      // The spin, not the effect, is what resolves a swap that arrived while the
      // wheel was held. Mark the props synced here so a later idle render does
      // not replay them as still pending. Deliberately the prop array rather
      // than spinSegments: an override is a one-spin substitution the caller
      // never published, so it must not count as having synced to it.
      lastSegmentsRef.current = segments

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const durationMs = reduceMotion ? REDUCED_MOTION_MS : spinConfig.durationMs

      // Continue from the resting angle: add the requested revolutions plus
      // however much more is needed to bring the winner under the pointer, in
      // the requested direction.
      const from = rotationRef.current
      const forward = (((plan.restingRotationDeg - from) % 360) + 360) % 360
      // The % 360 matters: without it a `forward` of exactly zero becomes a
      // spurious extra revolution.
      const backward = (360 - forward) % 360
      const delta =
        spinConfig.direction === 'ccw'
          ? -(spinConfig.fullSpins * 360 + backward)
          : spinConfig.fullSpins * 360 + forward
      const to = from + delta

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(
        [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }],
        { duration: durationMs, easing: spinConfig.easing, fill: 'forwards' },
      )
      animationRef.current = animation

      // Track 2: geometry. Independent of rotation; only regenerates paths.
      if (spinConfig.morphs.length > 0 && durationMs > 0) {
        const startedAt = performance.now()
        const tick = (now: number) => {
          const elapsed = Math.min(now - startedAt, durationMs)
          // Morphs are authored against the spin's own durationMs, so the clock is scaled
          // to whatever duration actually ran. Without this, reduced motion lands
          // the rotation at 300ms while the morph keeps running for seconds, and
          // the wheel contradicts the announced winner the entire time.
          const morphElapsed = (elapsed / durationMs) * spinConfig.durationMs
          setDisplaySegments(applyMorphs(spinSegments, spinConfig.morphs, morphElapsed))
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
          // JavaScript's % keeps the sign of the dividend, so a counter-clockwise
          // spin would otherwise store a negative resting angle and the next spin
          // would start from a nonsense origin.
          rotationRef.current = ((to % 360) + 360) % 360
          spinningRef.current = false
          setDisplaySegments(plan.landing)
          setIsSpinning(false)
          setWinnerId(plan.winnerId)
          setLanded(true)
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
