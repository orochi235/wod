import type { OutagePlan } from '../wheel/outage'
import { BLOW_MS, type Shot, escalation } from './schedule'

/** A spark more than this late is skipped: a hidden tab must not come back to a burst. */
export const STALE_MS = 250

export type SparkCue =
  | { at: number; kind: 'fault' }
  | { at: number; kind: 'shot'; shot: Shot; sparkMs: number }
  | { at: number; kind: 'blow'; sparkMs: number }

/** Every spark effect of one outage, in ms from the spin's start, in time order. */
export function sparkCues(plan: OutagePlan): SparkCue[] {
  const sparkMs = plan.popAtMs - plan.sparkAtMs
  const cues: SparkCue[] = [{ at: plan.sparkAtMs, kind: 'fault' }]
  for (const shot of escalation(sparkMs)) {
    cues.push({ at: plan.sparkAtMs + shot.at, kind: 'shot', shot, sparkMs })
  }
  cues.push({ at: Math.max(plan.sparkAtMs, plan.popAtMs - BLOW_MS), kind: 'blow', sparkMs })
  return cues.sort((a, b) => a.at - b.at)
}

/** The cues from `cursor` that are due at `elapsed`, minus those more than `staleMs` late. */
export function takeDue<T extends { at: number }>(
  cues: readonly T[],
  cursor: number,
  elapsed: number,
  staleMs: number,
): { fire: T[]; cursor: number } {
  const fire: T[] = []
  let next = cursor
  while (next < cues.length && cues[next].at <= elapsed) {
    if (elapsed - cues[next].at <= staleMs) fire.push(cues[next])
    next++
  }
  return { fire, cursor: next }
}
