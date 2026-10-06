import type { Handle } from '@msb235/blits'
import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { composeSegments, sameFrame } from '../clock/compose'
import { cueMorphs } from '../clock/morphVoices'
import type { Motion } from '../clock/motion'
import { angleVoice } from './anglePatch'
import type { OutagePlan } from './outage'
import type { PegMode } from './pegs'
import { type RotationTrack, invertTrack } from './rotation'
import { cryptoRng, weightedRandom } from './selection'
import type { SelectionStrategy } from './selection'
import { type Show, planShow } from './show'
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
  /** Set only by a look whose flapper can catch. Absent means it cannot. */
  catchPegs?: PegMode
}

/** A resolved spin. `id` is fresh per landing, so the same winner twice is two landings. */
export type Landing = { id: number; winner: Segment }

/**
 * An outage in flight. `startedAt` is the motion clock's time the spin began,
 * which every moment in `plan` counts from; `id` is fresh per spin.
 */
export type OutageRun = { id: number; plan: OutagePlan; startedAt: number }

export type UseSpinResult = {
  /** Segments as they currently appear, with any in-flight morph applied. */
  displaySegments: Segment[]
  /** The roster layouts resolve against, which a morph holds still. */
  layoutSegments: Segment[]
  isSpinning: boolean
  /**
   * Whether a spin owns the geometry. Outlives `isSpinning`: a landed frame is
   * held until the next spin.
   */
  held: boolean
  landing: Landing | null
  /** Set for the length of a spin that shorts out, for whatever plays its effects. */
  outage: OutageRun | null
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
  /** Registers a level group so a spin can counter-rotate it. */
  levelRef: (id: string, restingDeg: number) => (element: SVGGElement | null) => void
  /** Registers an element outside the rotor that should turn with it anyway. */
  riderRef: (element: SVGGElement | null) => void
  /**
   * The spin a press of Spin would make now, from where the wheel rests, drawn
   * the same way every time and at the authored length. Plays nothing.
   */
  preview: (override?: SpinOverride) => Show | null
  /**
   * Holds the rotor, its rider and its level groups `ms` into `track`, paused,
   * over whatever the last spin left; null hands them back. A spin takes them back too.
   */
  pose: (track: RotationTrack | null, ms?: number) => void
}

/** The preview's draw: a fixed one, so the scrubbed show stays put between plannings. */
const PREVIEW_RNG = () => 0.5

