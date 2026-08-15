import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMorphs, landingSegments } from './morph'
import { invertTrack, rotationTrack } from './rotation'
import type { SelectionStrategy } from './selection'
import { cryptoRng, weightedRandom } from './selection'
import { planSpin } from './spin'
import type { Morph, Segment, SpinConfig } from './types'

export const REDUCED_MOTION_MS = 300

/**
 * Per-spin overrides. A resolved scripted spin supplies its own segments,
 * config, and winner for one spin without changing the hook's props — which
 * keeps `useSpin` ignorant of branching.
 */
export type SpinOverride = {
  segments?: Segment[]
  config?: SpinConfig
  strategy?: SelectionStrategy
  /**
   * Pass 2, run after the winner is drawn and before the rotation starts. The
   * returned list replaces the config's morphs outright — it is a whole
   * re-resolution, not a delta.
   */
  resolveLate?: (winnerId: string) => Morph[]
}

/** A resolved spin. `id` is fresh per landing, so the same winner twice is two landings. */
export type Landing = { id: number; winner: Segment }

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  /**
   * The geometry layouts resolve against. A morph changes weights every frame,
   * and re-walking a layout's ladder on each of them pops labels between
   * orientations mid-spin, so a held wheel resolves against where it will land.
   */
  layoutSegments: Segment[]
  isSpinning: boolean
  landing: Landing | null
  spin: (override?: SpinOverride) => void
  /**
   * Hands the geometry back to the live segments without redrawing: the landed
   * frame stays until something actually replaces it. For a consumer that knows
   * the landing has been seen — a dismissed reveal — where waiting for the next
   * spin would leave a live roster off the wheel indefinitely.
   */
  release: () => void
  /** Release, and drop the landing and its frame outright. */
  reset: () => void
  rotorRef: RefObject<SVGGElement | null>
  /** Registers a level group by segment id so a spin can counter-rotate it. */
  levelRef: (id: string, restingDeg: number) => (element: SVGGElement | null) => void
}

export function useSpin(segments: Segment[], config: SpinConfig): UseSpinResult {
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
  // Identity, not a winner id: the same segment winning twice must read as two
  // landings, or a dismissed reveal never reopens.
  const landingCountRef = useRef(0)

  const [displaySegments, setDisplaySegments] = useState(segments)
  const [layoutSegments, setLayoutSegments] = useState(segments)
  const [isSpinning, setIsSpinning] = useState(false)
  const [landing, setLanding] = useState<Landing | null>(null)
  // Whether a spin still owns the geometry. Tracked apart from `landing` so a
  // consumer can hand the wheel back to the roster while still announcing who
  // won.
  const [held, setHeld] = useState(false)

  useEffect(() => {
    // Resync only when the caller actually swaps the array, and never while a
    // spin owns the geometry — running or landed. A live roster republishes
    // mid-spin, and applying that would wipe the landed frame, which is the
    // whole visual payoff when weights morph. Nothing is lost by dropping the
    // swap: whatever releases the hold draws from the live prop itself.
    if (lastSegmentsRef.current === segments) return
    if (isSpinning || held) return
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
    setLayoutSegments(segments)
  }, [segments, isSpinning, held])

  // Registered by the wheel, the way useEnter collects its wedges: a spin needs
  // the elements themselves, and only the renderer knows where they are.
  const levels = useRef(new Map<string, { element: SVGGElement; restingDeg: number }>()).current
  const levelRefs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current

  const levelRef = useCallback(
    (id: string, restingDeg: number) => {
      let ref = levelRefs.get(id)
      if (!ref) {
        ref = (element) => {
          if (element) levels.set(id, { element, restingDeg })
          else levels.delete(id)
        }
        levelRefs.set(id, ref)
      }
      return ref
    },
    [levels, levelRefs],
  )

  const release = useCallback(() => setHeld(false), [])

  const reset = useCallback(() => {
    setHeld(false)
    setLanding(null)
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
    setLayoutSegments(segments)
  }, [segments])

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

      const lateMorphs = override.resolveLate?.(plan.winnerId)
      const morphs = lateMorphs ?? spinConfig.morphs
      // plan.landing was sampled from pass 1 and still shows the pre-swap
      // labels; landing on it would undo the trick as it fires.
      const landedFrame = lateMorphs
        ? landingSegments(spinSegments, lateMorphs, spinConfig.durationMs)
        : plan.landing

      stopTracks()
      spinningRef.current = true
      setIsSpinning(true)
      setLanding(null)
      setHeld(true)
      setDisplaySegments(spinSegments)
      setLayoutSegments(landedFrame)
      // The spin, not the effect, is what resolves a swap that arrived while the
      // wheel was held. Mark the props synced here so a later idle render does
      // not replay them as still pending. Deliberately the prop array rather
      // than spinSegments: an override is a one-spin substitution the caller
      // never published, so it must not count as having synced to it.
      lastSegmentsRef.current = segments

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const durationMs = reduceMotion ? REDUCED_MOTION_MS : spinConfig.durationMs

      const from = rotationRef.current
      const track = rotationTrack(from, plan.restingRotationDeg, spinConfig, durationMs)

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(track.keyframes, {
        duration: track.durationMs,
        easing: track.easing,
        fill: 'forwards',
      })
      animationRef.current = animation

      // Level elements hold their orientation by running the rotor's rotation
      // backwards on the same timeline. No per-frame work, and no drift: both
      // come from one track.
      for (const { element, restingDeg } of levels.values()) {
        element.animate(invertTrack(track, restingDeg), {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        })
      }

      // Track 2: geometry. Independent of rotation; only regenerates paths.
      if (morphs.length > 0 && durationMs > 0) {
        const startedAt = performance.now()
        const tick = (now: number) => {
          const elapsed = Math.min(now - startedAt, durationMs)
          // Morphs are authored against the spin's own durationMs, so the clock is scaled
          // to whatever duration actually ran. Without this, reduced motion lands
          // the rotation at 300ms while the morph keeps running for seconds, and
          // the wheel contradicts the announced winner the entire time.
          const morphElapsed = (elapsed / durationMs) * spinConfig.durationMs
          setDisplaySegments(applyMorphs(spinSegments, morphs, morphElapsed))
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
          rotationRef.current = ((track.to % 360) + 360) % 360
          spinningRef.current = false
          setDisplaySegments(landedFrame)
          setIsSpinning(false)
          const winner = landedFrame.find((segment) => segment.id === plan.winnerId)
          if (winner) {
            landingCountRef.current += 1
            setLanding({ id: landingCountRef.current, winner })
          }
        })
        .catch(() => {
          // Cancelled — unmounted, or superseded by a newer spin.
          if (!mountedRef.current || animationRef.current !== animation) return
          spinningRef.current = false
          setIsSpinning(false)
          // No landing came of it, so nothing is worth holding the wheel for.
          setHeld(false)
        })
    },
    [segments, config, stopTracks, levels],
  )

  return {
    displaySegments,
    layoutSegments,
    isSpinning,
    landing,
    spin,
    release,
    reset,
    rotorRef,
    levelRef,
  }
}
