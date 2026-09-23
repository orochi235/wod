import { type Overlay, createOverlay } from 'magicsmoke'
import type { OutageRun } from '../wheel/useSpin'
import { playBlackout } from './blackout'
import { type Kit, loadKit } from './kit'
import { BLOW_MS, escalation } from './schedule'
import { playOutage } from './sound'

export type FxOptions = {
  /** The element the sparks fly from: the wheel, or whatever holds it. */
  target: Element
  /** How dark the blackout gets, 0..1. */
  depth: number
  /** Whether this page makes the outage's noise at all. */
  sound: boolean
  muted: boolean
}

export type Fx = {
  /** Plays one outage from its start. Returns a stop that cuts it short. */
  play(run: OutageRun, options: FxOptions): () => void
  setMuted(muted: boolean): void
  dispose(): void
}

export type CreateFx = () => Fx

type Point = { x: number; y: number }

/** A point on the wheel's rim, `angle` radians from twelve o'clock, clockwise. */
function rimOf(target: Element): (angle: number) => Point {
  const box = target.getBoundingClientRect()
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const r = Math.min(box.width, box.height) * 0.45
  return (angle) => ({ x: cx + Math.sin(angle) * r, y: cy - Math.cos(angle) * r })
}

/**
 * The outage's effects: magicsmoke's sparks on the wheel's rim, the window's
 * blackout, and the passage it plays. One instance per page, reused across spins.
 */
export function createFx(): Fx {
  let overlay: Overlay | null = null
  let ctx: AudioContext | null = null
  let kit: Promise<Kit> | null = null
  let master: GainNode | null = null
  let muted = false

  const audio = () => {
    if (!ctx && typeof AudioContext === 'function') {
      ctx = new AudioContext()
      kit = loadKit(ctx)
    }
    return ctx
  }

  return {
    play(run, options) {
      muted = options.muted
      const timers: number[] = []
      const at = (ms: number, fn: () => void) =>
        timers.push(window.setTimeout(fn, Math.max(0, run.startedAt + ms - performance.now())))
      const { plan } = run
      const rim = rimOf(options.target)

      overlay ??= createOverlay({ sound: { muted: !options.sound || muted } })
      const sparks = overlay
      sparks.muted = !options.sound || muted
      let turn = 0
      // Each shot lands somewhere new on the rim, walking round it.
      const next = () => {
        turn += 2.39996
        return rim(turn)
      }

      let fault: ReturnType<Overlay['fault']> | null = null
      const sparkMs = plan.popAtMs - plan.sparkAtMs
      at(plan.sparkAtMs, () => {
        fault = sparks.fault({ at: next(), to: next(), intensity: 0.1 })
      })
      for (const shot of escalation(sparkMs)) {
        at(plan.sparkAtMs + shot.at, () => {
          if (fault) fault.intensity = Math.min(0.9, 0.1 + (0.8 * shot.at) / sparkMs)
          if (shot.kind === 'arc') sparks.arc(next(), next(), shot.energy)
          else sparks[shot.kind](next(), shot.energy)
        })
      }
      at(Math.max(plan.sparkAtMs, plan.popAtMs - BLOW_MS), () => {
        fault?.blow({ peak: Math.min(BLOW_MS, sparkMs), after: 400 })
      })

      const blackout = playBlackout(run.startedAt + plan.popAtMs - performance.now(), options.depth)

      let voice: GainNode | null = null
      let stopped = false
      const sound = options.sound ? audio() : null
      if (sound && kit) {
        void sound.resume()
        void kit.then((drums) => {
          if (stopped) return
          const lead = (run.startedAt + plan.popAtMs - performance.now()) / 1000
          voice = playOutage(sound, sound.currentTime + Math.max(0, lead), {
            kit: drums,
            volume: muted ? 0 : 0.6,
          })
          master = voice
        })
      }

      return () => {
        stopped = true
        for (const timer of timers) window.clearTimeout(timer)
        fault?.stop()
        blackout.stop()
        voice?.disconnect()
      }
    },

    setMuted(next) {
      muted = next
      if (overlay) overlay.muted = next
      if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.6, ctx.currentTime, 0.02)
    },

    dispose() {
      overlay?.dispose()
      overlay = null
      void ctx?.close()
      ctx = null
    },
  }
}