export function useSpin(segments: Segment[], config: SpinConfig, motion: Motion): UseSpinResult {
  const rotorRef = useRef<SVGGElement | null>(null)
  const morphVoicesRef = useRef<Handle<string>[]>([])
  const offMorphsRef = useRef<(() => void) | null>(null)
  const animationRef = useRef<Animation | null>(null)
  const angleVoiceRef = useRef<Handle<string> | null>(null)
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
  const [outage, setOutage] = useState<OutageRun | null>(null)
  const outageCountRef = useRef(0)

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

  // Registered by the wheel: a spin needs the elements themselves, and only the
  // renderer knows where they are. The angle is kept apart from the element
  // because the ref identity is stable — React calls it on mount and never
  // again, while a wedge moves whenever the roster changes.
  const levels = useRef(new Map<string, SVGGElement>()).current
  const restingDegs = useRef(new Map<string, number>()).current
  const levelRefs = useRef(new Map<string, (element: SVGGElement | null) => void>()).current

  const levelRef = useCallback(
    (id: string, restingDeg: number) => {
      restingDegs.set(id, restingDeg)
      let ref = levelRefs.get(id)
      if (!ref) {
        // The angle deliberately outlives the element. React detaches a ref
        // after the render that re-registered it, so deleting here would drop
        // an angle a remount had just written, and only `levels` is read.
        ref = (element) => {
          if (element) levels.set(id, element)
          else levels.delete(id)
        }
        levelRefs.set(id, ref)
      }
      return ref
    },
    [levels, restingDegs, levelRefs],
  )

  /**
   * An element that rides the rotation without living inside the rotor. The hub
   * cap is painted after the rotor so it sits over the sheen, which puts it out
   * of reach of the rotor's own transform; running the same track forwards is
   * what lets it turn with the wheel anyway. The mirror of a level element,
   * which runs that track backwards.
   */
  const rider = useRef<SVGGElement | null>(null)
  const riderAnimation = useRef<Animation | null>(null)
  const riderRef = useCallback((element: SVGGElement | null) => {
    rider.current = element
  }, [])

  const release = useCallback(() => setHeld(false), [])

  const reset = useCallback(() => {
    setHeld(false)
    setLanding(null)
    lastSegmentsRef.current = segments
    setDisplaySegments(segments)
    setLayoutSegments(segments)
  }, [segments])

  // A trick voice holds its last frame until faded, so whatever ends a spin fades them.
  const stopMorphs = useCallback(() => {
    offMorphsRef.current?.()
    offMorphsRef.current = null
    for (const voice of morphVoicesRef.current) voice.fade({ over: 0 })
    morphVoicesRef.current = []
  }, [])

  const posed = useRef<{ track: RotationTrack; animations: Animation[] } | null>(null)

  const pose = useCallback(
    (track: RotationTrack | null, ms = 0) => {
      if (posed.current && posed.current.track !== track) {
        for (const animation of posed.current.animations) animation.cancel()
        posed.current = null
      }
      if (!track) return
      if (!posed.current) {
        const timing = { duration: track.durationMs, easing: track.easing, fill: 'both' as const }
        const animations = [rotorRef.current, rider.current].flatMap((element) =>
          element ? [element.animate(track.keyframes, timing)] : [],
        )
        for (const [id, element] of levels) {
          animations.push(element.animate(invertTrack(track, restingDegs.get(id) ?? 0), timing))
        }
        for (const animation of animations) animation.pause()
        posed.current = { track, animations }
      }
      for (const animation of posed.current.animations) animation.currentTime = ms
    },
    [levels, restingDegs],
  )

  const preview = useCallback(
    (override: SpinOverride = {}) => {
      const spinConfig = override.config ?? config
      return planShow({
        segments: override.segments ?? segments,
        config: spinConfig,
        strategy: override.strategy,
        rng: PREVIEW_RNG,
        from: rotationRef.current,
        durationMs: spinConfig.durationMs,
        resolveLate: override.resolveLate,
        catchPegs: override.catchPegs,
      })
    },
    [segments, config],
  )

  const stopTracks = useCallback(() => {
    pose(null)
    stopMorphs()
    animationRef.current?.cancel()
    animationRef.current = null
    riderAnimation.current?.cancel()
    riderAnimation.current = null
    angleVoiceRef.current?.fade({ over: 0 })
    angleVoiceRef.current = null
  }, [stopMorphs, pose])

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

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const durationMs = reduceMotion ? REDUCED_MOTION_MS : spinConfig.durationMs
      // Reduced motion gets the plain spin: a blackout and a stall are exactly
      // the motion it asks to be spared.
      const show = planShow({
        segments: spinSegments,
        config: spinConfig,
        strategy,
        rng: cryptoRng,
        from: rotationRef.current,
        durationMs,
        outage: !reduceMotion,
        resolveLate: override.resolveLate,
        catchPegs: override.catchPegs,
      })
      if (!show) return
      const { plan, morphs, landedFrame, track, outagePlan } = show

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

      // The rotor and the wheel mix both read the document timeline; pinning
      // WAAPI's start to this same instant keeps the angle voice on the pixels.
      const startedAt = motion.ticker.now()
      if (outagePlan) {
        outageCountRef.current += 1
        setOutage({ id: outageCountRef.current, plan: outagePlan, startedAt })
      } else {
        setOutage(null)
      }

      // Track 1: rotation. One transform on one element, left to the compositor.
      const animation = rotor.animate(track.keyframes, {
        duration: track.durationMs,
        easing: track.easing,
        fill: 'forwards',
      })
      animation.startTime = startedAt
      animationRef.current = animation

      // Same track, same timeline: a rider turns with the wheel without being
      // inside it.
      const riding =
        rider.current?.animate(track.keyframes, {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        }) ?? null
      if (riding) riding.startTime = startedAt
      riderAnimation.current = riding

      // Level elements hold their orientation by running the rotor's rotation
      // backwards on the same timeline. No per-frame work, and no drift: both
      // come from one track.
      for (const [id, element] of levels) {
        element.animate(invertTrack(track, restingDegs.get(id) ?? 0), {
          duration: track.durationMs,
          easing: track.easing,
          fill: 'forwards',
        }).startTime = startedAt
      }

      angleVoiceRef.current = motion.wheel.cue(angleVoice(track, startedAt))

      // Track 2: geometry, on the wedge mix. Morphs are authored against the spin's own
      // durationMs, so a shortened spin plays them faster rather than cutting them off.
      if (morphs.length > 0 && durationMs > 0) {
        const { ticker, wedges } = motion
        morphVoicesRef.current = cueMorphs(
          wedges,
          spinSegments,
          morphs,
          startedAt + show.morphsAt,
          spinConfig.durationMs / durationMs,
        )
        let shown = spinSegments
        offMorphsRef.current = ticker.after(() => {
          const next = composeSegments(spinSegments, wedges)
          if (sameFrame(next, shown)) return
          shown = next
          setDisplaySegments(next)
        })
      }

      animation.finished
        .then(() => {
          if (!mountedRef.current || animationRef.current !== animation) return
          stopMorphs()
          // JavaScript's % keeps the sign of the dividend, so a counter-clockwise
          // spin would otherwise store a negative resting angle and the next spin
          // would start from a nonsense origin.
          rotationRef.current = ((track.to % 360) + 360) % 360
          spinningRef.current = false
          setDisplaySegments(landedFrame)
          setIsSpinning(false)
          setOutage(null)
          const winner = landedFrame.find((segment) => segment.id === plan.winnerId)
          if (winner) {
            landingCountRef.current += 1
            setLanding({ id: landingCountRef.current, winner })
          }
        })
        .catch(() => {
          // Cancelled — unmounted, or superseded by a newer spin.
          if (!mountedRef.current || animationRef.current !== animation) return
          stopMorphs()
          spinningRef.current = false
          setIsSpinning(false)
          setOutage(null)
          // No landing came of it, so nothing is worth holding the wheel for.
          setHeld(false)
        })
    },
    [segments, config, stopTracks, stopMorphs, levels, restingDegs, motion],
  )

  return {
    displaySegments,
    layoutSegments,
    isSpinning,
    held,
    landing,
    outage,
    spin,
    release,
    reset,
    rotorRef,
    levelRef,
    riderRef,
    preview,
    pose,
  }
}
