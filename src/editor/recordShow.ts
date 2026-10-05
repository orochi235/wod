import { composeSegments } from '../clock/compose'
import { manualMotion } from '../clock/manual'
import { cueMorphs } from '../clock/morphVoices'
import type { WheelPose } from '../clock/motion'
import { WHEEL } from '../clock/motion'
import { blackoutVoice, darkVoice } from '../outage/voices'
import { angleVoice } from '../wheel/anglePatch'
import { arcs } from '../wheel/geometry'
import { type PegMode, pegAngles } from '../wheel/pegs'
import type { Show } from '../wheel/show'
import { trackFlapper } from '../wheel/trackFlapper'
import type { Segment } from '../wheel/types'

export const FRAME_MS = 1000 / 60

export type Recording = {
  durationMs: number
  at(ms: number): { wheel: WheelPose; segments: Segment[] }
}

export type RecordOptions = {
  /** The pegs the flapper meets; null for a look without a flapper. */
  pegs: PegMode | null
  depth: number
}

/**
 * Plays a show once on a clock of its own, at 60 fps, keeping history, so any
 * instant of it reads back exactly. Nothing it plays reaches the page.
 */
export function recordShow(show: Show, { pegs, depth }: RecordOptions): Recording {
  const durationMs = show.track.durationMs
  const { motion, step } = manualMotion({ historyMs: durationMs + 1000 })
  const { wheel, wedges, ticker } = motion
  wheel.cue(angleVoice(show.track, 0))
  if (show.outagePlan) {
    wheel.cue(darkVoice(show.outagePlan, 0))
    wheel.cue(blackoutVoice(depth, show.outagePlan.popAtMs))
  }
  if (show.morphs.length > 0) cueMorphs(wedges, show.segments, show.morphs, show.morphsAt)
  if (pegs) {
    trackFlapper(motion, {
      pegs: () => pegAngles(pegs, arcs(composeSegments(show.segments, wedges))),
      write: () => undefined,
      click: () => undefined,
    })
  }
  const release = ticker.stay()
  const frames = Math.ceil(durationMs / FRAME_MS)
  for (let i = 0; i <= frames; i++) step(i * FRAME_MS)
  release()
  return {
    durationMs,
    at(ms) {
      const t = Math.min(Math.max(0, ms), frames * FRAME_MS)
      return {
        wheel: wheel.project(t).probe(WHEEL),
        segments: composeSegments(show.segments, wedges.project(t)),
      }
    },
  }
}
